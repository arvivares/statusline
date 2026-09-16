import { googleIsVisible, type GoogleView } from "./antigravity";
import type { CodexDiagnostic } from "./codex";
import type { UsageState } from "./usage";

export type QuotaPeriod = "weekly" | "short";
export type FocusWindow = Readonly<{
  remainingPercent: number;
  resetsAt: number;
  minutes: number;
}>;
export type ProviderReading = Readonly<{
  id: string;
  name: string;
  source: string;
  defaultPeriod: QuotaPeriod;
  status: "ready" | "loading" | "unavailable";
  checkedAt: number | null;
  weekly: FocusWindow | null;
  short: FocusWindow | null;
}>;

// Only implemented adapters enter the registry. Future providers use the same
// focus/watchlist contract, never a placeholder slot in the production UI.
export function companionProviders(
  codex: UsageState | null,
  diagnostic: CodexDiagnostic | null,
  google: GoogleView,
): ProviderReading[] {
  const providers: ProviderReading[] = [];
  const codexMissing =
    diagnostic?.status === "missing" ||
    (codex?.status === "error" && codex.code === "codexNotFound");
  if (
    !codexMissing &&
    (codex?.status === "ready" ||
      diagnostic?.path ||
      (codex && codex.status !== "loading"))
  ) {
    providers.push({
      id: "codex",
      name: "Codex",
      source: "OpenAI",
      defaultPeriod: "weekly",
      status:
        codex?.status === "ready"
          ? "ready"
          : !codex || codex.status === "loading"
            ? "loading"
            : "unavailable",
      checkedAt: codex && codex.status !== "loading" ? codex.checkedAt : null,
      weekly:
        codex?.status === "ready"
          ? { ...codex.weekly, minutes: codex.weekly.windowDurationMins }
          : null,
      short:
        codex?.status === "ready" && codex.shortWindow
          ? {
              ...codex.shortWindow,
              minutes: codex.shortWindow.windowDurationMins,
            }
          : null,
    });
  }
  if (googleIsVisible(google)) {
    const usage = google.usage;
    providers.push({
      id: "google",
      name: "Gemini",
      source: "Antigravity",
      defaultPeriod: "short",
      status: usage.status === "ready" ? "ready" : "unavailable",
      checkedAt: usage.status === "disabled" ? null : usage.checkedAt,
      weekly:
        usage.status === "ready" && usage.quota.weekly
          ? { ...usage.quota.weekly, minutes: 10080 }
          : null,
      short:
        usage.status === "ready" && usage.quota.shortWindow
          ? { ...usage.quota.shortWindow, minutes: 300 }
          : null,
    });
  }
  return providers;
}

export function quotaFocus(
  provider: ProviderReading,
  preferred = provider.defaultPeriod,
): {
  period: QuotaPeriod;
  window: FocusWindow | null;
  alternate: FocusWindow | null;
} {
  const other = preferred === "weekly" ? "short" : "weekly";
  const period = provider[preferred] || !provider[other] ? preferred : other;
  return {
    period,
    window: provider[period],
    alternate: provider[period === "weekly" ? "short" : "weekly"],
  };
}

export function providerWatchlist(
  providers: readonly ProviderReading[],
  selected: string,
): ProviderReading[] {
  return providers.filter((provider) => provider.id !== selected);
}
