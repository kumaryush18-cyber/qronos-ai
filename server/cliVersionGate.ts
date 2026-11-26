// The version a client must be running.
//
// Why this file exists: `/client-version` used to answer `min: "1.0.0",
// latest: "1.0.1"`, written once and never moved. So a machine with an old
// install was never told to update, and it kept running old code against a new
// gateway. The numbers are now one constant plus two env overrides, so a release
// is a one-line change and an emergency relax needs no release at all.
//
// How the client uses them (see qronos-cli `update-check.ts`):
//   version < min    -> "block": the CLI updates itself and relaunches the new
//                       version; if that is impossible it exits instead of
//                       running old code;
//   version < latest -> "notice": it keeps running and says a newer one exists;
//   otherwise        -> "ok".
//
// A malformed env value falls back to the constant. A version gate that throws
// or answers garbage would lock every user out, so it never can.

/** The released CLI version. Bump this in the same change that bumps the CLI. */
export const CLI_LATEST_VERSION = "1.0.31";

/**
 * The oldest version allowed to run at all. Equal to the latest on purpose: an
 * old install talks to a new gateway, and we would rather update it than debug
 * the mismatch.
 */
export const CLI_MIN_VERSION = CLI_LATEST_VERSION;

const SEMVER = /^\d+\.\d+\.\d+$/;

function readVersion(raw: string | undefined, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const value = raw.trim();
  return SEMVER.test(value) ? value : fallback;
}

export interface CliVersionInfo {
  /** Below this, the CLI must update before it may run. */
  min: string;
  /** The newest release; also the update target. */
  latest: string;
}

export function resolveCliVersionInfo(env: NodeJS.ProcessEnv = process.env): CliVersionInfo {
  return {
    min: readVersion(env.QRONOS_CLI_MIN_VERSION, CLI_MIN_VERSION),
    latest: readVersion(env.QRONOS_CLI_LATEST_VERSION, CLI_LATEST_VERSION),
  };
}
