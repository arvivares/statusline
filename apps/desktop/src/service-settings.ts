import { claudeHasQuota, claudeIsVisible, type ClaudeView } from "./claude";
import type { GoogleView } from "./antigravity";
import type { CodexDiagnostic } from "./codex";
import type { MessageKey } from "./localization";
import type { UsageState } from "./usage";

export const serviceIds = ["codex", "google", "claude"] as const;
export type ServiceId = (typeof serviceIds)[number];
export type ServiceSetting = Readonly<{
  id: ServiceId;
  present: boolean;
  label: MessageKey;
  tone: "ready" | "attention" | "muted" | "reading";
}>;

/** Settings can retain a broken, explicitly configured source for recovery.
 * Presence and working quota are deliberately separate; this never changes the
 * dashboard inventory or the relay's provider contract. */
export function serviceSettings(
  codex: CodexDiagnostic | null,
  usage: UsageState | null,
  google: GoogleView | null,
  claude: ClaudeView | null,
): ServiceSetting[] {
  const codexPresent =
    !!(codex?.path || codex?.savedPath) || usage?.status === "ready";
  const codexProblem =
    codex?.status === "invalid" ||
    (codexPresent &&
      (codex?.status === "missing" || usage?.status === "error"));
  const googlePresent = !!(google?.settings.source || google?.settings.path);
  const claudePresent =
    claudeIsVisible(claude) || claude?.connection === "connected";
  return [
    {
      id: "codex",
      present: codexPresent,
      label: codexProblem
        ? "Needs attention"
        : usage?.status === "ready"
          ? "Quota available"
          : usage?.status === "unavailable" &&
              usage.reason === "notSignedIn" &&
              codexPresent
            ? "Sign in required"
            : codexPresent
              ? "Detected"
              : codex
                ? "Not detected"
                : "Checking…",
      tone: codexProblem
        ? "attention"
        : usage?.status === "ready"
          ? "ready"
          : "muted",
    },
    {
      id: "google",
      present: googlePresent,
      label: !google
        ? "Checking…"
        : google.usage.status === "ready"
          ? "Quota available"
          : google.usage.status === "disabled"
            ? "Disabled"
            : !googlePresent
              ? "Not detected"
              : google.usage.reason === "notSignedIn"
                ? "Sign in required"
                : "Needs attention",
      tone:
        google?.usage.status === "ready"
          ? "ready"
          : googlePresent
            ? "attention"
            : "muted",
    },
    {
      id: "claude",
      present: claudePresent,
      label: !claude
        ? "Checking…"
        : !claudePresent
          ? "Not detected"
          : claude.connection === "unknown" ||
              claude.status === "discoveryUnavailable"
            ? "Needs attention"
            : claude.connection !== "connected"
              ? "Connect to read quota"
              : claudeHasQuota(claude)
                ? "Quota available"
                : claude.status === "noPlanQuota"
                  ? "No plan quota"
                  : "Waiting for a response",
      tone:
        claude?.connection === "unknown" ||
        claude?.status === "discoveryUnavailable"
          ? "attention"
          : claudeHasQuota(claude)
            ? "ready"
            : "muted",
    },
  ];
}
