import { t } from "./localization";

export type GoogleSource = "desktop" | "cli";
export type GoogleQuota = Readonly<{
  remainingPercent: number;
  resetsAt: number;
}>;
export type GoogleFailure =
  | "notFound"
  | "notSignedIn"
  | "unsupportedVersion"
  | "invalidData"
  | "timeout"
  | "sourceUnavailable"
  | "invalidPath"
  | "settingsUnavailable"
  | "untrustedRuntime";
export type GoogleUsage =
  | Readonly<{ status: "disabled" }>
  | Readonly<{
      status: "ready";
      source: GoogleSource;
      checkedAt: number;
      quota: { weekly: GoogleQuota | null; shortWindow: GoogleQuota | null };
    }>
  | Readonly<{
      status: "unavailable";
      source: GoogleSource | null;
      checkedAt: number;
      reason: GoogleFailure;
    }>;
export type GoogleView = Readonly<{
  revision: number;
  settings: { source: GoogleSource | null; path: string | null };
  usage: GoogleUsage;
}>;

export const disabledGoogle: GoogleView = {
  revision: 0,
  settings: { source: null, path: null },
  usage: { status: "disabled" },
};

export function newerGoogleView(
  current: GoogleView,
  incoming: GoogleView,
): GoogleView {
  return incoming.revision >= current.revision ? incoming : current;
}

export function googleIsVisible(view: GoogleView): boolean {
  return (
    view.settings.source !== null &&
    view.usage.status !== "disabled" &&
    !(
      view.usage.status === "unavailable" &&
      ["notFound", "invalidPath"].includes(view.usage.reason)
    )
  );
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Google state");
  return value as Record<string, unknown>;
}
function source(value: unknown): GoogleSource | null {
  if (value === null || value === "desktop" || value === "cli") return value;
  throw new Error("Invalid Google source");
}
function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new Error("Invalid Google timestamp");
  return value;
}
function quota(value: unknown): GoogleQuota | null {
  if (value === null) return null;
  const object = record(value);
  const remaining = object.remainingPercent;
  if (
    typeof remaining !== "number" ||
    !Number.isFinite(remaining) ||
    remaining < 0 ||
    remaining > 100
  )
    throw new Error("Invalid Google quota");
  return { remainingPercent: remaining, resetsAt: positive(object.resetsAt) };
}

const failures: GoogleFailure[] = [
  "notFound",
  "notSignedIn",
  "unsupportedVersion",
  "invalidData",
  "timeout",
  "sourceUnavailable",
  "invalidPath",
  "settingsUnavailable",
  "untrustedRuntime",
];
export function parseGoogleView(input: unknown): GoogleView {
  const envelope = record(input),
    settings = record(envelope.settings),
    raw = record(envelope.usage);
  const selected = source(settings.source);
  if (
    typeof envelope.revision !== "number" ||
    !Number.isSafeInteger(envelope.revision) ||
    envelope.revision < 0
  )
    throw new Error("Invalid Google revision");
  if (
    settings.path !== null &&
    (typeof settings.path !== "string" || settings.path.length > 4096)
  )
    throw new Error("Invalid Google path");
  let usage: GoogleUsage;
  if (raw.status === "disabled" && selected === null)
    usage = { status: "disabled" };
  else if (
    raw.status === "ready" &&
    selected !== null &&
    source(raw.source) === selected
  ) {
    const windows = record(raw.quota);
    const weekly = quota(windows.weekly),
      shortWindow = quota(windows.shortWindow);
    if (!weekly && !shortWindow) throw new Error("Missing Google windows");
    usage = {
      status: "ready",
      source: selected,
      checkedAt: positive(raw.checkedAt),
      quota: { weekly, shortWindow },
    };
  } else if (
    raw.status === "unavailable" &&
    failures.includes(raw.reason as GoogleFailure) &&
    source(raw.source) === selected
  ) {
    usage = {
      status: "unavailable",
      source: selected,
      checkedAt: positive(raw.checkedAt),
      reason: raw.reason as GoogleFailure,
    };
  } else throw new Error("Invalid Google state");
  return {
    revision: envelope.revision,
    settings: { source: selected, path: settings.path as string | null },
    usage,
  };
}

export function googleFailureCopy(reason: unknown): string {
  switch (reason) {
    case "notFound":
      return t("Install Antigravity or choose the path to its native runtime.");
    case "notSignedIn":
      return t("Sign in to the selected Antigravity source, then refresh.");
    case "unsupportedVersion":
      return t("Update AGY CLI to version 1.1.11 or newer in the 1.x series.");
    case "invalidData":
      return t(
        "Google quota is unavailable. No remaining limit has been assumed.",
      );
    case "invalidPath":
      return t(
        "Use the absolute path to agy, agy.exe, or the desktop language_server executable.",
      );
    case "untrustedRuntime":
      return t("The local Antigravity runtime could not be verified.");
    case "settingsUnavailable":
      return t("Antigravity settings could not be saved or read.");
    default:
      return t(
        "Antigravity did not respond. Codex and its mobile sync are unaffected.",
      );
  }
}
