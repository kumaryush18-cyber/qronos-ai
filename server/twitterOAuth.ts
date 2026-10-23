import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Express, Request, Response } from "express";
import { sdk } from "./_core/sdk";
import { getSessionCookieOptions } from "./_core/cookies";
import { ENV } from "./_core/env";
import {
  getUserTwitterRewardStatus,
  claimTwitterReward,
  getTwitterRewardConfig,
  formatTweetExact300,
  getOrCreateReferralCode,
} from "./db";

const TWITTER_AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";
const TWITTER_ME_URL = "https://api.twitter.com/2/users/me";
const TWITTER_TWEET_URL = "https://api.twitter.com/2/tweets";

const TWITTER_STATE_COOKIE = "tf_twitter_oauth_state";
const TWITTER_VERIFIER_COOKIE = "tf_twitter_oauth_verifier";
const TWITTER_USER_COOKIE = "tf_twitter_oauth_user_id";

function appOrigin(req: Request): string {
  const forwardedProto = req.headers["x-forwarded-proto"];
  const forwardedHost = req.headers["x-forwarded-host"];
  const proto = typeof forwardedProto === "string" ? forwardedProto.split(",")[0].trim() : req.protocol;
  const host = typeof forwardedHost === "string" ? forwardedHost.split(",")[0].trim() : req.get("host");

  if (host) {
    return `${proto}://${host}`;
  }

  const configuredOrigin = process.env.QRONOS_PUBLIC_ORIGIN?.trim() || process.env.APP_URL?.trim();
  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {}
  }

  return "https://qronos.me";
}

function callbackUrl(req: Request): string {
  const origin = appOrigin(req);
  return `${origin}/api/auth/twitter/callback`;
}

function oauthCookieOptions(req: Request) {
  const sessionOptions = getSessionCookieOptions(req);
  return {
    ...sessionOptions,
    path: "/api/auth/twitter",
    sameSite: sessionOptions.secure ? ("none" as const) : ("lax" as const),
    maxAge: 10 * 60 * 1_000, // 10 minutes
  };
}

function clearOAuthCookies(req: Request, res: Response) {
  const options = oauthCookieOptions(req);
  const { maxAge, ...clearOptions } = options;
  res.clearCookie(TWITTER_STATE_COOKIE, clearOptions);
  res.clearCookie(TWITTER_VERIFIER_COOKIE, clearOptions);
  res.clearCookie(TWITTER_USER_COOKIE, clearOptions);
}

function randomUrlToken() {
  return randomBytes(32).toString("base64url");
}

function codeChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

function constantTimeEquals(left: string | undefined, right: string | undefined) {
  if (!left || !right || left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

export function buildTwitterAuthorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  verifier: string;
}) {
  const url = new URL(TWITTER_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", "tweet.read tweet.write users.read offline.access");
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", codeChallenge(input.verifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export function registerTwitterOAuthRoutes(app: Express) {
  // 1. Authorize redirect endpoint
  app.get("/api/auth/twitter", async (req: Request, res: Response) => {
    try {
      // Must be authenticated with Qronos session to earn rewards
      const user = await sdk.authenticateRequest(req).catch(() => null);
      if (!user) {
        return res.redirect("/signin?redirect=/dashboard/x-rewards");
      }

      // Check 12-hour cooldown before even redirecting to Twitter
      const status = await getUserTwitterRewardStatus(user.id);
      if (!status.canPost) {
        const remainingMinutes = Math.ceil(status.remainingCooldownSeconds / 60);
        return res.redirect(
          `/dashboard/x-rewards?twitter_reward=cooldown&remaining_min=${remainingMinutes}`
        );
      }

      const clientId = ENV.twitterClientId || process.env.TWITTER_CLIENT_ID;
      if (!clientId) {
        return res.status(500).send("Twitter OAuth2 is not configured on this server.");
      }

      const state = randomUrlToken();
      const verifier = randomUrlToken();
      const redirectUri = callbackUrl(req);
      const cookieOptions = oauthCookieOptions(req);

      res.cookie(TWITTER_STATE_COOKIE, state, cookieOptions);
      res.cookie(TWITTER_VERIFIER_COOKIE, verifier, cookieOptions);
      res.cookie(TWITTER_USER_COOKIE, String(user.id), cookieOptions);

      const authUrl = buildTwitterAuthorizationUrl({
        clientId,
        redirectUri,
        state,
        verifier,
      });

      return res.redirect(authUrl);
    } catch (error: any) {
      console.error("[TwitterOAuth] Authorize error:", error);
      return res.redirect(`/dashboard/x-rewards?twitter_reward=error&message=${encodeURIComponent(error?.message || "Auth error")}`);
    }
  });

  // 2. Callback endpoint
  app.get(["/api/auth/twitter/callback", "/api/auth/twitter/callback/"], async (req: Request, res: Response) => {
    try {
      const stateParam = typeof req.query.state === "string" ? req.query.state : undefined;
      const codeParam = typeof req.query.code === "string" ? req.query.code : undefined;
      const errorParam = typeof req.query.error === "string" ? req.query.error : undefined;

      if (errorParam) {
        clearOAuthCookies(req, res);
        return res.redirect(`/dashboard/x-rewards?twitter_reward=declined&error=${encodeURIComponent(errorParam)}`);
      }

      const cookies = parseCookieHeader(req.headers.cookie ?? "");
      const storedState = cookies[TWITTER_STATE_COOKIE];
      const storedVerifier = cookies[TWITTER_VERIFIER_COOKIE];
      const storedUserIdStr = cookies[TWITTER_USER_COOKIE];

      if (!storedState || !storedVerifier || !constantTimeEquals(stateParam, storedState)) {
        clearOAuthCookies(req, res);
        return res.redirect("/dashboard/x-rewards?twitter_reward=error&message=invalid_oauth_state");
      }

      const userId = Number.parseInt(storedUserIdStr || "0", 10);
      if (!userId || userId <= 0) {
        clearOAuthCookies(req, res);
        return res.redirect("/dashboard/x-rewards?twitter_reward=error&message=session_expired");
      }

      if (!codeParam) {
        clearOAuthCookies(req, res);
        return res.redirect("/dashboard/x-rewards?twitter_reward=error&message=no_authorization_code");
      }

      // Check 12-hour cooldown again (prevents race conditions)
      const currentStatus = await getUserTwitterRewardStatus(userId);
      if (!currentStatus.canPost) {
        clearOAuthCookies(req, res);
        const remMin = Math.ceil(currentStatus.remainingCooldownSeconds / 60);
        return res.redirect(`/dashboard/x-rewards?twitter_reward=cooldown&remaining_min=${remMin}`);
      }

      const clientId = ENV.twitterClientId || process.env.TWITTER_CLIENT_ID || "";
      const clientSecret = ENV.twitterClientSecret || process.env.TWITTER_CLIENT_SECRET || "";
      const redirectUri = callbackUrl(req);

      // Exchange authorization code for User Access Token
      const tokenBody = new URLSearchParams({
        code: codeParam,
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: storedVerifier,
      });

      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      const tokenRes = await fetch(TWITTER_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${basicAuth}`,
        },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        const errorText = await tokenRes.text();
        console.error("[TwitterOAuth] Token exchange failed:", tokenRes.status, errorText);
        clearOAuthCookies(req, res);
        return res.redirect(`/dashboard/x-rewards?twitter_reward=error&message=token_exchange_failed`);
      }

      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      const grantedScope = String(tokenData.scope || "");
      console.log(`[TwitterOAuth] Token received for userId ${userId}. Granted scopes: "${grantedScope}"`);

      if (!accessToken) {
        clearOAuthCookies(req, res);
        return res.redirect(`/dashboard/x-rewards?twitter_reward=error&message=no_access_token_returned`);
      }

      if (grantedScope && (!grantedScope.includes("tweet.write") || !grantedScope.includes("tweet.read"))) {
        console.warn(`[TwitterOAuth] WARNING: Granted scopes "${grantedScope}" do not contain both "tweet.write" and "tweet.read". User needs to re-authorize with full permissions.`);
      }

      // Fetch Twitter user details
      const meRes = await fetch(TWITTER_ME_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      let twitterUserId = "unknown";
      let twitterUsername = "unknown";
      if (meRes.ok) {
        const meData = await meRes.json();
        twitterUserId = meData?.data?.id || "unknown";
        twitterUsername = meData?.data?.username || "unknown";
      }

      // Select active slot template and format to compliant Twitter length with user's referral code
      const referralCodeObj = await getOrCreateReferralCode(userId);
      const userRefCode = referralCodeObj.code || "qr01";
      const config = await getTwitterRewardConfig();

      const activeSlots = config.slots.filter((s) => s.enabled);
      const slotIndexToUse = activeSlots.length > 0
        ? (currentStatus.totalPostsCount % activeSlots.length)
        : 0;
      const selectedSlot = activeSlots[slotIndexToUse] || config.slots[0];

      const exact300Tweet = formatTweetExact300(selectedSlot.templateText, userRefCode);

      // Post tweet via Twitter API v2
      const tweetRes = await fetch(TWITTER_TWEET_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text: exact300Tweet }),
      });

      if (!tweetRes.ok) {
        const tweetErr = await tweetRes.text();
        console.error(`[TwitterOAuth] Post tweet failed (${tweetRes.status}):`, tweetErr, `(Tweet length: ${exact300Tweet.length}, Granted scopes: "${grantedScope}")`);
        clearOAuthCookies(req, res);
        let errorMsg = "tweet_post_failed";
        if (tweetRes.status === 403) {
          if (grantedScope && !grantedScope.includes("tweet.write")) {
            errorMsg = "missing_write_permissions_please_reconnect_app";
          } else {
            errorMsg = "twitter_403_forbidden_check_permissions";
          }
        }
        return res.redirect(`/dashboard/x-rewards?twitter_reward=error&message=${encodeURIComponent(errorMsg)}`);
      }

      const tweetData = await tweetRes.json();
      const tweetId = tweetData?.data?.id || "unknown";

      // Claim reward & load 12-hour balance (anti-stacking)
      const grantResult = await claimTwitterReward({
        userId,
        twitterUserId,
        twitterUsername,
        tweetId,
        tweetText: exact300Tweet,
        slotIndex: selectedSlot.slotIndex,
      });

      clearOAuthCookies(req, res);

      const successParams = new URLSearchParams({
        twitter_reward: "success",
        tweet_id: tweetId,
        tokens_m: String(grantResult.tokensMillion),
        payg_usd: String(grantResult.paygDollars),
      });

      return res.redirect(`/dashboard/x-rewards?${successParams.toString()}`);
    } catch (error: any) {
      console.error("[TwitterOAuth] Callback error:", error);
      clearOAuthCookies(req, res);
      return res.redirect(`/dashboard/x-rewards?twitter_reward=error&message=${encodeURIComponent(error?.message || "Unknown error")}`);
    }
  });
}
