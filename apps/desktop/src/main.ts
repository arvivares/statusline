import {
  t,
  language,
  setLanguage,
  localizeDocument,
  relayErrorCopy,
} from "./localization";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
import { bindUpdater, refreshUpdaterCopy } from "./updates";
import { signatureMeter } from "./signature-meter";
import {
  serviceIds,
  serviceSettings,
  type ServiceId,
} from "./service-settings";
import {
  acceptClaudeView,
  claudeConnectFailureCopy,
  claudeHasQuota,
  claudeCanConnect,
  claudeIsVisible,
  type ClaudeView,
} from "./claude";
import {
  companionProviders,
  providerWatchlist,
  quotaFocus,
  type ProviderReading,
  type QuotaPeriod,
} from "./provider-focus";
import {
  disabledGoogle,
  googleFailureCopy,
  googleIsVisible,
  newerGoogleView,
  parseGoogleView,
  type GoogleView,
  type GoogleSource,
} from "./antigravity";

const FOCUS_REFRESH_AGE_MS = 60 * 1_000;

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
const sourceSetup = requireElement("source-setup", HTMLDetailsElement);
const servicesTab = requireElement("services-tab", HTMLButtonElement);
const relayTab = requireElement("relay-tab", HTMLButtonElement);
const servicesSettingsView = requireElement(
  "services-settings-view",
  HTMLElement,
);
const servicesScan = requireElement("services-scan", HTMLButtonElement);
const servicesEmpty = requireElement("services-empty", HTMLElement);
const servicesFeedback = requireElement("services-feedback", HTMLElement);
const servicesMore = requireElement("services-more", HTMLDetailsElement);
const servicesMoreLabel = requireElement("services-more-label", HTMLElement);
const serviceRows = serviceIds.map((id) => ({
  id,
  section: requireElement(`service-${id}`, HTMLElement),
  toggle: requireElement(`service-${id}-toggle`, HTMLButtonElement),
  status: requireElement(`service-${id}-status`, HTMLElement),
  content: requireElement(
    id === "codex"
      ? "source-settings-view"
      : id === "google"
        ? "google-settings-view"
        : "claude-settings",
    HTMLElement,
  ),
  setup: requireElement(`setup-${id}`, HTMLButtonElement),
}));
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
const googleSource = requireElement("google-source", HTMLSelectElement);
const googlePath = requireElement("google-path", HTMLInputElement);
const googleSave = requireElement("google-save", HTMLButtonElement);
const googleRemove = requireElement("google-remove", HTMLButtonElement);
const googleFeedback = requireElement("google-feedback", HTMLElement);
const googleDraft = requireElement("google-draft", HTMLElement);
const googleDetection = requireElement("google-detection", HTMLElement);
const googleScan = requireElement("google-scan", HTMLButtonElement);
const claudeConnection = requireElement("claude-connection", HTMLElement);
const claudeConnect = requireElement("claude-connect", HTMLButtonElement);
const claudeDisconnect = requireElement("claude-disconnect", HTMLButtonElement);
const claudeFeedback = requireElement("claude-feedback", HTMLElement);
const claudeActivation = requireElement("claude-activation", HTMLElement);
const claudeActivate = requireElement("claude-activate", HTMLButtonElement);
const claudeActivationFeedback = requireElement(
  "claude-activation-feedback",
  HTMLElement,
);
const providerWatchlistSection = requireElement(
  "provider-watchlist",
  HTMLElement,
);
const providerRows = requireElement("provider-rows", HTMLElement);
const focusHeading = requireElement("focus-heading", HTMLElement);
const focusWindow = requireElement("focus-window", HTMLButtonElement);
const providerIdentity = requireElement("provider-identity", HTMLElement);

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
let googleView: GoogleView = disabledGoogle;
let claudeView: ClaudeView | null = null;
let claudeInitialized = false;
let claudeRefreshing = false;
let claudeActionPending = false;
let selectedProvider = "codex";
const selectedPeriods = new Map<string, QuotaPeriod>();
let googleActionPending = false;
let googleRefreshing = false;
let googleSettingsDirty = false;
let googleInitialized = false;
let servicesScanning = false;
let expandedService: ServiceId | null = null;
const manuallyOpenedServices = new Set<ServiceId>();
let claudeOperationError: unknown = null;

let displayedPercentage: number | null = null;
const meterFill = document.createElement("span");
meterFill.className = "signature-fill";
const meterTip = document.createElement("span");
meterTip.className = "signature-tip";
meterFill.setAttribute("aria-hidden", "true");
meterTip.setAttribute("aria-hidden", "true");
meterTrack.replaceChildren(meterFill, meterTip);
function paintMeter(): void {
  const geometry = signatureMeter(displayedPercentage, meterTrack.clientWidth);
  meterTrack.style.setProperty("--fill", geometry.value + "%");
  meterTrack.style.setProperty("--tip-left", geometry.tipLeft + "px");
  meterTrack.style.setProperty("--tip-width", geometry.tipWidth + "px");
}
new ResizeObserver(paintMeter).observe(meterTrack);

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
  void bindUpdater(true);
}

async function startTauriRuntime(): Promise<void> {
  await refreshLanguage();
  await bindUpdater(false);
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
  await listen<unknown>("antigravity-updated", (event) =>
    acceptGoogle(event.payload),
  );
  await listen<unknown>("claude-updated", (event) =>
    acceptClaude(event.payload),
  );
  void refreshClaude();
  void invoke<unknown>("antigravity_status")
    .then(acceptGoogle)
    .catch(() => {
      googleInitialized = true;
      renderCurrentProvider();
    });
  void refreshSourceDiagnostic();
  void refreshRelayStatus();

  refreshButton.addEventListener("click", () => {
    if (selectedProvider === "google") void refreshGoogle();
    else if (selectedProvider === "claude") void refreshClaude(true);
    else void controller.refresh();
  });

  window.addEventListener("focus", () => {
    if (Date.now() - lastRefreshStartedAt >= FOCUS_REFRESH_AGE_MS) {
      lastRefreshStartedAt = Date.now();
      void invoke<unknown>("current_usage")
        .then((payload) => controller.accept(payload))
        .catch(() => undefined);
    }
  });

  // Scheduling belongs to Rust, even when this WebView is hidden/suspended.
  await listen<unknown>("usage-updated", (event) => {
    lastRefreshStartedAt = Date.now();
    controller.accept(event.payload);
  });

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
  void invoke<unknown>("current_usage")
    .then((payload) => controller.accept(payload))
    .catch(() => controller.refresh());
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
  const params = new URLSearchParams(window.location.search);
  if (
    params.get("google") === "ready" ||
    params.get("google") === "unavailable"
  ) {
    acceptGoogle({
      revision: 1,
      settings: { source: "desktop", path: null, automatic: true },
      usage:
        params.get("google") === "ready"
          ? {
              status: "ready",
              source: "desktop",
              checkedAt: Math.floor(Date.now() / 1000),
              quota: {
                weekly: {
                  remainingPercent: 78,
                  resetsAt: Math.floor(Date.now() / 1000) + 345600,
                },
                shortWindow: {
                  remainingPercent: 24,
                  resetsAt: Math.floor(Date.now() / 1000) + 6120,
                },
              },
            }
          : {
              status: "unavailable",
              source: "desktop",
              checkedAt: Math.floor(Date.now() / 1000),
              reason: "timeout",
            },
    });
    selectedProvider = "google";
    renderCurrentProvider();
  }
  if (params.get("claude") === "detected" || params.get("claude") === "ready") {
    const now = Math.floor(Date.now() / 1000);
    const ready = params.get("claude") === "ready";
    acceptClaude({
      revision: 1,
      checkedAt: now,
      installations: { cli: true, desktop: false },
      status: ready ? "ready" : "quotaUnavailable",
      connection: ready ? "connected" : "none",
      quota: ready
        ? {
            checkedAt: now - 120,
            weekly: null, // Enterprise seats report the five-hour window only.
            shortWindow: { remainingPercent: 48, resetsAt: now + 3000 },
            spendLimit: null,
          }
        : null,
      capturedAt: ready ? now - 120 : null,
    });
    selectedProvider = "claude";
    renderCurrentProvider();
  }
  googleInitialized = true;
  claudeInitialized = true;
  renderClaudeSettings();
  renderServices();
  const previewPanel = new URLSearchParams(window.location.search).get("panel");
  if (
    previewPanel === "source" ||
    previewPanel === "relay" ||
    previewPanel === "google" ||
    previewPanel === "services" ||
    previewPanel === "claude"
  ) {
    selectSettingsView(previewPanel === "relay" ? "relay" : "services");
    if (
      previewPanel === "source" ||
      previewPanel === "google" ||
      previewPanel === "claude"
    )
      expandService(previewPanel === "source" ? "codex" : previewPanel, false);
    openSourcePanel();
  }
  refreshButton.addEventListener("click", () => {
    renderUsage({ status: "loading" });
    window.setTimeout(() => renderUsage(previewReadyState()), 420);
  });
}

function renderUsage(state: UsageState): void {
  lastUsageState = state;
  renderCurrentProvider();
}

function renderCurrentProvider(): void {
  renderServices();
  const providers = companionProviders(
    lastUsageState,
    lastDiagnostic,
    googleView,
    claudeView,
  );
  if (!providers.some((provider) => provider.id === selectedProvider))
    selectedProvider = providers[0]?.id ?? "codex";
  document.body.dataset.provider = selectedProvider;
  document.body.dataset.multiProvider = String(providers.length > 1);
  document.body.dataset.providerCount = String(providers.length);
  document.body.dataset.manyProviders = String(providers.length > 2);
  if (selectedProvider === "google") renderGoogleUsage();
  else if (selectedProvider === "claude") renderClaudeUsage();
  else if (lastUsageState) renderCodexUsage(lastUsageState);
  const selected = providers.find(
    (provider) => provider.id === selectedProvider,
  );
  renderFocusWindow(selected);
  renderClaudeActivation();
  renderWatchlist(providerWatchlist(providers, selectedProvider));
}

function windowLabel(period: QuotaPeriod, minutes?: number): string {
  if (period === "weekly") return t("Weekly");
  const duration = minutes ?? 300;
  return new Intl.NumberFormat(language(), {
    style: "unit",
    unit: duration % 60 === 0 ? "hour" : "minute",
    unitDisplay: "long",
  }).format(duration % 60 === 0 ? duration / 60 : duration);
}

function renderFocusWindow(provider: ProviderReading | undefined): void {
  focusHeading.removeAttribute("data-i18n");
  focusWindow.hidden = true;
  if (!provider) {
    focusHeading.textContent = t("Weekly");
    return;
  }
  const focus = quotaFocus(provider, selectedPeriods.get(provider.id));
  providerIdentity.replaceChildren(
    document.createTextNode(provider.source + " · "),
  );
  const name = document.createElement("strong");
  name.textContent = provider.name;
  providerIdentity.append(name);
  focusHeading.textContent = windowLabel(focus.period, focus.window?.minutes);
  meterTrack.removeAttribute("data-i18n-aria-label");
  meterTrack.setAttribute(
    "aria-label",
    `${provider.source} · ${provider.name} · ${focusHeading.textContent} · ${t("remaining")}`,
  );
  if (!focus.window) return;
  setMeter(focus.window.remainingPercent, false);
  document.body.dataset.level =
    focus.window.remainingPercent <= 20 ? "critical" : "normal";
  resetValue.textContent = formatTime(focus.window.resetsAt);
  resetDetail.textContent = formatResetDate(focus.window.resetsAt);
  shortValue
    .closest(".metric-cell")
    ?.toggleAttribute("hidden", !focus.alternate);
  if (focus.alternate) {
    focusWindow.hidden = false;
    focusWindow.dataset.period = focus.period === "weekly" ? "short" : "weekly";
    shortDetail.textContent = windowLabel(
      focus.period === "weekly" ? "short" : "weekly",
      focus.alternate.minutes,
    );
    shortValue.textContent =
      Math.round(focus.alternate.remainingPercent) + " %";
    focusWindow.setAttribute(
      "aria-label",
      t(
        "View {0}: {1}% remaining",
        shortDetail.textContent,
        Math.round(focus.alternate.remainingPercent),
      ),
    );
  }
}

function renderWatchlist(providers: readonly ProviderReading[]): void {
  // Preserve keyboard focus when a background sample replaces these rows.
  const focusedId =
    document.activeElement instanceof HTMLElement
      ? document.activeElement.closest<HTMLButtonElement>(
          "button[data-provider-id]",
        )?.dataset.providerId
      : undefined;
  providerRows.replaceChildren();
  providerWatchlistSection.hidden = providers.length === 0;
  for (const provider of providers) {
    const focus = quotaFocus(provider, selectedPeriods.get(provider.id));
    const row = document.createElement("button");
    row.type = "button";
    row.className = "quota-row";
    row.dataset.providerId = provider.id;
    row.dataset.status = provider.status;
    row.dataset.connectable = String(
      provider.id === "claude" && claudeCanConnect(claudeView),
    );
    row.dataset.stale = String(
      provider.checkedAt !== null &&
        Date.now() / 1000 - provider.checkedAt > 600,
    );
    const identity = document.createElement("span");
    const name = document.createElement("span");
    name.className = "row-name";
    name.textContent = provider.name;
    const chevron = document.createElement("span");
    chevron.className = "row-chevron";
    chevron.setAttribute("aria-hidden", "true");
    name.append(chevron);
    const source = document.createElement("span");
    source.className = "row-source";
    source.textContent = `${provider.source} · ${windowLabel(focus.period, focus.window?.minutes)}`;
    identity.append(name, source);
    const reading = document.createElement("span");
    reading.className = "row-reading";
    const number = document.createElement("span");
    number.className = "row-number";
    number.textContent = focus.window
      ? String(Math.round(focus.window.remainingPercent))
      : "—";
    reading.append(number);
    if (focus.window) {
      const percent = document.createElement("span");
      percent.className = "row-percent";
      percent.textContent = "%";
      reading.append(percent);
    }
    const age = document.createElement("span");
    age.className = "row-age";
    age.textContent =
      provider.status === "loading"
        ? t("Checking…")
        : provider.status === "unavailable"
          ? provider.id === "claude" && claudeCanConnect(claudeView)
            ? t("Enable quota")
            : t("Unavailable")
          : row.dataset.stale === "true"
            ? t("Stale · {0}", formatTime(provider.checkedAt!))
            : t("Last sample: {0}", formatTime(provider.checkedAt!));
    reading.append(age);
    row.append(identity, reading);
    row.addEventListener("click", () => {
      selectedProvider = provider.id;
      renderCurrentProvider();
      focusHeading.focus({ preventScroll: true });
    });
    providerRows.append(row);
    if (focusedId === provider.id) row.focus({ preventScroll: true });
  }
}

function renderCodexUsage(state: UsageState): void {
  providerIdentity.textContent =
    state.status === "error" && state.code === "codexNotFound"
      ? t("Local source")
      : "OpenAI · Codex";
  meterTrack.setAttribute("aria-label", t("Codex weekly limit"));
  meterTrack.dataset.i18nAriaLabel = "Codex weekly limit";
  planValue
    .closest(".metric-cell")
    ?.querySelector("dt")
    ?.replaceChildren(t("Account"));
  relayValue.closest(".metric-cell")?.removeAttribute("hidden");
  const copy = copyForState(state);
  const liveState = labelForState(state);

  document.body.dataset.state = state.status;
  // Other App Server buckets are not additional Codex quota windows.
  document.body.dataset.multipleLimits = "false";
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
    state.status === "loading" ? t("Reading Codex") : t("Refresh");
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
      shortValue.closest(".metric-cell")?.setAttribute("hidden", "");
      shortDetail.textContent = t("NO SHORT WINDOW");
    } else {
      shortValue.closest(".metric-cell")?.removeAttribute("hidden");
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
    recordValue.textContent = t("AVAILABLE · QUOTA METADATA ONLY");
    updatedValue.textContent = t(
      "Last sample: {0}",
      formatTime(state.checkedAt),
    );

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
    googleInitialized &&
    claudeInitialized &&
    !googleIsVisible(googleView) &&
    !claudeIsVisible(claudeView) &&
    !sourceAutoOpened
  ) {
    sourceAutoOpened = true;
    selectSettingsView("services");
    openSourcePanel();
  }
}

function acceptClaude(payload: unknown): void {
  try {
    claudeView = acceptClaudeView(claudeView, payload);
  } catch {
    return;
  }
  claudeInitialized = true;
  renderClaudeSettings();
  renderCurrentProvider();
}

async function refreshClaude(force = false): Promise<void> {
  if (claudeRefreshing || previewState !== null) return;
  claudeRefreshing = true;
  renderCurrentProvider();
  try {
    acceptClaude(await invoke<unknown>("claude_status", { force }));
  } catch {
    /* Native periodic discovery can recover; keep any known installation. */
  } finally {
    claudeInitialized = true;
    claudeRefreshing = false;
    renderClaudeSettings();
    renderCurrentProvider();
  }
}

function claudeSourceLabel(view: ClaudeView | null): string {
  if (view?.installations.cli)
    return view.installations.desktop
      ? t("CLI and desktop app")
      : "Claude Code CLI";
  if (view?.installations.desktop) return t("Desktop app");
  // Only the bridge proved this installation; its launcher is somewhere custom.
  return "Claude Code";
}

function claudeConnectionLabel(view: ClaudeView | null): string {
  switch (view?.connection) {
    case "connected":
      return t("Statusline bridge connected");
    case "custom":
      return t("Custom status line · connect to chain it");
    case "unknown":
      return t("Claude Code settings not readable");
    default:
      return t("Bridge not connected");
  }
}

function claudeDetailCopy(view: ClaudeView | null): string {
  if (view?.status === "discoveryUnavailable")
    return t(
      "Claude discovery could not finish. Your last detected installation is kept.",
    );
  if (claudeCanConnect(view))
    return t("Credentials and conversations stay with Claude.");
  if (
    view?.connection !== "connected" &&
    view?.installations.desktop &&
    !view.installations.cli
  )
    return t(
      "Claude desktop detected. Install Claude Code to share quota through its status line; detection will run automatically.",
    );
  if (view?.connection === "unknown")
    return t("Claude Code settings not readable");
  if (view?.status === "noPlanQuota") {
    const spend = view.quota?.spendLimit;
    return spend
      ? t(
          "Claude Code reports a gateway spend limit: {0}% used. This account exposes no plan quota windows.",
          Math.round(spend.usedPercent),
        )
      : t(
          "Claude Code reported a session without plan quota. API-key and cloud-provider sessions have no subscription windows.",
        );
  }
  if (view?.connection !== "connected")
    return t("Install Claude Code, then scan again.");
  if (claudeHasQuota(view))
    return t("Claude quota is connected. Credentials stay with Claude Code.");
  if (view.capturedAt)
    return t(
      "Every captured window has reset. Quota appears again on the next Claude Code response.",
    );
  return t(
    "Bridge connected. Quota appears after a Claude Code session receives its first response.",
  );
}

function renderClaudeUsage(): void {
  const view = claudeView;
  const ready = claudeHasQuota(view);
  const quota = ready ? view!.quota : null;
  // Focus on the window every plan reports; Enterprise seats may lack weekly.
  const focus = quota?.shortWindow ?? quota?.weekly ?? null;
  const focusWeekly = !quota?.shortWindow && !!quota?.weekly;
  document.body.dataset.state = ready ? "ready" : "unavailable";
  document.body.dataset.multipleLimits = String(
    !!quota?.shortWindow && !!quota?.weekly,
  );
  document.body.dataset.level =
    focus && focus.remainingPercent <= 20 ? "critical" : "normal";
  shell.setAttribute("aria-busy", String(claudeRefreshing));
  meterTrack.setAttribute(
    "aria-label",
    focusWeekly ? t("Claude weekly limit") : t("Claude five-hour limit"),
  );
  meterTrack.dataset.i18nAriaLabel = focusWeekly
    ? "Claude weekly limit"
    : "Claude five-hour limit";
  setMeter(focus?.remainingPercent ?? null, claudeRefreshing && !ready);
  liveLabel.textContent = claudeRefreshing
    ? t("READING")
    : ready
      ? t("LIVE")
      : t("UNAVAILABLE");
  statusValue.textContent = liveLabel.textContent;
  refreshButton.disabled = claudeRefreshing;
  refreshLabel.textContent = claudeRefreshing ? t("Checking…") : t("Refresh");
  resetValue.textContent = focus ? formatTime(focus.resetsAt) : "—";
  resetDetail.textContent = focus
    ? formatResetDate(focus.resetsAt)
    : t("NOT PUBLISHED");
  // The secondary cell shows whichever window is not in focus.
  const secondary = focusWeekly ? null : (quota?.weekly ?? null);
  shortValue.closest(".metric-cell")?.toggleAttribute("hidden", !secondary);
  if (secondary) {
    shortValue.textContent = t(
      "{0}% LEFT",
      Math.round(secondary.remainingPercent),
    );
    shortDetail.textContent = t("{0} WINDOW", formatWindow(10080));
  }
  planValue
    .closest(".metric-cell")
    ?.querySelector("dt")
    ?.replaceChildren(t("Local source"));
  planValue.textContent = claudeSourceLabel(view);
  planDetail.textContent = claudeConnectionLabel(view);
  // Only an acknowledged services publication can label Claude as synced.
  const published =
    ready && lastRelayState?.status === "connected"
      ? lastRelayState.servicesPublishedAt
      : null;
  relayValue.closest(".metric-cell")?.toggleAttribute("hidden", !published);
  if (published) {
    relayValue.textContent = t("Synced");
    relayDetail.textContent = t("Last sample: {0}", formatTime(published));
  }
  title.textContent =
    view?.status === "noPlanQuota"
      ? t("Claude session without plan quota")
      : t("Claude detected · quota pending");
  detail.textContent = claudeDetailCopy(view);
  updatedValue.textContent = quota
    ? t("Last sample: {0}", formatTime(quota.checkedAt))
    : view?.capturedAt
      ? t("Last Claude Code session: {0}", formatTime(view.capturedAt))
      : view
        ? t("Installation checked: {0}", formatTime(view.checkedAt))
        : "—";
  sampleValue.textContent = quota ? formatTime(quota.checkedAt) : "—";
  recordValue.textContent = quota
    ? t("Reported by Claude Code · {0}", formatTime(quota.checkedAt))
    : t("No quota sample available");
}

function renderClaudeSettings(): void {
  const view = claudeView;
  const visible = claudeIsVisible(view) || view?.connection === "connected";
  const connected = view?.connection === "connected";
  claudeConnection.textContent = visible
    ? view?.connection === "none" &&
      view.installations.desktop &&
      !view.installations.cli &&
      !view.capturedAt
      ? t(
          "Claude desktop detected. Install Claude Code to share quota through its status line; detection will run automatically.",
        )
      : claudeConnectionLabel(view)
    : t("Install Claude Code, then scan again.");
  claudeConnect.hidden = connected;
  claudeDisconnect.hidden = !connected;
  claudeConnect.disabled = claudeActionPending || !claudeCanConnect(view);
  claudeDisconnect.disabled = claudeActionPending;
  if (!claudeActionPending)
    claudeFeedback.textContent =
      claudeOperationError !== null
        ? claudeConnectFailureCopy(claudeOperationError)
        : connected
          ? claudeHasQuota(view)
            ? t("Claude quota is connected. Credentials stay with Claude Code.")
            : claudeDetailCopy(view)
          : "";
  renderClaudeActivation();
  renderServices();
}

function renderClaudeActivation(): void {
  claudeActivation.hidden =
    selectedProvider !== "claude" || !claudeCanConnect(claudeView);
  claudeActivate.disabled =
    claudeActionPending || !claudeCanConnect(claudeView);
  claudeActivation.setAttribute("aria-busy", String(claudeActionPending));
  claudeActivationFeedback.textContent = claudeActionPending
    ? t("Writing Claude Code status line…")
    : claudeOperationError !== null
      ? claudeConnectFailureCopy(claudeOperationError)
      : "";
}

async function saveClaude(connect: boolean): Promise<void> {
  if (claudeActionPending || previewState !== null) return;
  if (connect && !claudeCanConnect(claudeView)) return;
  const activatedInline = document.activeElement === claudeActivate;
  claudeActionPending = true;
  claudeOperationError = null;
  claudeConnect.disabled = true;
  claudeDisconnect.disabled = true;
  claudeFeedback.textContent = connect
    ? t("Writing Claude Code status line…")
    : t("Restoring Claude Code status line…");
  renderClaudeActivation();
  try {
    const payload = await invoke<unknown>(
      connect ? "connect_claude" : "disconnect_claude",
    );
    // Move focus before hiding the inline control, without stealing it if the
    // user navigated elsewhere while waiting for the native operation.
    if (
      connect &&
      activatedInline &&
      selectedProvider === "claude" &&
      sourcePanel.hidden &&
      (document.activeElement === claudeActivate ||
        document.activeElement === document.body)
    )
      focusHeading.focus();
    acceptClaude(payload);
    claudeActionPending = false;
    claudeFeedback.textContent = connect
      ? t(
          "Connected. Open or continue a Claude Code session; quota appears after its first response.",
        )
      : t("Disconnected. Your previous status line is restored.");
  } catch (error) {
    claudeActionPending = false;
    claudeOperationError = error ?? "settingsUnavailable";
    claudeFeedback.textContent = claudeConnectFailureCopy(claudeOperationError);
  } finally {
    claudeActionPending = false;
    renderClaudeSettings();
    renderCurrentProvider();
  }
}

function acceptGoogle(payload: unknown): void {
  try {
    googleView = newerGoogleView(googleView, parseGoogleView(payload));
  } catch {
    return;
  } // Do not replace a known service with malformed IPC data.
  googleInitialized = true;
  if (!googleSettingsDirty) {
    googleSource.value = googleView.settings.automatic
      ? "automatic"
      : (googleView.settings.source ?? "");
    googlePath.value = googleView.settings.path ?? "";
  }
  googlePath.disabled =
    googleActionPending || ["", "automatic"].includes(googleSource.value);
  googleRemove.hidden =
    googleView.settings.source === null && !googleView.settings.automatic;
  googleDetection.textContent = googleView.settings.source
    ? t(
        "Detected source: {0}",
        googleView.settings.source === "cli" ? "AGY CLI" : t("Desktop app"),
      )
    : t("Not detected");
  if (!googleActionPending)
    googleFeedback.textContent =
      googleView.usage.status === "unavailable"
        ? googleFailureCopy(googleView.usage.reason)
        : googleView.usage.status === "ready"
          ? t("Google quota is connected. Credentials stay with Antigravity.")
          : googleView.settings.automatic
            ? t(
                "No Antigravity installation found. Discovery will check again automatically.",
              )
            : t(
                "Antigravity is disabled. Enable automatic detection to show it again.",
              );
  renderCurrentProvider();
}

function renderGoogleUsage(): void {
  const usage = googleView.usage;
  const ready = usage.status === "ready";
  const weekly = ready ? usage.quota.weekly : null;
  document.body.dataset.state = ready ? "ready" : "unavailable";
  document.body.dataset.multipleLimits = "false";
  document.body.dataset.level =
    weekly && weekly.remainingPercent <= 20 ? "critical" : "normal";
  shell.setAttribute("aria-busy", String(googleRefreshing));
  providerIdentity.textContent = "Google · Antigravity";
  meterTrack.setAttribute("aria-label", t("Gemini weekly limit"));
  meterTrack.dataset.i18nAriaLabel = "Gemini weekly limit";
  setMeter(weekly?.remainingPercent ?? null, googleRefreshing && !ready);
  liveLabel.textContent = googleRefreshing
    ? t("READING")
    : ready
      ? t("LIVE")
      : t("UNAVAILABLE");
  refreshButton.disabled = googleRefreshing || googleActionPending;
  refreshLabel.textContent = googleRefreshing
    ? t("Reading Antigravity")
    : t("Refresh");
  resetValue.textContent = weekly
    ? formatTime(weekly.resetsAt)
    : t("NOT PUBLISHED");
  resetDetail.textContent = weekly ? formatResetDate(weekly.resetsAt) : "";
  shortValue
    .closest(".metric-cell")
    ?.toggleAttribute("hidden", !ready || !usage.quota.shortWindow);
  if (ready && usage.quota.shortWindow) {
    shortValue.textContent = t(
      "{0}% LEFT",
      Math.round(usage.quota.shortWindow.remainingPercent),
    );
    shortDetail.textContent = t("{0} WINDOW", formatWindow(300));
  }
  planValue
    .closest(".metric-cell")
    ?.querySelector("dt")
    ?.replaceChildren(t("Local source"));
  planValue.textContent =
    googleView.settings.source === "cli" ? "AGY CLI" : t("Desktop app");
  planDetail.textContent = "Google · Gemini";
  // Only an acknowledged services publication can label Gemini as synced.
  const googlePublished =
    lastRelayState?.status === "connected"
      ? lastRelayState.servicesPublishedAt
      : null;
  relayValue
    .closest(".metric-cell")
    ?.toggleAttribute("hidden", !googlePublished);
  if (googlePublished) {
    relayValue.textContent = t("Synced");
    relayDetail.textContent = t(
      "Last sample: {0}",
      formatTime(googlePublished),
    );
  }
  title.textContent = t("Google quota unavailable");
  detail.textContent =
    usage.status === "unavailable"
      ? googleFailureCopy(usage.reason)
      : t("No Antigravity service is enabled.");
  updatedValue.textContent =
    usage.status === "disabled"
      ? "—"
      : usage.status === "ready"
        ? t("Last sample: {0}", formatTime(usage.checkedAt))
        : t("Last attempt: {0}", formatTime(usage.checkedAt));
}

async function refreshGoogle(force = false): Promise<void> {
  if (googleRefreshing || googleActionPending || previewState !== null) return;
  googleRefreshing = true;
  renderCurrentProvider();
  try {
    acceptGoogle(await invoke<unknown>("antigravity_status", { force }));
  } catch {
    googleFeedback.textContent = googleFailureCopy("sourceUnavailable");
  } finally {
    googleRefreshing = false;
    renderCurrentProvider();
  }
}

async function saveGoogle(remove = false): Promise<void> {
  if (googleActionPending || previewState !== null) return;
  googleActionPending = true;
  for (const element of [
    googleSource,
    googlePath,
    googleSave,
    googleRemove,
    googleScan,
  ])
    element.disabled = true;
  googleFeedback.textContent = t("Reading Antigravity");
  const settings = {
    automatic: !remove && googleSource.value === "automatic",
    source: remove
      ? null
      : googleSource.value === "automatic"
        ? googleView.settings.automatic
          ? googleView.settings.source
          : null
        : ((googleSource.value || null) as GoogleSource | null),
    path:
      remove || !googleSource.value || googleSource.value === "automatic"
        ? null
        : googlePath.value.trim() || null,
  };
  try {
    const result = await invoke<unknown>("configure_antigravity", { settings });
    googleSettingsDirty = false;
    googleActionPending = false;
    acceptGoogle(result);
  } catch (reason) {
    googleFeedback.textContent = googleFailureCopy(reason);
  } finally {
    googleActionPending = false;
    for (const element of [
      googleSource,
      googlePath,
      googleSave,
      googleRemove,
      googleScan,
    ])
      element.disabled = false;
    googlePath.disabled = ["", "automatic"].includes(googleSource.value);
    renderCurrentProvider();
  }
}

function renderServices(): void {
  googleSave.disabled = googleActionPending || !googleSettingsDirty;
  googleDraft.hidden = !googleSettingsDirty;
  const settings = serviceSettings(
    lastDiagnostic,
    lastUsageState,
    googleInitialized ? googleView : null,
    claudeView,
  );
  let visible = 0;
  for (const state of settings) {
    const row = serviceRows.find((item) => item.id === state.id)!;
    const show = state.present || manuallyOpenedServices.has(state.id);
    if (!show && row.section.contains(document.activeElement))
      servicesScan.focus();
    row.section.hidden = !show;
    row.setup.hidden = show;
    if (show) visible++;
    const reading =
      state.id === "codex"
        ? sourceActionPending
        : state.id === "google"
          ? googleRefreshing || googleActionPending
          : claudeRefreshing || claudeActionPending;
    row.status.textContent = t(reading ? "Checking…" : state.label);
    row.status.dataset.tone = reading ? "reading" : state.tone;
  }
  servicesEmpty.hidden = visible > 0;
  servicesEmpty.textContent =
    servicesScanning || !googleInitialized || !claudeInitialized
      ? t("Looking for installed agents…")
      : t(
          "No services detected. Open an installed agent and sign in, then scan again.",
        );
  servicesMore.hidden = visible === serviceRows.length;
  servicesMoreLabel.textContent =
    visible === 0 ? t("Set up a service") : t("Set up another service");
  servicesScan.disabled =
    servicesScanning ||
    sourceActionPending ||
    googleRefreshing ||
    googleActionPending ||
    claudeRefreshing ||
    claudeActionPending ||
    previewState !== null;
  servicesScan.classList.toggle("is-scanning", servicesScanning);
}

function expandService(id: ServiceId | null, moveFocus = true): void {
  if (id) manuallyOpenedServices.add(id);
  expandedService = id;
  for (const row of serviceRows) {
    const open = row.id === id;
    row.toggle.setAttribute("aria-expanded", String(open));
    row.content.hidden = !open;
  }
  renderServices();
  if (id && moveFocus) {
    const row = serviceRows.find((item) => item.id === id)!;
    row.toggle.focus({ preventScroll: true });
    row.section.scrollIntoView({ block: "nearest" });
  }
}

async function scanServices(): Promise<void> {
  if (servicesScan.disabled) return;
  servicesScanning = true;
  servicesFeedback.textContent = t("Looking for installed agents…");
  renderServices();
  try {
    await Promise.all([
      refreshSourceDiagnostic(),
      refreshGoogle(true),
      refreshClaude(true),
    ]);
  } finally {
    servicesScanning = false;
    servicesFeedback.textContent = t(
      "Scan finished. Each service shows its current status.",
    );
    renderServices();
  }
}

function bindSourcePanel(): void {
  for (const row of serviceRows) {
    row.toggle.addEventListener("click", () =>
      expandService(expandedService === row.id ? null : row.id),
    );
    row.setup.addEventListener("click", () => {
      servicesMore.open = false;
      expandService(row.id);
    });
  }
  servicesScan.addEventListener("click", () => void scanServices());
  focusWindow.addEventListener("click", () => {
    selectedPeriods.set(
      selectedProvider,
      focusWindow.dataset.period === "short" ? "short" : "weekly",
    );
    renderCurrentProvider();
  });
  googleScan.addEventListener("click", () => void refreshGoogle(true));
  googleSave.addEventListener("click", () => void saveGoogle());
  googleRemove.addEventListener("click", () => void saveGoogle(true));
  claudeConnect.addEventListener("click", () => void saveClaude(true));
  claudeActivate.addEventListener("click", () => void saveClaude(true));
  claudeDisconnect.addEventListener("click", () => void saveClaude(false));
  googleSource.addEventListener("change", () => {
    googleSettingsDirty = true;
    googlePath.value = "";
    googlePath.disabled = ["", "automatic"].includes(googleSource.value);
    renderServices();
  });
  googlePath.addEventListener("input", () => {
    googleSettingsDirty = true;
    renderServices();
  });
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
  servicesTab.addEventListener("click", () => {
    selectSettingsView("services", true);
  });
  relayTab.addEventListener("click", () => {
    selectSettingsView("relay", true);
  });
  servicesTab.addEventListener("keydown", navigateSettingsTabs);
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
  for (const surface of shell.querySelectorAll<HTMLElement>(
    ".topbar, .quota-plane, .footer",
  ))
    surface.inert = true;
  settingsButton.setAttribute("aria-expanded", "true");
  sourceClose.focus();
  if (!servicesSettingsView.hidden && sourceRuntime !== null) {
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
  for (const surface of shell.querySelectorAll<HTMLElement>(
    ".topbar, .quota-plane, .footer",
  ))
    surface.inert = false;
  settingsButton.setAttribute("aria-expanded", "false");
  focusBeforeSourcePanel?.focus();
  focusBeforeSourcePanel = null;
}

function selectSettingsView(
  view: "services" | "relay",
  moveFocus = false,
): void {
  const showServices = view === "services";
  servicesSettingsView.hidden = !showServices;
  relaySettingsView.hidden = view !== "relay";
  const selectedTab = showServices ? servicesTab : relayTab;
  for (const tab of [servicesTab, relayTab]) {
    tab.setAttribute("aria-selected", String(tab === selectedTab));
    tab.tabIndex = tab === selectedTab ? 0 : -1;
  }
  if (moveFocus) {
    selectedTab.focus();
  }
  if (showServices) {
    pausePairingPoll();
    void refreshSourceDiagnostic();
  } else if (view === "relay") {
    void refreshRelayStatus();
  } else pausePairingPoll();
}

function navigateSettingsTabs(event: KeyboardEvent): void {
  if (!matchesSettingsTabNavigation(event.key)) {
    return;
  }
  event.preventDefault();
  const tabs = [servicesTab, relayTab];
  const index = tabs.indexOf(event.currentTarget as HTMLButtonElement);
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowLeft" ? tabs.length - 1 : 1)) %
          tabs.length;
  const view = (["services", "relay"] as const)[next];
  if (view) selectSettingsView(view, true);
}

function matchesSettingsTabNavigation(key: string): boolean {
  return ["ArrowLeft", "ArrowRight", "Home", "End"].includes(key);
}

async function refreshSourceDiagnostic(): Promise<void> {
  if (sourceRuntime === null || sourceActionPending) {
    return;
  }
  setSourceBusy(t("Scanning local installs"));
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

  setSourceControlsDisabled(true);
  try {
    // Native code protects the parent against blur while the OS picker is open.
    const selected = await invoke<string | null>("choose_codex_executable");
    if (selected === null) return;
    setSourceBusy(t("Verifying Codex --version"));
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
  setSourceBusy(t("Resetting source"));
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
  const previousStatus = lastDiagnostic?.status;
  lastDiagnostic = diagnostic;
  renderCurrentProvider();
  if (previousStatus !== diagnostic.status) {
    sourceSetup.open = diagnostic.status !== "ready";
  }
  sourceSummary.dataset.status = diagnostic.status;
  sourceStatus.textContent =
    diagnostic.status === "ready"
      ? t("Verified")
      : diagnostic.status === "missing"
        ? t("Not found")
        : t("Invalid source");
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
  sourceStatus.textContent = t("Check failed");
  sourceFeedback.textContent = errorMessage(error);
}

function setSourceBusy(message: string): void {
  sourceActionPending = true;
  setSourceControlsDisabled(true);
  sourceSummary.dataset.status = "reading";
  sourceStatus.textContent = t("Reading Codex");
  sourceFeedback.textContent = message;
}

function setSourceControlsDisabled(disabled: boolean): void {
  sourceActionPending = disabled;
  sourceChoose.disabled = disabled;
  sourceScan.disabled = disabled;
  sourceReset.disabled = disabled;
  renderServices();
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
  setRelayBusy(t("Creating encrypted channel"));
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
  setRelayBusy(t("Removing local relay credentials"));
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
  relayPublished.textContent = t("No sample published");
  relayDetail.textContent = t("E2E / AES-256-GCM");

  switch (state.status) {
    case "notConfigured":
      relaySummary.dataset.status = "invalid";
      relayStatus.textContent = t("Not configured");
      relayValue.textContent = t("UNAVAILABLE");
      relayDetail.textContent = t("INSTALLER CONFIG");
      relayPublished.textContent = t("Relay URL not configured");
      relayConnect.disabled = true;
      relayFeedback.textContent = t(
        "This build needs STATUSLINE_RELAY_BASE_URL pointing to the public HTTPS relay.",
      );
      break;
    case "unpaired":
      relaySummary.dataset.status = "offline";
      relayStatus.textContent = t("Ready to pair");
      relayValue.textContent = t("OFFLINE");
      relayConnect.textContent = t("Create pairing");
      relayFeedback.textContent = t(
        "Create a private QR for Statusline on iOS or Android. No platform account is required.",
      );
      break;
    case "creating":
      relaySummary.dataset.status = "reading";
      relayStatus.textContent = t("Creating channel");
      relayValue.textContent = t("PAIRING");
      relayConnect.textContent = t("Creating…");
      relayConnect.disabled = true;
      relayFeedback.textContent = t(
        "Generating independent read/write credentials.",
      );
      break;
    case "pairing":
      relaySummary.dataset.status = "reading";
      relayStatus.textContent = t("Scan on mobile");
      relayValue.textContent = t("PAIRING");
      relayConnect.textContent = t("Replace pairing");
      relayDisconnect.hidden = false;
      relayPairing.hidden = false;
      currentPairingURI = state.pairingUri;
      relayPairingLink.textContent = state.pairingUri;
      relayPublished.textContent = t(
        "QR expires {0}",
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
        state.lastPublishedAt === null ? t("Connected") : t("Synced");
      relayValue.textContent =
        state.lastPublishedAt === null ? t("CONNECTED") : t("SYNCED");
      relayConnect.textContent = t("Replace pairing");
      relayDisconnect.hidden = false;
      relayPublished.textContent =
        state.lastPublishedAt === null
          ? t("Waiting for local sample")
          : t("{0} · Encrypted snapshot", formatTime(state.lastPublishedAt));
      relayFeedback.textContent =
        state.lastPublishedAt === null
          ? t("Paired. Refresh Codex to publish the first encrypted snapshot.")
          : t(
              "The latest quota sample is available to paired iOS and Android clients.",
            );
      break;
    case "error":
      relaySummary.dataset.status = "invalid";
      relayStatus.textContent = t("Sync needs attention");
      relayValue.textContent = t("SYNC ERROR");
      relayConnect.textContent = t("Create new pairing");
      relayDisconnect.hidden = !state.hasPairing;
      relayPublished.textContent = t("Status unavailable");
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
  relayStatus.textContent = t("Working");
  relayValue.textContent = t("PAIRING");
  relayDetail.textContent = t("E2E / AES-256-GCM");
  relayPublished.textContent = t("Waiting for relay");
  relayFeedback.textContent = message;
  relayConnect.disabled = true;
  relayDisconnect.disabled = true;
}

function renderRelayFailure(message: string): void {
  relaySummary.dataset.status = "invalid";
  relayStatus.textContent = t("Check failed");
  relayValue.textContent = t("SYNC ERROR");
  relayDetail.textContent = t("E2E / AES-256-GCM");
  relayPublished.textContent = t("Status unavailable");
  relayFeedback.textContent = message;
  relayConnect.textContent = t("Retry pairing");
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
  relayStatus.textContent = t("QR expired");
  relayValue.textContent = t("OFFLINE");
  relayDetail.textContent = t("PAIRING WINDOW CLOSED");
  relayPublished.textContent = t("No active QR");
  relayConnect.textContent = t("Create new pairing");
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
    relayCopy.textContent = t("Copied");
    window.setTimeout(() => {
      relayCopy.textContent = t("Copy private link");
    }, 1_500);
  } catch {
    relayFeedback.textContent = t(
      "Clipboard access failed. Select and copy the private link manually.",
    );
  }
}

function compactEndpoint(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return t("Invalid endpoint");
  }
}

function relayStorageLabel(): void {
  const platform = navigator.userAgent;
  const label = platform.includes("Windows")
    ? t("Credential Manager")
    : platform.includes("Linux")
      ? t("Secret Service")
      : t("System keychain");
  relayStorage.textContent = label;
}

function trapSourcePanelFocus(event: KeyboardEvent): void {
  if (event.key !== "Tab") {
    return;
  }
  const focusable = [
    ...sourcePanel.querySelectorAll<HTMLElement>(
      "button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex]",
    ),
  ].filter(
    (element) => element.tabIndex >= 0 && element.getClientRects().length > 0,
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
  if (googleInitialized) acceptGoogle(googleView);
  if (claudeInitialized) renderClaudeSettings();
  if (lastDiagnostic && !sourceActionPending)
    renderCodexDiagnostic(lastDiagnostic);
  if (lastRelayState && !relayActionPending) renderRelayStatus(lastRelayState);
  refreshUpdaterCopy();
}

function errorMessage(_error: unknown): string {
  // Backend / OS prose is not a UI contract and may contain paths or credentials.
  return t("Statusline could not complete the operation. Please try again.");
}

function setMeter(percentage: number | null, loading: boolean): void {
  meterTrack.classList.toggle("is-loading", loading);

  displayedPercentage = percentage;
  paintMeter();

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
      return t("AVAILABLE");
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
