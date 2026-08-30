import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";

import {
  labelForCodexSource,
  parseCodexDiagnostic,
  type CodexDiagnostic,
} from "./codex";
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
const settingsButton = requireElement("settings-button", HTMLButtonElement);
const sourcePanel = requireElement("source-panel", HTMLElement);
const sourceClose = requireElement("source-close", HTMLButtonElement);
const sourceSummary = requireElement("source-summary", HTMLElement);
const sourceStatus = requireElement("source-status", HTMLElement);
const sourcePath = requireElement("source-path", HTMLElement);
const sourceOrigin = requireElement("source-origin", HTMLElement);
const sourceVersion = requireElement("source-version", HTMLElement);
const sourceChoose = requireElement("source-choose", HTMLButtonElement);
const sourceScan = requireElement("source-scan", HTMLButtonElement);
const sourceReset = requireElement("source-reset", HTMLButtonElement);
const sourceFeedback = requireElement("source-feedback", HTMLElement);
const installCommand = requireElement("install-command", HTMLElement);

type SourceRuntime = Readonly<{
  inspect: () => Promise<unknown>;
  save: (path: string) => Promise<unknown>;
  clear: () => Promise<unknown>;
  refreshUsage: () => Promise<void>;
}>;

let sourceRuntime: SourceRuntime | null = null;
let sourceActionPending = false;
let sourceAutoOpened = false;
let focusBeforeSourcePanel: HTMLElement | null = null;

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

  sourceRuntime = {
    inspect: () => invoke<unknown>("inspect_codex"),
    save: (path) => invoke<unknown>("set_codex_path", { path }),
    clear: () => invoke<unknown>("clear_codex_path"),
    refreshUsage: () => controller.refresh(),
  };
  bindSourcePanel();
  void refreshSourceDiagnostic();

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
  bindSourcePanel();
  renderCodexDiagnostic({
    status: initialState.status === "error" ? "missing" : "ready",
    path: initialState.status === "error" ? null : "/opt/homebrew/bin/codex",
    source: initialState.status === "error" ? null : "standalone",
    version: initialState.status === "error" ? null : "codex-cli 0.149.1",
    savedPath: null,
    message: null,
  });
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

  if (
    state.status === "error" &&
    state.code === "codexNotFound" &&
    sourceRuntime !== null &&
    !sourceAutoOpened
  ) {
    sourceAutoOpened = true;
    openSourcePanel();
  }
}

function bindSourcePanel(): void {
  installCommand.textContent = officialInstallCommand();

  settingsButton.addEventListener("click", () => {
    if (sourcePanel.hidden) {
      openSourcePanel();
    } else {
      closeSourcePanel();
    }
  });
  sourceClose.addEventListener("click", closeSourcePanel);
  sourceScan.addEventListener("click", () => {
    void refreshSourceDiagnostic();
  });
  sourceChoose.addEventListener("click", () => {
    void chooseCodexExecutable();
  });
  sourceReset.addEventListener("click", () => {
    void useAutomaticDetection();
  });
  sourcePanel.addEventListener("keydown", trapSourcePanelFocus);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !sourcePanel.hidden) {
      closeSourcePanel();
    }
  });
}

function openSourcePanel(): void {
  if (!sourcePanel.hidden) {
    return;
  }
  focusBeforeSourcePanel =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  sourcePanel.hidden = false;
  settingsButton.setAttribute("aria-expanded", "true");
  sourceClose.focus();
  if (sourceRuntime !== null) {
    void refreshSourceDiagnostic();
  }
}

function closeSourcePanel(): void {
  if (sourcePanel.hidden) {
    return;
  }
  sourcePanel.hidden = true;
  settingsButton.setAttribute("aria-expanded", "false");
  focusBeforeSourcePanel?.focus();
  focusBeforeSourcePanel = null;
}

async function refreshSourceDiagnostic(): Promise<void> {
  if (sourceRuntime === null || sourceActionPending) {
    return;
  }
  setSourceBusy("SCANNING LOCAL INSTALLS");
  try {
    const diagnostic = parseCodexDiagnostic(await sourceRuntime.inspect());
    renderCodexDiagnostic(diagnostic);
  } catch (error: unknown) {
    renderSourceFailure(error);
  } finally {
    setSourceControlsDisabled(false);
  }
}

async function chooseCodexExecutable(): Promise<void> {
  if (sourceRuntime === null || sourceActionPending) {
    return;
  }

  let selected: string | string[] | null;
  try {
    selected = await open({
      multiple: false,
      directory: false,
      title: "Select the Codex executable",
    });
  } catch (error: unknown) {
    renderSourceFailure(error);
    return;
  }
  if (typeof selected !== "string") {
    return;
  }

  setSourceBusy("VERIFYING CODEX --VERSION");
  try {
    const diagnostic = parseCodexDiagnostic(await sourceRuntime.save(selected));
    renderCodexDiagnostic(diagnostic);
    sourceFeedback.textContent =
      "Verified and saved. Refreshing the local account sample…";
    await sourceRuntime.refreshUsage();
  } catch (error: unknown) {
    renderSourceFailure(error);
  } finally {
    setSourceControlsDisabled(false);
  }
}

async function useAutomaticDetection(): Promise<void> {
  if (sourceRuntime === null || sourceActionPending) {
    return;
  }
  setSourceBusy("RESETTING SOURCE");
  try {
    const diagnostic = parseCodexDiagnostic(await sourceRuntime.clear());
    renderCodexDiagnostic(diagnostic);
    await sourceRuntime.refreshUsage();
  } catch (error: unknown) {
    renderSourceFailure(error);
  } finally {
    setSourceControlsDisabled(false);
  }
}

function renderCodexDiagnostic(diagnostic: CodexDiagnostic): void {
  sourceSummary.dataset.status = diagnostic.status;
  sourceStatus.textContent =
    diagnostic.status === "ready"
      ? "VERIFIED"
      : diagnostic.status === "missing"
        ? "NOT FOUND"
        : "INVALID SOURCE";
  sourcePath.textContent = diagnostic.path ?? "No Codex executable detected";
  sourcePath.title = diagnostic.path ?? "";
  sourceOrigin.textContent = labelForCodexSource(diagnostic.source);
  sourceVersion.textContent = diagnostic.version ?? "—";
  sourceReset.hidden = diagnostic.savedPath === null;
  sourceFeedback.textContent =
    diagnostic.message ??
    (diagnostic.status === "ready"
      ? "Codex is local, verified and ready for account metadata."
      : "Install Codex or select its executable manually.");
}

function renderSourceFailure(error: unknown): void {
  sourceSummary.dataset.status = "invalid";
  sourceStatus.textContent = "CHECK FAILED";
  sourceFeedback.textContent = errorMessage(error);
}

function setSourceBusy(message: string): void {
  sourceActionPending = true;
  setSourceControlsDisabled(true);
  sourceSummary.dataset.status = "reading";
  sourceStatus.textContent = "READING";
  sourceFeedback.textContent = message;
}

function setSourceControlsDisabled(disabled: boolean): void {
  sourceActionPending = disabled;
  sourceChoose.disabled = disabled;
  sourceScan.disabled = disabled;
  sourceReset.disabled = disabled;
}

function trapSourcePanelFocus(event: KeyboardEvent): void {
  if (event.key !== "Tab") {
    return;
  }
  const focusable = [sourceClose, sourceChoose, sourceScan, sourceReset].filter(
    (element) => !element.hidden && !element.disabled,
  );
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) {
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function officialInstallCommand(): string {
  if (navigator.userAgent.includes("Windows")) {
    return 'powershell -ExecutionPolicy ByPass -c "irm https://chatgpt.com/codex/install.ps1 | iex"';
  }
  return "curl -fsSL https://chatgpt.com/codex/install.sh | sh";
}

function errorMessage(error: unknown): string {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Statusline could not verify the selected Codex executable.";
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
