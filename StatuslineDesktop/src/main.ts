import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { UsageController } from "./controller";
import { copyForState, type UsageState } from "./usage";

const AUTO_REFRESH_MS = 5 * 60 * 1_000;
const FOCUS_REFRESH_AGE_MS = 60 * 1_000;
const SEGMENT_COUNT = 20;

const shell = requireElement("meter-shell", HTMLElement);
const liveLabel = requireElement("live-label", HTMLElement);
const meterTrack = requireElement("meter-track", HTMLElement);
const meterValue = requireElement("meter-value", HTMLElement);
const meterSuffix = requireElement("meter-suffix", HTMLElement);
const meterUnit = requireElement("meter-unit", HTMLElement);
const scaleValue = requireElement("scale-value", HTMLElement);
const statusValue = requireElement("status-value", HTMLElement);
const sampleValue = requireElement("sample-value", HTMLElement);
const eyebrow = requireElement("state-eyebrow", HTMLElement);
const title = requireElement("state-title", HTMLElement);
const detail = requireElement("state-detail", HTMLElement);
const resetValue = requireElement("reset-value", HTMLElement);
const resetDetail = requireElement("reset-detail", HTMLElement);
const shortValue = requireElement("short-value", HTMLElement);
const shortDetail = requireElement("short-detail", HTMLElement);
const planValue = requireElement("plan-value", HTMLElement);
const planDetail = requireElement("plan-detail", HTMLElement);
const recordValue = requireElement("record-value", HTMLElement);
const updatedValue = requireElement("updated-value", HTMLElement);
const refreshButton = requireElement("refresh-button", HTMLButtonElement);
const refreshLabel = requireElement("refresh-label", HTMLElement);

const meterSegments = Array.from({ length: SEGMENT_COUNT }, () => {
  const segment = document.createElement("span");
  segment.className = "meter-segment";
  segment.setAttribute("aria-hidden", "true");
  return segment;
});
meterTrack.replaceChildren(...meterSegments);

const previewState = readPreviewState();
if (previewState === null) {
  startTauriRuntime();
} else {
  startPreview(previewState);
}

function startTauriRuntime(): void {
  let lastRefreshStartedAt = 0;
  const controller = new UsageController(
    () => {
      lastRefreshStartedAt = Date.now();
      return invoke<unknown>("refresh_usage");
    },
    renderUsage,
    () => Math.floor(Date.now() / 1_000),
  );

  refreshButton.addEventListener("click", () => {
    void controller.refresh();
  });

  window.addEventListener("focus", () => {
    if (Date.now() - lastRefreshStartedAt >= FOCUS_REFRESH_AGE_MS) {
      void controller.refresh();
    }
  });

  window.setInterval(() => {
    void controller.refresh();
  }, AUTO_REFRESH_MS);

  void listen("usage-refresh-requested", () => {
    void controller.refresh();
  }).catch(() => undefined);

  void controller.refresh();
}

function startPreview(initialState: UsageState): void {
  renderUsage(initialState);
  refreshButton.addEventListener("click", () => {
    renderUsage({ status: "loading" });
    window.setTimeout(() => renderUsage(previewReadyState()), 420);
  });
}

function renderUsage(state: UsageState): void {
  const copy = copyForState(state);
  const liveState = labelForState(state);

  document.body.dataset.state = state.status;
  document.body.dataset.level =
    state.status === "ready" && state.weekly.remainingPercent <= 20
      ? "critical"
      : "normal";
  shell.setAttribute(
    "aria-busy",
    state.status === "loading" ? "true" : "false",
  );
  refreshButton.disabled = state.status === "loading";
  refreshLabel.textContent =
    state.status === "loading" ? "READING CODEX" : "REFRESH NOW";
  liveLabel.textContent = liveState;
  statusValue.textContent = liveState;
  eyebrow.textContent = copy.eyebrow;
  title.textContent = copy.title;
  detail.textContent = copy.detail;

  if (state.status === "ready") {
    setMeter(state.weekly.remainingPercent, false);
    sampleValue.textContent = formatTime(state.checkedAt);
    resetValue.textContent = formatTime(state.weekly.resetsAt);
    resetDetail.textContent = formatResetDate(state.weekly.resetsAt);

    if (state.shortWindow === null) {
      shortValue.textContent = "NOT PUBLISHED";
      shortDetail.textContent = "NO SHORT WINDOW";
    } else {
      shortValue.textContent = `${Math.round(state.shortWindow.remainingPercent)}% LEFT`;
      shortDetail.textContent = `${formatWindow(state.shortWindow.windowDurationMins)} WINDOW`;
    }

    planValue.textContent = formatPlan(state.plan).toUpperCase();
    planDetail.textContent = state.accountType.toUpperCase();
    recordValue.textContent =
      state.limitCount > 1
        ? `AVAILABLE · STRICTEST OF ${state.limitCount} LIMITS`
        : "AVAILABLE · QUOTA METADATA ONLY";
    updatedValue.textContent = `SAMPLED ${formatTime(state.checkedAt)} · CODEX LOCAL`;

    if (state.limitCount > 1) {
      detail.textContent = `${copy.detail} Se muestra el límite más exigente de ${state.limitCount}.`;
    }
    return;
  }

  setMeter(null, state.status === "loading");
  resetValue.textContent = "—";
  resetDetail.textContent = "LOCAL TIME";
  shortValue.textContent = "—";
  shortDetail.textContent = "NOT PUBLISHED";
  planValue.textContent = "—";
  planDetail.textContent = "CHATGPT";

  if (state.status === "loading") {
    sampleValue.textContent = "WAITING";
    recordValue.textContent = "READING · LOCAL METADATA ONLY";
    updatedValue.textContent = "WAITING FOR LOCAL SAMPLE";
    return;
  }

  sampleValue.textContent = formatTime(state.checkedAt);
  recordValue.textContent =
    state.status === "error"
      ? "ERROR · NO CREDENTIALS EXPOSED"
      : "OFFLINE · NO SAMPLE AVAILABLE";
  updatedValue.textContent = `LAST ATTEMPT ${formatTime(state.checkedAt)} · CODEX LOCAL`;
}

function setMeter(percentage: number | null, loading: boolean): void {
  meterTrack.classList.toggle("is-loading", loading);

  for (const segment of meterSegments) {
    segment.classList.remove("is-full", "is-partial");
  }

  if (percentage === null) {
    meterValue.textContent = loading ? "···" : "—";
    meterSuffix.hidden = true;
    meterUnit.hidden = true;
    scaleValue.textContent = "— / LEFT";
    meterTrack.removeAttribute("aria-valuenow");
    meterTrack.removeAttribute("aria-valuetext");
    return;
  }

  const normalized = Math.min(Math.max(percentage, 0), 100);
  const rounded = Math.round(normalized);
  const fullSegments = Math.floor(normalized / 5);
  const hasPartialSegment = normalized < 100 && normalized % 5 !== 0;

  meterSegments.forEach((segment, index) => {
    if (index < fullSegments) {
      segment.classList.add("is-full");
    } else if (index === fullSegments && hasPartialSegment) {
      segment.classList.add("is-partial");
    }
  });

  meterValue.textContent = rounded.toString();
  meterSuffix.hidden = false;
  meterUnit.hidden = false;
  scaleValue.textContent = `${rounded} / LEFT`;
  meterTrack.setAttribute("aria-valuenow", rounded.toString());
  meterTrack.setAttribute("aria-valuetext", `${rounded} por ciento restante`);
}

function labelForState(state: UsageState): string {
  switch (state.status) {
    case "loading":
      return "READING";
    case "ready":
      return "LIVE";
    case "unavailable":
      return "OFFLINE";
    case "error":
      return "ERROR";
  }
}

function formatResetDate(timestampSeconds: number): string {
  return new Intl.DateTimeFormat("es-ES", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  })
    .format(new Date(timestampSeconds * 1_000))
    .replaceAll(".", "")
    .replace(",", " ·")
    .toUpperCase();
}

function formatTime(timestampSeconds: number): string {
  return new Intl.DateTimeFormat("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(timestampSeconds * 1_000));
}

function formatWindow(durationMinutes: number): string {
  if (durationMinutes % 60 === 0) {
    return `${durationMinutes / 60} H`;
  }
  return `${durationMinutes} MIN`;
}

function formatPlan(plan: string | null): string {
  if (plan === null || plan.length === 0) {
    return "ChatGPT";
  }
  return plan;
}

function readPreviewState(): UsageState | null {
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (!localHosts.has(window.location.hostname)) {
    return null;
  }

  switch (new URLSearchParams(window.location.search).get("preview")) {
    case "ready":
      return previewReadyState();
    case "loading":
      return { status: "loading" };
    case "empty":
      return {
        status: "unavailable",
        reason: "notSignedIn",
        checkedAt: Math.floor(Date.now() / 1_000),
      };
    case "error":
      return {
        status: "error",
        code: "codexNotFound",
        message: "Preview error",
        checkedAt: Math.floor(Date.now() / 1_000),
      };
    default:
      return null;
  }
}

function previewReadyState(): UsageState {
  const now = Math.floor(Date.now() / 1_000);
  return {
    status: "ready",
    weekly: {
      usedPercent: 47,
      remainingPercent: 53,
      windowDurationMins: 10_080,
      resetsAt: now + 4 * 24 * 60 * 60,
      label: "Codex",
    },
    shortWindow: {
      usedPercent: 26,
      remainingPercent: 74,
      windowDurationMins: 300,
      resetsAt: now + 3 * 60 * 60,
      label: "Codex",
    },
    plan: "plus",
    accountType: "chatgpt",
    checkedAt: now,
    limitCount: 1,
  };
}

function requireElement<T extends Element>(
  id: string,
  constructor: { new (): T },
): T {
  const element = document.getElementById(id);
  if (!(element instanceof constructor)) {
    throw new Error(`Missing required UI element: #${id}`);
  }
  return element;
}
