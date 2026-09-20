import { t } from "./localization";

export type ClaudeStatus =
  | "notFound"
  | "quotaUnavailable"
  | "discoveryUnavailable"
  | "ready"
  | "noPlanQuota";
export type ClaudeConnection = "none" | "connected" | "custom" | "unknown";
export type ClaudeWindow = Readonly<{
  remainingPercent: number;
  resetsAt: number;
}>;
export type ClaudeSpendLimit = Readonly<{
  usedPercent: number;
  resetsAt: number;
}>;
export type ClaudeQuota = Readonly<{
  checkedAt: number;
  weekly: ClaudeWindow | null;
  shortWindow: ClaudeWindow | null;
  spendLimit: ClaudeSpendLimit | null;
}>;
export type ClaudeView = Readonly<{
  revision: number;
  checkedAt: number;
  installations: Readonly<{ cli: boolean; desktop: boolean }>;
  status: ClaudeStatus;
  connection: ClaudeConnection;
  quota: ClaudeQuota | null;
  capturedAt: number | null;
}>;
export type ClaudeConnectFailure =
  | "settingsUnavailable"
  | "invalidSettings"
  | "unsupportedPath"
  | "storageUnavailable";

const MAX_TIMESTAMP = 253402300799;

// A detected installation or a session that ran the bridge makes Claude visible.
// A quota number appears only when Claude Code itself reported a window.
export function claudeIsVisible(view: ClaudeView | null): boolean {
  return (
    !!view &&
    (view.installations.cli ||
      view.installations.desktop ||
      view.status === "ready" ||
      view.status === "noPlanQuota")
  );
}

export function claudeHasQuota(view: ClaudeView | null): boolean {
  return (
    view?.status === "ready" &&
    !!view.quota &&
    (view.quota.weekly !== null || view.quota.shortWindow !== null)
  );
}

// Discovering the chat desktop app alone does not prove a usable Claude Code
// statusLine transport. A previous capture can prove a custom CLI installation.
export function claudeCanConnect(view: ClaudeView | null): boolean {
  return (
    !!view &&
    view.status !== "discoveryUnavailable" &&
    (view.connection === "none" || view.connection === "custom") &&
    (view.installations.cli || view.capturedAt !== null)
  );
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(message);
  return value as Record<string, unknown>;
}
function timestamp(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > MAX_TIMESTAMP
  )
    throw new Error("Invalid Claude timestamp");
  return value;
}
function window(value: unknown): ClaudeWindow | null {
  if (value === null || value === undefined) return null;
  const raw = record(value, "Invalid Claude window");
  const remaining = raw.remainingPercent;
  if (
    typeof remaining !== "number" ||
    !Number.isFinite(remaining) ||
    remaining < 0 ||
    remaining > 100
  )
    throw new Error("Invalid Claude window");
  return { remainingPercent: remaining, resetsAt: timestamp(raw.resetsAt) };
}
function spendLimit(value: unknown): ClaudeSpendLimit | null {
  if (value === null || value === undefined) return null;
  const raw = record(value, "Invalid Claude spend limit");
  const used = raw.usedPercent;
  if (typeof used !== "number" || !Number.isFinite(used) || used < 0)
    throw new Error("Invalid Claude spend limit");
  return { usedPercent: used, resetsAt: timestamp(raw.resetsAt) };
}
function quota(value: unknown): ClaudeQuota | null {
  if (value === null || value === undefined) return null;
  const raw = record(value, "Invalid Claude quota");
  const result = {
    checkedAt: timestamp(raw.checkedAt),
    weekly: window(raw.weekly),
    shortWindow: window(raw.shortWindow),
    spendLimit: spendLimit(raw.spendLimit),
  };
  if (!result.weekly && !result.shortWindow && !result.spendLimit)
    throw new Error("Invalid Claude quota");
  return result;
}

export function acceptClaudeView(
  current: ClaudeView | null,
  input: unknown,
): ClaudeView {
  const raw = record(input, "Invalid Claude state");
  const installs = record(raw.installations, "Invalid Claude state");
  if (
    typeof installs.cli !== "boolean" ||
    typeof installs.desktop !== "boolean" ||
    typeof raw.revision !== "number" ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision <= 0 ||
    typeof raw.status !== "string" ||
    ![
      "notFound",
      "quotaUnavailable",
      "discoveryUnavailable",
      "ready",
      "noPlanQuota",
    ].includes(raw.status) ||
    typeof raw.connection !== "string" ||
    !["none", "connected", "custom", "unknown"].includes(raw.connection)
  )
    throw new Error("Invalid Claude state");
  const status = raw.status as ClaudeStatus;
  const checkedAt = timestamp(raw.checkedAt);
  const sample = quota(raw.quota);
  const capturedAt =
    raw.capturedAt === null || raw.capturedAt === undefined
      ? null
      : timestamp(raw.capturedAt);
  const detected = installs.cli || installs.desktop;
  // Consistency rules mirror the native derivation; never trust a "ready"
  // that carries no window, or a "quotaUnavailable" for nothing detected.
  if (status === "ready") {
    if (!sample || (!sample.weekly && !sample.shortWindow) || !capturedAt)
      throw new Error("Invalid Claude quota state");
  } else if (sample && (sample.weekly || sample.shortWindow)) {
    throw new Error("Invalid Claude quota state");
  }
  if (status === "noPlanQuota" && !capturedAt)
    throw new Error("Invalid Claude quota state");
  if (
    (status === "quotaUnavailable" && !detected) ||
    (status === "notFound" && detected)
  )
    throw new Error("Invalid Claude detection");
  if (current && raw.revision <= current.revision) return current;
  return {
    revision: raw.revision,
    checkedAt,
    // A transient scan failure is not evidence that the user uninstalled Claude.
    installations:
      status === "discoveryUnavailable" && current
        ? current.installations
        : { cli: installs.cli, desktop: installs.desktop },
    status,
    connection: raw.connection as ClaudeConnection,
    quota: sample,
    capturedAt,
  };
}

export function claudeConnectFailureCopy(failure: unknown): string {
  switch (failure) {
    case "invalidSettings":
      return t(
        "Claude Code settings are not a JSON object. Fix ~/.claude/settings.json and try again.",
      );
    case "unsupportedPath":
      return t(
        "Companion's installation path cannot be quoted in a status line command. Move the app to a standard folder.",
      );
    case "storageUnavailable":
      return t("Companion could not write to its own configuration folder.");
    default:
      return t(
        "Claude Code settings could not be read or written. Check that ~/.claude is accessible.",
      );
  }
}
