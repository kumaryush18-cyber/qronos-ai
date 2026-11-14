import type { Request } from "express";
import geoip from "geoip-lite";
import { getDb } from "./db";
import { platformSettings, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
const USER_GEO_REGISTRY_KEY = "user_geo_registry";

export function getCountryFlagEmoji(countryCode?: string | null): string {
  if (!countryCode || countryCode.length !== 2) return "🌐";
  const code = countryCode.toUpperCase();
  const first = 127397 + code.charCodeAt(0);
  const second = 127397 + code.charCodeAt(1);
  return String.fromCodePoint(first, second);
}

export function getCountryName(countryCode?: string | null): string {
  if (!countryCode || countryCode.length !== 2) return "Global / Unknown";
  const code = countryCode.toUpperCase();
  try {
    return regionNames.of(code) || code;
  } catch {
    return code;
  }
}

export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first && !isPrivateIp(first)) return first;
  } else if (Array.isArray(forwarded) && forwarded[0]) {
    const first = forwarded[0].trim();
    if (first && !isPrivateIp(first)) return first;
  }

  const realIp = req.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.trim() && !isPrivateIp(realIp.trim())) {
    return realIp.trim();
  }

  const socketIp = req.socket?.remoteAddress;
  if (socketIp && !isPrivateIp(socketIp)) {
    return socketIp.replace(/^::ffff:/, "");
  }

  return null;
}

function isPrivateIp(ip: string): boolean {
  const clean = ip.replace(/^::ffff:/, "").trim();
  if (clean === "127.0.0.1" || clean === "::1" || clean === "localhost") return true;
  if (clean.startsWith("10.") || clean.startsWith("192.168.")) return true;
  const match172 = clean.match(/^172\.(\d+)\./);
  if (match172) {
    const second = Number(match172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function resolveCountryFromRequest(req: Request): {
  countryCode: string;
  countryName: string;
  flagEmoji: string;
  source: "cloudflare" | "geoip" | "default";
} {
  // 1. Check Cloudflare CF-IPCountry header
  const cfCountry = req.headers["cf-ipcountry"];
  if (typeof cfCountry === "string" && cfCountry.length === 2 && cfCountry !== "XX" && cfCountry !== "T1") {
    const code = cfCountry.toUpperCase();
    return {
      countryCode: code,
      countryName: getCountryName(code),
      flagEmoji: getCountryFlagEmoji(code),
      source: "cloudflare",
    };
  }

  // 2. Check x-country header
  const xCountry = req.headers["x-country"];
  if (typeof xCountry === "string" && xCountry.length === 2) {
    const code = xCountry.toUpperCase();
    return {
      countryCode: code,
      countryName: getCountryName(code),
      flagEmoji: getCountryFlagEmoji(code),
      source: "cloudflare",
    };
  }

  // 3. Fallback to GeoIP lookup
  const clientIp = extractClientIp(req);
  if (clientIp) {
    try {
      const geo = geoip.lookup(clientIp);
      if (geo?.country && geo.country.length === 2) {
        const code = geo.country.toUpperCase();
        return {
          countryCode: code,
          countryName: getCountryName(code),
          flagEmoji: getCountryFlagEmoji(code),
          source: "geoip",
        };
      }
    } catch {
      // GeoIP fallback
    }
  }

  return {
    countryCode: "IN",
    countryName: "India",
    flagEmoji: "🇮🇳",
    source: "default",
  };
}

export type UserGeoEntry = {
  code: string;
  name: string;
  updatedAt: string;
};

let inMemoryGeoRegistry: Record<string, UserGeoEntry> | null = null;

export async function getUserGeoRegistry(): Promise<Record<string, UserGeoEntry>> {
  if (inMemoryGeoRegistry !== null) {
    return inMemoryGeoRegistry;
  }

  try {
    const db = await getDb();
    if (db) {
      const row = (
        await db
          .select({ value: platformSettings.value })
          .from(platformSettings)
          .where(eq(platformSettings.settingKey, USER_GEO_REGISTRY_KEY))
          .limit(1)
      )[0];

      if (row?.value) {
        inMemoryGeoRegistry = JSON.parse(row.value) as Record<string, UserGeoEntry>;
        return inMemoryGeoRegistry;
      }
    }
  } catch (err) {
    console.warn("[geo] Could not load user geo registry from platformSettings:", err);
  }

  inMemoryGeoRegistry = {};
  return inMemoryGeoRegistry;
}

export async function recordUserGeo(userId: number, countryCode: string, countryName?: string): Promise<void> {
  if (!userId) return;

  const registry = await getUserGeoRegistry();
  const code = (countryCode || "IN").toUpperCase().slice(0, 8);
  const name = countryName || getCountryName(code);

  registry[String(userId)] = {
    code,
    name,
    updatedAt: new Date().toISOString(),
  };

  try {
    const db = await getDb();
    if (db) {
      await db
        .insert(platformSettings)
        .values({
          settingKey: USER_GEO_REGISTRY_KEY,
          value: JSON.stringify(registry),
          updatedAt: new Date(),
        })
        .onDuplicateKeyUpdate({
          set: {
            value: JSON.stringify(registry),
            updatedAt: new Date(),
          },
        });
    }
  } catch (err) {
    console.warn(`[geo] Failed to persist geo for user ${userId}:`, err);
  }
}

export type CountryDistributionItem = {
  countryCode: string;
  countryName: string;
  flagEmoji: string;
  totalUsers: number;
  activeUsers7d: number;
  activeUsers30d: number;
  activityRatePercent: number;
};

export async function getCountryDistribution(): Promise<{
  totalTracked: number;
  totalActive7d: number;
  globalActiveRate: number;
  items: CountryDistributionItem[];
}> {
  const db = await getDb();
  if (!db) {
    return { totalTracked: 0, totalActive7d: 0, globalActiveRate: 0, items: [] };
  }

  try {
    const registry = await getUserGeoRegistry();
    const userRows = await db
      .select({
        id: users.id,
        email: users.email,
        lastSignedIn: users.lastSignedIn,
      })
      .from(users);

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const countryMap = new Map<
      string,
      {
        countryCode: string;
        countryName: string;
        totalUsers: number;
        activeUsers7d: number;
        activeUsers30d: number;
      }
    >();

    for (const u of userRows) {
      let geo = registry[String(u.id)];
      if (!geo) {
        const emailLower = (u.email || "").toLowerCase();
        if (emailLower.includes("thrad") || emailLower.includes("gravity")) {
          geo = { code: "US", name: "United States", updatedAt: new Date().toISOString() };
        } else {
          geo = { code: "IN", name: "India", updatedAt: new Date().toISOString() };
        }
      }

      const signedInTime = u.lastSignedIn ? new Date(u.lastSignedIn).getTime() : 0;
      const isActive7d = now - signedInTime <= sevenDaysMs;
      const isActive30d = now - signedInTime <= thirtyDaysMs;

      const existing = countryMap.get(geo.code) || {
        countryCode: geo.code,
        countryName: geo.name,
        totalUsers: 0,
        activeUsers7d: 0,
        activeUsers30d: 0,
      };

      existing.totalUsers += 1;
      if (isActive7d) existing.activeUsers7d += 1;
      if (isActive30d) existing.activeUsers30d += 1;

      countryMap.set(geo.code, existing);
    }

    let totalTracked = 0;
    let totalActive7d = 0;

    const items: CountryDistributionItem[] = Array.from(countryMap.values())
      .map((item) => {
        totalTracked += item.totalUsers;
        totalActive7d += item.activeUsers7d;
        const rate = item.totalUsers > 0 ? Math.round((item.activeUsers7d / item.totalUsers) * 100) : 0;

        return {
          countryCode: item.countryCode,
          countryName: item.countryName,
          flagEmoji: getCountryFlagEmoji(item.countryCode),
          totalUsers: item.totalUsers,
          activeUsers7d: item.activeUsers7d,
          activeUsers30d: item.activeUsers30d,
          activityRatePercent: rate,
        };
      })
      .sort((a, b) => b.totalUsers - a.totalUsers);

    const globalActiveRate = totalTracked > 0 ? Math.round((totalActive7d / totalTracked) * 100) : 0;

    return {
      totalTracked,
      totalActive7d,
      globalActiveRate,
      items,
    };
  } catch (err) {
    console.error("[geo] getCountryDistribution error:", err);
    return { totalTracked: 0, totalActive7d: 0, globalActiveRate: 0, items: [] };
  }
}

export type CountryUserItem = {
  id: number;
  name: string | null;
  email: string | null;
  tier: string;
  lastSignedIn: string | null;
  isActive7d: boolean;
  createdAt: string;
};

export async function getUsersByCountry(countryCode: string, search?: string): Promise<{
  countryCode: string;
  countryName: string;
  flagEmoji: string;
  total: number;
  users: CountryUserItem[];
}> {
  const db = await getDb();
  const targetCode = (countryCode || "IN").toUpperCase();
  const targetName = getCountryName(targetCode);
  const flagEmoji = getCountryFlagEmoji(targetCode);

  if (!db) {
    return { countryCode: targetCode, countryName: targetName, flagEmoji, total: 0, users: [] };
  }

  try {
    const registry = await getUserGeoRegistry();
    const userRows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        tier: users.tier,
        lastSignedIn: users.lastSignedIn,
        createdAt: users.createdAt,
      })
      .from(users);

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const searchFilter = (search || "").trim().toLowerCase();

    const matchingUsers: CountryUserItem[] = [];

    for (const u of userRows) {
      let geo = registry[String(u.id)];
      if (!geo) {
        const emailLower = (u.email || "").toLowerCase();
        if (emailLower.includes("thrad") || emailLower.includes("gravity")) {
          geo = { code: "US", name: "United States", updatedAt: new Date().toISOString() };
        } else {
          geo = { code: "IN", name: "India", updatedAt: new Date().toISOString() };
        }
      }

      if (geo.code !== targetCode) continue;

      const emailStr = (u.email || "").toLowerCase();
      const nameStr = (u.name || "").toLowerCase();
      if (searchFilter && !emailStr.includes(searchFilter) && !nameStr.includes(searchFilter)) {
        continue;
      }

      const signedInTime = u.lastSignedIn ? new Date(u.lastSignedIn).getTime() : 0;
      const isActive7d = now - signedInTime <= sevenDaysMs;

      matchingUsers.push({
        id: u.id,
        name: u.name,
        email: u.email,
        tier: u.tier,
        lastSignedIn: u.lastSignedIn ? new Date(u.lastSignedIn).toISOString() : null,
        isActive7d,
        createdAt: new Date(u.createdAt).toISOString(),
      });
    }

    matchingUsers.sort((a, b) => {
      const timeA = a.lastSignedIn ? new Date(a.lastSignedIn).getTime() : 0;
      const timeB = b.lastSignedIn ? new Date(b.lastSignedIn).getTime() : 0;
      return timeB - timeA;
    });

    return {
      countryCode: targetCode,
      countryName: targetName,
      flagEmoji,
      total: matchingUsers.length,
      users: matchingUsers,
    };
  } catch (err) {
    console.error("[geo] getUsersByCountry error:", err);
    return { countryCode: targetCode, countryName: targetName, flagEmoji, total: 0, users: [] };
  }
}
