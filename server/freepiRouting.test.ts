import { beforeEach, describe, expect, it } from "vitest";

import {
  FREEPI_ROUTING_RING_SIZE,
  normalizeRoutingEvent,
  recentRoutingEvents,
  recordRoutingEvent,
  resetRoutingEvents,
  routingEventCount,
} from "./freepiRouting";

const BODY = {
  key: "srv-2",
  slot: 1,
  model: "particle",
  status: 200,
  ms: 1200,
  inputTokens: 412,
  outputTokens: 588,
};

beforeEach(() => resetRoutingEvents());

describe("normalizeRoutingEvent", () => {
  it("keeps exactly the fields the panel needs, plus the arrival time", () => {
    const event = normalizeRoutingEvent(BODY, Date.parse("2026-11-24T04:00:00.000Z"));
    expect(event).toEqual({
      key: "srv-2",
      slot: 1,
      model: "particle",
      status: 200,
      ms: 1200,
      inputTokens: 412,
      outputTokens: 588,
      at: "2026-11-24T04:00:00.000Z",
    });
  });

  it("drops a field it was not promised, so a body cannot smuggle anything in", () => {
    const event = normalizeRoutingEvent({ ...BODY, token: "eyJ-secret" });
    expect(event).not.toBeNull();
    expect(JSON.stringify(event)).not.toContain("eyJ");
    expect(event).not.toHaveProperty("token");
  });

  it("refuses a key id that could be a real key", () => {
    expect(normalizeRoutingEvent({ ...BODY, key: "eyJhbGciOiJIUzI1NiJ9.abcdef" })).toBeNull();
  });

  it("refuses an impossible status or duration", () => {
    expect(normalizeRoutingEvent({ ...BODY, status: 900 })).toBeNull();
    expect(normalizeRoutingEvent({ ...BODY, ms: -1 })).toBeNull();
    expect(normalizeRoutingEvent({ ...BODY, ms: 60 * 60 * 1000 })).toBeNull();
  });

  it("refuses a body with no model, so a line always has something to say", () => {
    expect(normalizeRoutingEvent({ ...BODY, model: "" })).toBeNull();
    expect(normalizeRoutingEvent({ ...BODY, model: undefined })).toBeNull();
    expect(normalizeRoutingEvent(null)).toBeNull();
    expect(normalizeRoutingEvent("hello")).toBeNull();
  });

  it("a missing token count is null, never a zero", () => {
    const event = normalizeRoutingEvent({ ...BODY, inputTokens: undefined, outputTokens: "588" });
    expect(event?.inputTokens).toBeNull();
    expect(event?.outputTokens).toBeNull();
  });

  it("status 0 is allowed: a request that never reached the service", () => {
    expect(normalizeRoutingEvent({ ...BODY, status: 0 })?.status).toBe(0);
  });

  it("a local key id with no slot number is still a valid event", () => {
    const event = normalizeRoutingEvent({ ...BODY, key: "t1", slot: undefined });
    expect(event).toMatchObject({ key: "t1", slot: null });
  });
});

describe("the ring", () => {
  it("is newest first", () => {
    for (let index = 0; index < 3; index += 1) {
      recordRoutingEvent(normalizeRoutingEvent({ ...BODY, ms: index })!);
    }
    expect(recentRoutingEvents().map((event) => event.ms)).toEqual([2, 1, 0]);
  });

  it("never grows past its size", () => {
    for (let index = 0; index < FREEPI_ROUTING_RING_SIZE + 25; index += 1) {
      recordRoutingEvent(normalizeRoutingEvent({ ...BODY, ms: index })!);
    }
    expect(routingEventCount()).toBe(FREEPI_ROUTING_RING_SIZE);
    expect(recentRoutingEvents(1000)).toHaveLength(FREEPI_ROUTING_RING_SIZE);
  });

  it("the panel asks for twenty by default, and a silly limit is capped", () => {
    for (let index = 0; index < 30; index += 1) {
      recordRoutingEvent(normalizeRoutingEvent({ ...BODY, ms: index })!);
    }
    expect(recentRoutingEvents()).toHaveLength(20);
    expect(recentRoutingEvents(0)).toHaveLength(1);
  });

  it("an empty window is an empty list, not an error", () => {
    expect(recentRoutingEvents()).toEqual([]);
    expect(routingEventCount()).toBe(0);
  });
});
