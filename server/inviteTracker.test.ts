import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  getInviteTrackerState,
  startInviteTrackerSession,
  stopInviteTrackerSession,
  deleteInviteTrackerHistory,
  clearAllInviteTrackerHistory,
  getReferralStatsBetween,
} from "./db";

describe("Invite Tracker Feature & Lifecycle", () => {
  beforeEach(async () => {
    // Ensure clean state before each test
    try {
      await stopInviteTrackerSession().catch(() => {});
      await clearAllInviteTrackerHistory();
    } catch {}
  });

  afterEach(async () => {
    // Clean up after test
    try {
      await stopInviteTrackerSession().catch(() => {});
      await clearAllInviteTrackerHistory();
    } catch {}
  });

  it("initializes with no active session and empty history", async () => {
    const state = await getInviteTrackerState();
    expect(state.activeSession).toBeNull();
    expect(state.history).toEqual([]);
  });

  it("starts a new invite tracking session fresh from zero", async () => {
    const session = await startInviteTrackerSession("Launch Week Sprint");

    expect(session.id).toMatch(/^inv_sess_/);
    expect(session.name).toBe("Launch Week Sprint");
    expect(session.isActive).toBe(true);
    expect(session.endedAt).toBeNull();
    expect(session.totalInvites).toBe(0);
    expect(session.uniqueInviters).toBe(0);
    expect(session.leaderboard).toEqual([]);

    const state = await getInviteTrackerState();
    expect(state.activeSession).not.toBeNull();
    expect(state.activeSession?.name).toBe("Launch Week Sprint");
    expect(state.activeSession?.totalInvites).toBe(0);
    expect(state.history).toHaveLength(0);
  });

  it("stops an active session and collapses it into history", async () => {
    // Start session
    const started = await startInviteTrackerSession("October Community Drive");
    expect(started.isActive).toBe(true);

    // Stop session
    const stopped = await stopInviteTrackerSession();
    expect(stopped.id).toBe(started.id);
    expect(stopped.name).toBe("October Community Drive");
    expect(stopped.isActive).toBe(false);
    expect(stopped.endedAt).not.toBeNull();

    // Verify state: active session is null and card collapsed into history
    const state = await getInviteTrackerState();
    expect(state.activeSession).toBeNull();
    expect(state.history).toHaveLength(1);
    expect(state.history[0].id).toBe(started.id);
    expect(state.history[0].name).toBe("October Community Drive");
    expect(state.history[0].isActive).toBe(false);
    expect(state.history[0].endedAt).toBe(stopped.endedAt);
  });

  it("starts fresh from zero on a subsequent new session while keeping previous session in history", async () => {
    // Session 1
    await startInviteTrackerSession("First Sprint");
    await stopInviteTrackerSession();

    // Session 2 (starts fresh from 0)
    const second = await startInviteTrackerSession("Second Sprint Fresh");
    expect(second.name).toBe("Second Sprint Fresh");
    expect(second.totalInvites).toBe(0);
    expect(second.uniqueInviters).toBe(0);
    expect(second.leaderboard).toEqual([]);

    const state = await getInviteTrackerState();
    expect(state.activeSession).not.toBeNull();
    expect(state.activeSession?.name).toBe("Second Sprint Fresh");
    expect(state.activeSession?.totalInvites).toBe(0);
    expect(state.history).toHaveLength(1);
    expect(state.history[0].name).toBe("First Sprint");
  });

  it("supports deleting an individual session from history", async () => {
    await startInviteTrackerSession("To Be Deleted");
    const stopped = await stopInviteTrackerSession();

    let state = await getInviteTrackerState();
    expect(state.history).toHaveLength(1);

    await deleteInviteTrackerHistory(stopped.id);
    state = await getInviteTrackerState();
    expect(state.history).toHaveLength(0);
  });

  it("supports clearing all history records", async () => {
    await startInviteTrackerSession("Session Alpha");
    await stopInviteTrackerSession();
    await startInviteTrackerSession("Session Beta");
    await stopInviteTrackerSession();

    let state = await getInviteTrackerState();
    expect(state.history).toHaveLength(2);

    await clearAllInviteTrackerHistory();
    state = await getInviteTrackerState();
    expect(state.history).toHaveLength(0);
  });

  it("correctly queries referral stats within a defined timestamp window", async () => {
    // Test querying the last 48 hours to confirm the aggregation query works
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const stats = await getReferralStatsBetween(twoDaysAgo, new Date());

    expect(typeof stats.totalInvites).toBe("number");
    expect(typeof stats.uniqueInviters).toBe("number");
    expect(Array.isArray(stats.leaderboard)).toBe(true);

    if (stats.leaderboard.length > 0) {
      const top = stats.leaderboard[0];
      expect(typeof top.referrerEmail).toBe("string");
      expect(typeof top.inviteCount).toBe("number");
      expect(top.inviteCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(top.invitedUsers)).toBe(true);
    }
  });
});
