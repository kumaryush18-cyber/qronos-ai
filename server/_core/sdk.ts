import { AXIOS_TIMEOUT_MS, COOKIE_NAME, DEFAULT_SESSION_MAX_AGE_MS, decodeOAuthState } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import axios, { type AxiosInstance } from "axios";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { ENV } from "./env";

const revokedTokenHashes = new Set<string>();
const nonRevokedTokenHashes = new Map<string, number>();

interface CachedAuthenticatedSession {
  user: AuthenticatedUser;
  sessionVersion: number;
  openId: string;
  expiresAt: number;
}
const SESSION_AUTH_CACHE = new Map<string, CachedAuthenticatedSession>();

export function clearSessionAuthCache(openIdOrToken?: string) {
  if (!openIdOrToken) {
    SESSION_AUTH_CACHE.clear();
    nonRevokedTokenHashes.clear();
    return;
  }
  SESSION_AUTH_CACHE.delete(openIdOrToken);
  for (const [key, val] of SESSION_AUTH_CACHE.entries()) {
    if (val.openId === openIdOrToken) {
      SESSION_AUTH_CACHE.delete(key);
    }
  }
}
export const invalidateSessionAuthCache = clearSessionAuthCache;

export function revokeSessionToken(token: string | undefined | null) {
  if (!token || typeof token !== "string") return;
  const trimmed = token.trim();
  const hash = createHash("sha256").update(trimmed).digest("hex");
  revokedTokenHashes.add(hash);
  nonRevokedTokenHashes.delete(hash);
  SESSION_AUTH_CACHE.delete(trimmed);
  void db.recordRevokedSessionTokenHash(hash).catch(() => undefined);
}

export async function isSessionTokenRevoked(token: string | undefined | null): Promise<boolean> {
  if (!token || typeof token !== "string") return false;
  const trimmed = token.trim();
  const hash = createHash("sha256").update(trimmed).digest("hex");
  if (revokedTokenHashes.has(hash)) return true;

  const cachedNonRevoked = nonRevokedTokenHashes.get(hash);
  if (cachedNonRevoked && Date.now() < cachedNonRevoked) return false;

  const inDb = typeof db.isRevokedSessionTokenHashInDb === "function"
    ? await db.isRevokedSessionTokenHashInDb(hash)
    : false;
  if (inDb) {
    revokedTokenHashes.add(hash);
    nonRevokedTokenHashes.delete(hash);
    SESSION_AUTH_CACHE.delete(trimmed);
    return true;
  }
  nonRevokedTokenHashes.set(hash, Date.now() + 60_000);
  return false;
}
import type {
  ExchangeTokenRequest,
  ExchangeTokenResponse,
  GetUserInfoResponse,
  GetUserInfoWithJwtRequest,
  GetUserInfoWithJwtResponse,
} from "./types/manusTypes";
// Utility function
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

export type SessionPayload = {
  openId: string;
  appId: string;
  name: string;
  sessionVersion?: number;
  isAdminSession?: boolean;
};

const EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
const GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
const GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;

class OAuthService {
  constructor(private client: ReturnType<typeof axios.create>) {
    if (ENV.oAuthServerUrl) {
      console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    }
  }

  private decodeState(state: string): string {
    return decodeOAuthState(state).redirectUri;
  }

  async getTokenByCode(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    if (!ENV.oAuthServerUrl) {
      throw new Error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
    const payload: ExchangeTokenRequest = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state),
    };

    const { data } = await this.client.post<ExchangeTokenResponse>(
      EXCHANGE_TOKEN_PATH,
      payload
    );

    return data;
  }

  async getUserInfoByToken(
    token: ExchangeTokenResponse
  ): Promise<GetUserInfoResponse> {
    if (!ENV.oAuthServerUrl) {
      throw new Error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
    const { data } = await this.client.post<GetUserInfoResponse>(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken,
      }
    );

    return data;
  }
}

const createOAuthHttpClient = (): AxiosInstance =>
  axios.create({
    baseURL: ENV.oAuthServerUrl,
    timeout: AXIOS_TIMEOUT_MS,
  });

class SDKServer {
  private readonly client: AxiosInstance;
  private readonly oauthService: OAuthService;

  constructor(client: AxiosInstance = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }

  private deriveLoginMethod(
    platforms: unknown,
    fallback: string | null | undefined
  ): string | null {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set<string>(
      platforms.filter((p): p is string => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (
      set.has("REGISTERED_PLATFORM_MICROSOFT") ||
      set.has("REGISTERED_PLATFORM_AZURE")
    )
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }

  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(
    code: string,
    state: string
  ): Promise<ExchangeTokenResponse> {
    return this.oauthService.getTokenByCode(code, state);
  }

  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken: string): Promise<GetUserInfoResponse> {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken,
    } as ExchangeTokenResponse);
    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoResponse;
  }

  private parseCookies(cookieHeader: string | undefined) {
    if (!cookieHeader) {
      return new Map<string, string>();
    }

    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }

  revokeSessionToken(token: string | undefined | null) {
    revokeSessionToken(token);
  }

  private getSessionSecret() {
    const secret = ENV.cookieSecret || process.env.JWT_SECRET || "qronos-session-secret-fallback-minimum-32-chars-key";
    return new TextEncoder().encode(secret);
  }

  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(
    openId: string,
    options: { expiresInMs?: number; name?: string; sessionVersion?: number; isAdminSession?: boolean } = {}
  ): Promise<string> {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || "",
        sessionVersion: options.sessionVersion ?? 0,
        isAdminSession: options.isAdminSession === true,
      },
      options
    );
  }

  async signSession(
    payload: SessionPayload,
    options: { expiresInMs?: number } = {}
  ): Promise<string> {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? DEFAULT_SESSION_MAX_AGE_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
    const secretKey = this.getSessionSecret();

    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name,
      sessionVersion: payload.sessionVersion ?? 0,
      isAdminSession: payload.isAdminSession === true,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(expirationSeconds)
      .sign(secretKey);
  }

  async verifySession(
    cookieValue: string | undefined | null
  ): Promise<{ openId: string; appId: string; name: string; sessionVersion: number; isAdminSession: boolean } | null> {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }

    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"],
      });
      const { openId, appId, name, sessionVersion, isAdminSession } = payload as Record<string, unknown>;

      // appId is a legacy Manus identifier and is empty in first-party deployments;
      // only openId and name are required to identify a session.
      if (
        !isNonEmptyString(openId) ||
        typeof appId !== "string" ||
        !isNonEmptyString(name)
      ) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }

      return {
        openId,
        appId,
        name,
        sessionVersion: typeof sessionVersion === "number" && Number.isSafeInteger(sessionVersion) && sessionVersion >= 0 ? sessionVersion : 0,
        isAdminSession: isAdminSession === true,
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }

  async getUserInfoWithJwt(
    jwtToken: string
  ): Promise<GetUserInfoWithJwtResponse> {
    const payload: GetUserInfoWithJwtRequest = {
      jwtToken,
      projectId: ENV.appId,
    };

    const { data } = await this.client.post<GetUserInfoWithJwtResponse>(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );

    const loginMethod = this.deriveLoginMethod(
      (data as any)?.platforms,
      (data as any)?.platform ?? data.platform ?? null
    );
    return {
      ...(data as any),
      platform: loginMethod,
      loginMethod,
    } as GetUserInfoWithJwtResponse;
  }

  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    // 1. Prefer the session cookie (regular OAuth login).
    const cookies = this.parseCookies(req.headers.cookie);
    let sessionToken = cookies.get(COOKIE_NAME);

    // 2. Fallback to the Authorization header (Preview auto-login via
    //    sessionStorage), used when the browser blocks iframe cookies such as
    //    Safari ITP, private browsing, or iOS/Android WebView.
    if (!sessionToken) {
      const authHeader = req.headers.authorization;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7);
      }
    }

    if (!sessionToken) {
      throw ForbiddenError("Invalid session cookie");
    }

    const trimmedToken = sessionToken.trim();

    // Check fast in-memory session cache (bypasses 3 SQL queries per request)
    const cached = SESSION_AUTH_CACHE.get(trimmedToken);
    if (cached && Date.now() < cached.expiresAt) {
      const currentVersion = await db.getAuthSessionVersion();
      const hash = createHash("sha256").update(trimmedToken).digest("hex");
      if (cached.sessionVersion === currentVersion && !revokedTokenHashes.has(hash)) {
        return cached.user;
      }
      SESSION_AUTH_CACHE.delete(trimmedToken);
    }

    const session = await this.verifySession(trimmedToken);

    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }

    if (await isSessionTokenRevoked(trimmedToken)) {
      throw ForbiddenError("Session has been revoked");
    }

    if (session.openId.startsWith(CRON_OPEN_ID_PREFIX)) {
      const userInfo = await this.getUserInfoWithJwt(trimmedToken);
      const taskUid = userInfo.taskUid ?? null;
      if (!taskUid) {
        throw ForbiddenError("Cron session missing task_uid");
      }
      return buildCronUser(userInfo);
    }

    const currentSessionVersion = await db.getAuthSessionVersion();
    if (session.sessionVersion !== currentSessionVersion) {
      throw ForbiddenError("Session has been revoked");
    }

    const sessionUserId = session.openId;
    let user = await db.getUserByOpenId(sessionUserId);

    if (!user && session.isAdminSession && (session.openId === db.ADMIN_SESSION_PRINCIPAL_OPEN_ID || session.name.includes("Administrator"))) {
      user = db.FALLBACK_ADMIN_SESSION_PRINCIPAL;
    }

    // If user not in DB, sync from OAuth server automatically
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(trimmedToken);
        await db.upsertUser({
          openId: userInfo.openId,
          name: userInfo.name || null,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: new Date(),
        });
        user = await db.getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }

    if (!user) {
      throw ForbiddenError("User not found");
    }

    const authUser: AuthenticatedUser = { ...user, isAdminSession: session.isAdminSession };

    // Prune bounded cache if needed
    if (SESSION_AUTH_CACHE.size > 5000) {
      const now = Date.now();
      for (const [k, v] of SESSION_AUTH_CACHE.entries()) {
        if (v.expiresAt <= now) SESSION_AUTH_CACHE.delete(k);
      }
      if (SESSION_AUTH_CACHE.size > 5000) SESSION_AUTH_CACHE.clear();
    }

    if (trimmedToken) {
      SESSION_AUTH_CACHE.set(trimmedToken, {
        user: authUser,
        sessionVersion: currentSessionVersion,
        openId: session.openId,
        expiresAt: Date.now() + 60_000,
      });
    }

    return authUser;
  }
}

const CRON_OPEN_ID_PREFIX = "cron_";

/** Result of `sdk.authenticateRequest`. Cron callbacks set `isCron=true` and `taskUid`; see `/home/ubuntu/skills/webdev-periodic-updates/SKILL.md`. */
export type AuthenticatedUser = User & {
  /** Persisted account-control state after a server-side Discord guild check. */
  discordVerifiedAt?: Date | null;
  taskUid?: string;
  isCron?: boolean;
  isAdminSession?: boolean;
};

function buildCronUser(
  userInfo: GetUserInfoWithJwtResponse
): AuthenticatedUser {
  const now = new Date();
  return {
    id: -1,
    openId: userInfo.openId,
    name: userInfo.name || "Manus Scheduled Task",
    email: null,
    loginMethod: null,
    role: "user",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
    taskUid: userInfo.taskUid ?? undefined,
    isCron: true,
  } as AuthenticatedUser;
}

export const sdk = new SDKServer();
