import {
  t,
  language,
  setLanguage,
  localizeDocument,
  relayErrorCopy,
} from "./localization";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import QRCode from "qrcode";

import { parseRelayStatus, type RelayStatus } from "./relay";
import { RelayStatusController, nextPairingPollAction } from "./relay-refresh";
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
const sourceTab = requireElement("source-tab", HTMLButtonElement);
const relayTab = requireElement("relay-tab", HTMLButtonElement);
const sourceSettingsView = requireElement("source-settings-view", HTMLElement);
const relaySettingsView = requireElement("relay-settings-view", HTMLElement);
const relaySummary = requireElement("relay-summary", HTMLElement);
const relayStatus = requireElement("relay-status", HTMLElement);
const relayValue = requireElement("relay-value", HTMLElement);
const relayDetail = requireElement("relay-detail", HTMLElement);
const relayEndpoint = requireElement("relay-endpoint", HTMLElement);
const relayStorage = requireElement("relay-storage", HTMLElement);
const relayPublished = requireElement("relay-published", HTMLElement);
const relayConnect = requireElement("relay-connect", HTMLButtonElement);
const relayDisconnect = requireElement("relay-disconnect", HTMLButtonElement);
const relayFeedback = requireElement("relay-feedback", HTMLElement);
const relayPairing = requireElement("relay-pairing", HTMLElement);
const relayQRCode = requireElement("relay-qr", HTMLImageElement);
const relayPairingLink = requireElement("relay-pairing-link", HTMLElement);
const relayCopy = requireElement("relay-copy", HTMLButtonElement);

type SourceRuntime = Readonly<{
  inspect: () => Promise<unknown>;
  save: (path: string) => Promise<unknown>;
  clear: () => Promise<unknown>;
  refreshUsage: () => Promise<void>;
}>;

type RelayRuntime = Readonly<{
  create: () => Promise<unknown>;
  disconnect: () => Promise<unknown>;
  refreshUsage: () => Promise<void>;
}>;

let sourceRuntime: SourceRuntime | null = null;
let relayRuntime: RelayRuntime | null = null;
let relayStatusController: RelayStatusController | null = null;
let sourceActionPending = false;
let relayActionPending = false;
let sourceAutoOpened = false;
let focusBeforeSourcePanel: HTMLElement | null = null;
let currentPairingURI: string | null = null;
let pairingPollTimer: number | null = null;
let pairingPollURI: string | null = null;
let pairingPollObservedAtMs: number | null = null;
let pairingPollExpiresAt: number | null = null;
let lastUsageState: UsageState | null = null;
let lastDiagnostic: CodexDiagnostic | null = null;
let lastRelayState: RelayStatus | null = null;

const meterSegments = Array.from({ length: SEGMENT_COUNT }, () => {
  const segment = document.createElement("span");
  segment.className = "meter-segment";
  segment.setAttribute("aria-hidden", "true");
  return segment;
});
meterTrack.replaceChildren(...meterSegments);

const previewState = readPreviewState();
// Local, account-free visual QA only. Packaged apps always use the OS language.
if (previewState !== null) {
  const previewLanguage = new URLSearchParams(window.location.search).get(
    "lang",
  );
  if (previewLanguage) setLanguage(previewLanguage);
}
localizeDocument();
if (previewState === null) {
  void startTauriRuntime();
} else {
  startPreview(previewState);
}

async function startTauriRuntime(): Promise<void> {
  await refreshLanguage();
  window.addEventListener("languagechange", () => void refreshLanguage());
  window.addEventListener("focus", () => void refreshLanguage());
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
  relayRuntime = {
    create: () => invoke<unknown>("create_relay_pairing"),
    disconnect: () => invoke<unknown>("disconnect_relay"),
    refreshUsage: () => controller.refresh(),
  };
  relayStatusController = new RelayStatusController(
    () => invoke<unknown>("relay_status"),
    renderRelayStatus,
    (error) => {
      renderRelayFailure(errorMessage(error));
      schedulePairingPoll();
    },
  );
  bindSourcePanel();
  void refreshSourceDiagnostic();
  void refreshRelayStatus();

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

  void listen<unknown>("relay-status-changed", (event) => {
    try {
      renderRelayStatus(parseRelayStatus(event.payload));
    } catch {
      renderRelayFailure(
        "Statusline received an invalid universal relay state.",
      );
    }
  }).catch(() => undefined);

  void invoke("frontend_ready").catch(() => undefined);
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
  renderRelayStatus({
    status: "connected",
    endpoint: "https://relay.statusline.example",
    lastPublishedAt: Math.floor(Date.now() / 1_000),
  });
  renderUsage(initialState);
  const previewPanel = new URLSearchParams(window.location.search).get("panel");
  if (previewPanel === "source" || previewPanel === "relay") {
    selectSettingsView(previewPanel);
    openSourcePanel();
  }
  refreshButton.addEventListener("click", () => {
    renderUsage({ status: "loading" });
    window.setTimeout(() => renderUsage(previewReadyState()), 420);
  });
}

function renderUsage(state: UsageState): void {
  lastUsageState = state;
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
    state.status === "loading" ? t("READING CODEX") : t("REFRESH NOW");
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
      shortValue.textContent = t("NOT PUBLISHED");
      shortDetail.textContent = t("NO SHORT WINDOW");
    } else {
      shortValue.textContent = t(
        "{0}% LEFT",
        Math.round(state.shortWindow.remainingPercent),
      );
      shortDetail.textContent = t(
        "{0} WINDOW",
        formatWindow(state.shortWindow.windowDurationMins),
      );
    }

    planValue.textContent = formatPlan(state.plan).toUpperCase();
    planDetail.textContent = state.accountType.toUpperCase();
    recordValue.textContent =
      state.limitCount > 1
        ? t("AVAILABLE · STRICTEST OF {0} LIMITS", state.limitCount)
        : t("AVAILABLE · QUOTA METADATA ONLY");
    updatedValue.textContent = t(
      "SAMPLED {0} · CODEX LOCAL",
      formatTime(state.checkedAt),
    );

    if (state.limitCount > 1) {
      detail.textContent =
        copy.detail +
        t(" Showing the most restrictive of {0} limits.", state.limitCount);
    }
    return;
  }

  setMeter(null, state.status === "loading");
  resetValue.textContent = "—";
  resetDetail.textContent = t("LOCAL TIME");
  shortValue.textContent = "—";
  shortDetail.textContent = t("NOT PUBLISHED");
  planValue.textContent = "—";
  planDetail.textContent = "CHATGPT";

  if (state.status === "loading") {
    sampleValue.textContent = t("WAITING");
    recordValue.textContent = t("READING · LOCAL METADATA ONLY");
    updatedValue.textContent = t("WAITING FOR LOCAL SAMPLE");
    return;
  }

  sampleValue.textContent = formatTime(state.checkedAt);
  recordValue.textContent =
    state.status === "error"
      ? t("ERROR · NO CREDENTIALS EXPOSED")
      : t("OFFLINE · NO SAMPLE AVAILABLE");
  updatedValue.textContent = t(
    "LAST ATTEMPT {0} · CODEX LOCAL",
    formatTime(state.checkedAt),
  );

  if (
    state.status === "error" &&
    state.code === "codexNotFound" &&
    sourceRuntime !== null &&
    !sourceAutoOpened
  ) {
    sourceAutoOpened = true;
    selectSettingsView("source");
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
  sourceTab.addEventListener("click", () => {
    selectSettingsView("source", true);
  });
  relayTab.addEventListener("click", () => {
    selectSettingsView("relay", true);
  });
  sourceTab.addEventListener("keydown", navigateSettingsTabs);
  relayTab.addEventListener("keydown", navigateSettingsTabs);
  relayConnect.addEventListener("click", () => {
    void createRelayPairing();
  });
  relayDisconnect.addEventListener("click", () => {
    void disconnectRelay();
  });
  relayCopy.addEventListener("click", () => {
    void copyPairingLink();
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
  if (!sourceSettingsView.hidden && sourceRuntime !== null) {
    void refreshSourceDiagnostic();
  }
  if (!relaySettingsView.hidden && relayRuntime !== null) {
    void refreshRelayStatus();
  }
}

function closeSourcePanel(): void {
  if (sourcePanel.hidden) {
    return;
  }
  pausePairingPoll();
  sourcePanel.hidden = true;
  settingsButton.setAttribute("aria-expanded", "false");
  focusBeforeSourcePanel?.focus();
  focusBeforeSourcePanel = null;
}

function selectSettingsView(view: "source" | "relay", moveFocus = false): void {
  const showSource = view === "source";
  sourceSettingsView.hidden = !showSource;
  relaySettingsView.hidden = showSource;
  sourceTab.setAttribute("aria-selected", showSource ? "true" : "false");
  relayTab.setAttribute("aria-selected", showSource ? "false" : "true");
  sourceTab.tabIndex = showSource ? 0 : -1;
  relayTab.tabIndex = showSource ? -1 : 0;
  const selectedTab = showSource ? sourceTab : relayTab;
  if (moveFocus) {
    selectedTab.focus();
  }
  if (showSource) {
    pausePairingPoll();
    void refreshSourceDiagnostic();
  } else {
    void refreshRelayStatus();
  }
}

function navigateSettingsTabs(event: KeyboardEvent): void {
  if (!matchesSettingsTabNavigation(event.key)) {
    return;
  }
  event.preventDefault();
  const view =
    event.key === "Home"
      ? "source"
      : event.key === "End"
        ? "relay"
        : event.currentTarget === sourceTab
          ? "relay"
          : "source";
  selectSettingsView(view, true);
}

function matchesSettingsTabNavigation(key: string): boolean {
  return ["ArrowLeft", "ArrowRight", "Home", "End"].includes(key);
}

async function refreshSourceDiagnostic(): Promise<void> {
  if (sourceRuntime === null || sourceActionPending) {
    return;
  }
  setSourceBusy(t("SCANNING LOCAL INSTALLS"));
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
      title: t("Select the Codex executable"),
    });
  } catch (error: unknown) {
    renderSourceFailure(error);
    return;
  }
  if (typeof selected !== "string") {
    return;
  }

  setSourceBusy(t("VERIFYING CODEX --VERSION"));
  try {
    const diagnostic = parseCodexDiagnostic(await sourceRuntime.save(selected));
    renderCodexDiagnostic(diagnostic);
    sourceFeedback.textContent = t(
      "Verified and saved. Refreshing the local account sample…",
    );
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
  setSourceBusy(t("RESETTING SOURCE"));
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
  lastDiagnostic = diagnostic;
  sourceSummary.dataset.status = diagnostic.status;
  sourceStatus.textContent =
    diagnostic.status === "ready"
      ? t("VERIFIED")
      : diagnostic.status === "missing"
        ? t("NOT FOUND")
        : t("INVALID SOURCE");
  sourcePath.textContent = diagnostic.path ?? t("No Codex executable detected");
  sourcePath.title = diagnostic.path ?? "";
  sourceOrigin.textContent = labelForCodexSource(diagnostic.source);
  sourceVersion.textContent = diagnostic.version ?? "—";
  sourceReset.hidden = diagnostic.savedPath === null;
  sourceFeedback.textContent =
    diagnostic.status === "ready"
      ? diagnostic.message
        ? t(
            "Codex was detected automatically. Check the saved path in settings.",
          )
        : t("Codex is local, verified and ready for account metadata.")
      : diagnostic.status === "invalid"
        ? t(
            "Codex was found but could not be verified. Check its permissions or select another executable.",
          )
        : t("Install Codex or select its executable manually.");
}

function renderSourceFailure(error: unknown): void {
  sourceSummary.dataset.status = "invalid";
  sourceStatus.textContent = t("CHECK FAILED");
  sourceFeedback.textContent = errorMessage(error);
}

function setSourceBusy(message: string): void {
  sourceActionPending = true;
  setSourceControlsDisabled(true);
  sourceSummary.dataset.status = "reading";
  sourceStatus.textContent = t("READING");
  sourceFeedback.textContent = message;
}

function setSourceControlsDisabled(disabled: boolean): void {
  sourceActionPending = disabled;
  sourceChoose.disabled = disabled;
  sourceScan.disabled = disabled;
  sourceReset.disabled = disabled;
}

function refreshRelayStatus(): Promise<void> {
  if (relayStatusController === null || relayActionPending) {
    return Promise.resolve();
  }
  return relayStatusController.refresh();
}

async function createRelayPairing(): Promise<void> {
  if (relayRuntime === null || relayActionPending) {
    return;
  }
  relayActionPending = true;
  setRelayBusy(t("CREATING ENCRYPTED CHANNEL"));
  try {
    const status = parseRelayStatus(await relayRuntime.create());
    relayActionPending = false;
    renderRelayStatus(status);
    if (status.status === "pairing" || status.status === "connected") {
      await relayRuntime.refreshUsage();
    }
  } catch (error: unknown) {
    relayActionPending = false;
    renderRelayFailure(errorMessage(error));
  }
}

async function disconnectRelay(): Promise<void> {
  if (relayRuntime === null || relayActionPending) {
    return;
  }
  relayActionPending = true;
  setRelayBusy(t("REMOVING LOCAL RELAY CREDENTIALS"));
  try {
    const status = parseRelayStatus(await relayRuntime.disconnect());
    relayActionPending = false;
    renderRelayStatus(status);
  } catch (error: unknown) {
    relayActionPending = false;
    renderRelayFailure(errorMessage(error));
  }
}

function renderRelayStatus(state: RelayStatus): void {
  lastRelayState = state;
  pausePairingPoll();
  const endpoint = state.status === "notConfigured" ? null : state.endpoint;
  relayEndpoint.textContent =
    endpoint === null ? "—" : compactEndpoint(endpoint);
  relayEndpoint.title = endpoint ?? "";
  relayConnect.hidden = false;
  relayConnect.disabled = relayActionPending;
  relayDisconnect.disabled = relayActionPending;
  relayDisconnect.hidden = true;
  relayPairing.hidden = true;
  currentPairingURI = null;
  relayPublished.textContent = t("NO SAMPLE PUBLISHED");
  relayDetail.textContent = t("E2E / AES-256-GCM");

  switch (state.status) {
    case "notConfigured":
      relaySummary.dataset.status = "invalid";
      relayStatus.textContent = t("BUILD NOT CONFIGURED");
      relayValue.textContent = t("UNAVAILABLE");
      relayDetail.textContent = t("INSTALLER CONFIG");
      relayPublished.textContent = t("RELAY URL NOT CONFIGURED");
      relayConnect.disabled = true;
      relayFeedback.textContent = t(
        "This build needs STATUSLINE_RELAY_BASE_URL pointing to the public HTTPS relay.",
      );
      break;
    case "unpaired":
      relaySummary.dataset.status = "offline";
      relayStatus.textContent = t("READY TO PAIR");
      relayValue.textContent = t("OFFLINE");
      relayConnect.textContent = t("CREATE PAIRING");
      relayFeedback.textContent = t(
        "Create a private QR for Statusline on iOS or Android. No platform account is required.",
      );
      break;
    case "creating":
      relaySummary.dataset.status = "reading";
      relayStatus.textContent = t("CREATING CHANNEL");
      relayValue.textContent = t("PAIRING");
      relayConnect.textContent = t("CREATING…");
      relayConnect.disabled = true;
      relayFeedback.textContent = t(
        "Generating independent read/write credentials.",
      );
      break;
    case "pairing":
      relaySummary.dataset.status = "reading";
      relayStatus.textContent = t("SCAN ON MOBILE");
      relayValue.textContent = t("PAIRING");
      relayConnect.textContent = t("REPLACE PAIRING");
      relayDisconnect.hidden = false;
      relayPairing.hidden = false;
      currentPairingURI = state.pairingUri;
      relayPairingLink.textContent = state.pairingUri;
      relayPublished.textContent = t(
        "QR EXPIRES {0}",
        formatTime(state.pairingExpiresAt),
      );
      relayFeedback.textContent = t(
        "Scan this QR inside Statusline. Treat it like a password until the mobile device confirms pairing.",
      );
      void renderPairingQRCode(state.pairingUri);
      updatePairingPoll(state.pairingUri, state.pairingExpiresAt, Date.now());
      break;
    case "connected":
      relaySummary.dataset.status = "ready";
      relayStatus.textContent =
        state.lastPublishedAt === null ? t("CONNECTED") : t("SYNCED");
      relayValue.textContent =
        state.lastPublishedAt === null ? t("CONNECTED") : t("SYNCED");
      relayConnect.textContent = t("REPLACE PAIRING");
      relayDisconnect.hidden = false;
      relayPublished.textContent =
        state.lastPublishedAt === null
          ? t("WAITING FOR LOCAL SAMPLE")
          : t("{0} · ENCRYPTED SNAPSHOT", formatTime(state.lastPublishedAt));
      relayFeedback.textContent =
        state.lastPublishedAt === null
          ? t("Paired. Refresh Codex to publish the first encrypted snapshot.")
          : t(
              "The latest quota sample is available to paired iOS and Android clients.",
            );
      break;
    case "error":
      relaySummary.dataset.status = "invalid";
      relayStatus.textContent = t("RELAY NEEDS ATTENTION");
      relayValue.textContent = t("SYNC ERROR");
      relayConnect.textContent = t("CREATE NEW PAIRING");
      relayDisconnect.hidden = !state.hasPairing;
      relayPublished.textContent = t("STATUS UNAVAILABLE");
      relayFeedback.textContent = relayErrorCopy(state.code);
      break;
  }
  if (state.status !== "pairing") {
    clearPairingPoll();
    relayPairingLink.textContent = "";
    relayQRCode.removeAttribute("src");
  }
  relayStorageLabel();
  if (relayRuntime === null) {
    relayConnect.disabled = true;
    relayDisconnect.disabled = true;
  }
}

function setRelayBusy(message: string): void {
  clearPairingPoll();
  currentPairingURI = null;
  relayPairing.hidden = true;
  relayPairingLink.textContent = "";
  relayQRCode.removeAttribute("src");
  relaySummary.dataset.status = "reading";
  relayStatus.textContent = t("WORKING");
  relayValue.textContent = t("PAIRING");
  relayDetail.textContent = t("E2E / AES-256-GCM");
  relayPublished.textContent = t("WAITING FOR RELAY");
  relayFeedback.textContent = message;
  relayConnect.disabled = true;
  relayDisconnect.disabled = true;
}

function renderRelayFailure(message: string): void {
  relaySummary.dataset.status = "invalid";
  relayStatus.textContent = t("CHECK FAILED");
  relayValue.textContent = t("SYNC ERROR");
  relayDetail.textContent = t("E2E / AES-256-GCM");
  relayPublished.textContent = t("STATUS UNAVAILABLE");
  relayFeedback.textContent = message;
  relayConnect.textContent = t("RETRY PAIRING");
  relayDisconnect.hidden = true;
  relayConnect.disabled = relayRuntime === null;
  relayDisconnect.disabled = relayRuntime === null;
}

function updatePairingPoll(
  pairingURI: string,
  expiresAt: number,
  observedAtMs: number,
): void {
  if (pairingPollURI !== pairingURI) {
    pairingPollObservedAtMs = observedAtMs;
  }
  pairingPollURI = pairingURI;
  pairingPollExpiresAt = expiresAt;
  schedulePairingPoll();
}

function schedulePairingPoll(): void {
  pausePairingPoll();
  if (
    !isPairingPollVisible() ||
    pairingPollURI === null ||
    pairingPollObservedAtMs === null ||
    pairingPollExpiresAt === null
  ) {
    return;
  }

  const pairingURI = pairingPollURI;
  const expiresAt = pairingPollExpiresAt;
  const action = nextPairingPollAction(
    Date.now(),
    pairingPollObservedAtMs,
    expiresAt,
  );
  if (action.kind === "expire" && action.delayMs === 0) {
    renderExpiredPairing(pairingURI, expiresAt);
    return;
  }

  pairingPollTimer = window.setTimeout(() => {
    pairingPollTimer = null;
    if (
      pairingPollURI !== pairingURI ||
      pairingPollExpiresAt !== expiresAt ||
      !isPairingPollVisible()
    ) {
      return;
    }
    if (action.kind === "expire" || Date.now() >= expiresAt * 1_000) {
      renderExpiredPairing(pairingURI, expiresAt);
      return;
    }
    void refreshRelayStatus();
  }, action.delayMs);
}

function isPairingPollVisible(): boolean {
  return (
    relayRuntime !== null &&
    !relayActionPending &&
    !sourcePanel.hidden &&
    !relaySettingsView.hidden &&
    !relayPairing.hidden &&
    currentPairingURI === pairingPollURI
  );
}

function pausePairingPoll(): void {
  if (pairingPollTimer !== null) {
    window.clearTimeout(pairingPollTimer);
    pairingPollTimer = null;
  }
}

function clearPairingPoll(): void {
  pausePairingPoll();
  pairingPollURI = null;
  pairingPollObservedAtMs = null;
  pairingPollExpiresAt = null;
}

function renderExpiredPairing(pairingURI: string, expiresAt: number): void {
  if (pairingPollURI !== pairingURI || pairingPollExpiresAt !== expiresAt) {
    return;
  }
  clearPairingPoll();
  currentPairingURI = null;
  relayPairing.hidden = true;
  relayPairingLink.textContent = "";
  relayQRCode.removeAttribute("src");
  relaySummary.dataset.status = "offline";
  relayStatus.textContent = t("QR EXPIRED");
  relayValue.textContent = t("OFFLINE");
  relayDetail.textContent = t("PAIRING WINDOW CLOSED");
  relayPublished.textContent = t("NO ACTIVE QR");
  relayConnect.textContent = t("CREATE NEW PAIRING");
  relayConnect.hidden = false;
  relayConnect.disabled = relayRuntime === null || relayActionPending;
  relayDisconnect.hidden = false;
  relayDisconnect.disabled = relayRuntime === null || relayActionPending;
  relayFeedback.textContent = t(
    "This private QR has expired. Create a new pairing when the mobile device is ready.",
  );
}

async function renderPairingQRCode(pairingURI: string): Promise<void> {
  try {
    const imageURL = await QRCode.toDataURL(pairingURI, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 220,
      color: { dark: "#11120f", light: "#efc65a" },
    });
    if (currentPairingURI === pairingURI) {
      relayQRCode.src = imageURL;
    }
  } catch {
    if (currentPairingURI === pairingURI) {
      relayQRCode.removeAttribute("src");
      relayFeedback.textContent = t(
        "Could not render the QR. Copy the private pairing link instead.",
      );
    }
  }
}

async function copyPairingLink(): Promise<void> {
  if (currentPairingURI === null) {
    return;
  }
  try {
    await navigator.clipboard.writeText(currentPairingURI);
    relayCopy.textContent = t("COPIED");
    window.setTimeout(() => {
      relayCopy.textContent = t("COPY PRIVATE LINK");
    }, 1_500);
  } catch {
    relayFeedback.textContent = t(
      "Clipboard access failed. Select and copy the private link manually.",
    );
  }
}

function compactEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).host.toUpperCase();
  } catch {
    return t("INVALID ENDPOINT");
  }
}

function relayStorageLabel(): void {
  const platform = navigator.userAgent;
  const label = platform.includes("Windows")
    ? t("CREDENTIAL MANAGER")
    : platform.includes("Linux")
      ? t("SECRET SERVICE")
      : t("SYSTEM KEYCHAIN");
  relayStorage.textContent = label;
}

function trapSourcePanelFocus(event: KeyboardEvent): void {
  if (event.key !== "Tab") {
    return;
  }
  const focusable = [
    sourceClose,
    sourceTab,
    relayTab,
    sourceChoose,
    sourceScan,
    sourceReset,
    relayConnect,
    relayDisconnect,
    relayCopy,
  ].filter(
    (element) =>
      !element.hidden &&
      !element.disabled &&
      element.tabIndex >= 0 &&
      element.closest("[hidden]") === null,
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

async function refreshLanguage(): Promise<void> {
  const primary = await invoke<string>("system_language").catch(
    () => navigator.languages[0] ?? navigator.language,
  );
  const previous = language();
  setLanguage(primary);
  if (previous === language() && document.documentElement.lang === language())
    return;
  localizeDocument();
  if (lastUsageState) renderUsage(lastUsageState);
  if (lastDiagnostic && !sourceActionPending)
    renderCodexDiagnostic(lastDiagnostic);
  if (lastRelayState && !relayActionPending) renderRelayStatus(lastRelayState);
}

function errorMessage(_error: unknown): string {
  // Backend / OS prose is not a UI contract and may contain paths or credentials.
  return t("Statusline could not complete the operation. Please try again.");
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
    scaleValue.textContent = t("— / LEFT");
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
  scaleValue.textContent = t("{0} / LEFT", rounded);
  meterTrack.setAttribute("aria-valuenow", rounded.toString());
  meterTrack.setAttribute(
    "aria-valuetext",
    t("{0} percent remaining", rounded),
  );
}

function labelForState(state: UsageState): string {
  switch (state.status) {
    case "loading":
      return t("READING");
    case "ready":
      return t("LIVE");
    case "unavailable":
      return t("OFFLINE");
    case "error":
      return t("FAULT");
  }
}

function formatResetDate(timestampSeconds: number): string {
  return new Intl.DateTimeFormat(language(), {
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
  return new Intl.DateTimeFormat(language(), {
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
