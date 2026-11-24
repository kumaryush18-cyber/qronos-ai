import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The routing block has two promises that are easy to break with one careless
 * class name:
 *   1. a line is ONE line, so twenty events cannot push the slots out of sight;
 *   2. the columns are fixed, so the numbers never move between two lines.
 *
 * Geometry is not testable in jsdom here, so the source is checked instead: it is
 * the class list that decides, and a missing class is exactly the mistake.
 */
const SOURCE = readFileSync(
  join(import.meta.dirname, "FreepiRoutingBlock.tsx"),
  "utf8",
);

describe("the routing line never wraps", () => {
  it("the row is nowrap", () => {
    expect(SOURCE).toContain("whitespace-nowrap");
  });

  it("the row itself does not wrap its own children", () => {
    const rowLine = SOURCE.split("\n").find((line) => line.includes('whitespace-nowrap'))!;
    expect(rowLine).not.toContain("flex-wrap");
  });

  it("only the model field is allowed to be cut", () => {
    expect(SOURCE).toContain("truncate");
    expect(SOURCE).toContain("min-w-0 flex-1 truncate");
  });
});

describe("the routing line keeps its columns", () => {
  it("each field has a fixed width and cannot shrink", () => {
    for (const width of ["w-14 shrink-0", "w-12 shrink-0", "w-8 shrink-0", "w-10 shrink-0", "w-16 shrink-0"]) {
      expect(SOURCE).toContain(width);
    }
  });

  it("the model field is the only flexible one", () => {
    expect(SOURCE).toContain("min-w-0 flex-1");
  });
});

describe("the window is described honestly", () => {
  it("says it resets on the next deploy", () => {
    expect(SOURCE).toContain("resets on deploy");
  });

  it("says a dash means a missing number, not a free request", () => {
    expect(SOURCE.toLowerCase()).toContain("did not report a number");
  });

  it("polls every five seconds, and a hidden tab is not polled", () => {
    expect(SOURCE).toContain("refetchInterval: 5_000");
    // The default already skips a hidden tab; setting it true would silently undo
    // that, so the source must never ask for it.
    expect(SOURCE).not.toContain("refetchIntervalInBackground: true");
  });
});

describe("the empty window is a sentence, not an empty box", () => {
  it("says nothing has been reported yet", () => {
    expect(SOURCE).toContain("No request has been reported yet");
  });
});
