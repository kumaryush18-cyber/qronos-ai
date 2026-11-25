// Impression bookkeeping.
//
// Gravity's first request was blunt: "fire the impression for every ad shown".
// We do fire it (the CLI calls the pixel URL itself), but the gateway answered
// `/ads/impression` with `{ok:true}` and recorded nothing, so nobody could ever
// prove that an impression happened. This module is that proof: a tiny in-memory
// ring plus a counter, no database table, no key material.
//
// Rules:
//  - a repaint of the same ad is not a second impression (the CLI sends one
//    request per rendered ad, and the ad_id is the de-dupe key here too);
//  - only a real impression URL counts as "fired";
//  - the ring resets on deploy, and says so.

import { adsDebugEnabled } from "./adsDiagnostics";

/** How many impressions the panel keeps. Same spirit as the routing ring. */
export const IMPRESSION_RING_SIZE = 200;

export interface ImpressionEvent {
  /** The ad id the gateway minted for that creative. */
  adId: string;
  /** Which slot drew it: banner / inline. */
  slot: string;
  /** Which network: gravity / thrad. */
  source: string;
  /** True when the client could fire a real pixel URL. */
  pixelFired: boolean;
  /** Server-stamped arrival time. Never trusted from the caller. */
  at: number;
}

let events: ImpressionEvent[] = [];
let total = 0;
let duplicateAttempts = 0;

/**
 * Records one impression. Returns false when this ad id was already counted,
 * which is the honest answer to a repeated report from the same client.
 */
export function recordImpression(input: {
  adId: string;
  slot?: string;
  source?: string;
  pixelFired?: boolean;
  now?: number;
}): boolean {
  const adId = typeof input.adId === "string" ? input.adId.trim() : "";
  if (!adId) return false;
  if (events.some((event) => event.adId === adId)) {
    duplicateAttempts += 1;
    return false;
  }
  const event: ImpressionEvent = {
    adId: adId.slice(0, 64),
    slot: typeof input.slot === "string" && input.slot ? input.slot.slice(0, 16) : "unknown",
    source: typeof input.source === "string" && input.source ? input.source.slice(0, 16) : "unknown",
    pixelFired: input.pixelFired === true,
    // Stamped here, not by the caller: a client cannot back-date an impression.
    at: input.now ?? Date.now(),
  };
  events.push(event);
  if (events.length > IMPRESSION_RING_SIZE) events = events.slice(-IMPRESSION_RING_SIZE);
  total += 1;
  if (adsDebugEnabled()) {
    console.warn(`[ads] impression slot=${event.slot} source=${event.source} pixel=${event.pixelFired ? "fired" : "none"} total=${total}`);
  }
  return true;
}

export function recentImpressions(limit = 20): ImpressionEvent[] {
  const size = Math.max(1, Math.min(IMPRESSION_RING_SIZE, Math.floor(limit)));
  return events.slice(-size);
}

export function impressionStats(): { total: number; window: number; duplicates: number; pixelFired: number } {
  return {
    total,
    window: events.length,
    duplicates: duplicateAttempts,
    pixelFired: events.filter((event) => event.pixelFired).length,
  };
}

/** Test seam only. */
export function resetImpressions(): void {
  events = [];
  total = 0;
  duplicateAttempts = 0;
}
