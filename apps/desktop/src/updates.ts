import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { localizeDocument, t, type MessageKey } from "./localization";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "current"
  | "available"
  | "downloading"
  | "installing"
  | "installed"
  | "error";

const updaterErrorCodes = [
  "checkFailed",
  "downloadFailed",
  "installFailed",
  "preferencesFailed",
  "unavailable",
] as const;
export type UpdaterErrorCode = (typeof updaterErrorCodes)[number];

export type UpdaterStatus = Readonly<{
  phase: UpdatePhase;
  currentVersion: string;
  version: string | null;
  automatic: boolean;
  dismissedVersion: string | null;
  installable: boolean;
  downloaded: number;
  total: number | null;
  error: UpdaterErrorCode | null;
}>;

export type UpdateAction = "check" | "install" | "downloads";
export type UpdateCommand =
  | "updater_status"
  | "check_for_updates"
  | "install_update"
  | "set_update_automatic"
  | "dismiss_update"
  | "open_update_release";
export type UpdateRuntime = (
  command: UpdateCommand,
  args?: Record<string, unknown>,
) => Promise<unknown>;

const phaseCopy: Record<
  UpdatePhase,
  { label: MessageKey; title: MessageKey; detail: MessageKey }
> = {
  idle: {
    label: "Updates",
    title: "Companion updates",
    detail: "Check for a new version of Statusline Companion.",
  },
  checking: {
    label: "Checking…",
    title: "Checking for updates",
    detail: "Looking for a new official release.",
  },
  current: {
    label: "Up to date",
    title: "You're up to date",
    detail: "This is the latest version of Statusline Companion.",
  },
  available: {
    label: "Update available",
    title: "Update available",
    detail: "A new version of Statusline Companion is ready.",
  },
  downloading: {
    label: "Downloading…",
    title: "Downloading update",
    detail:
      "The download continues when you close this panel or hide the window.",
  },
  installing: {
    label: "Installing…",
    title: "Installing update",
    detail:
      "Installation continues in the background. Statusline Companion will restart when ready.",
  },
  installed: {
    label: "Update installed",
    title: "Update installed",
    detail: "The update is installed. Statusline Companion is restarting.",
  },
  error: {
    label: "Update needs attention",
    title: "Could not complete the update",
    detail: "Statusline could not complete the update. Please try again.",
  },
};

const initialStatus: UpdaterStatus = {
  phase: "idle",
  currentVersion: "—",
  version: null,
  automatic: false,
  dismissedVersion: null,
  installable: false,
  downloaded: 0,
  total: null,
  error: null,
};

function updaterErrorCode(value: unknown): UpdaterErrorCode | null {
  return updaterErrorCodes.find((code) => code === value) ?? null;
}

export function parseUpdaterStatus(payload: unknown): UpdaterStatus {
  if (typeof payload !== "object" || payload === null) {
    throw new Error("Invalid updater status");
  }
  const status = payload as Record<string, unknown>;
  const nullableString = (value: unknown) =>
    value === null || typeof value === "string";
  if (
    typeof status.phase !== "string" ||
    !Object.hasOwn(phaseCopy, status.phase) ||
    typeof status.currentVersion !== "string" ||
    !nullableString(status.version) ||
    !nullableString(status.dismissedVersion) ||
    !nullableString(status.error) ||
    typeof status.automatic !== "boolean" ||
    typeof status.installable !== "boolean" ||
    typeof status.downloaded !== "number" ||
    !Number.isFinite(status.downloaded) ||
    (status.total !== null &&
      (typeof status.total !== "number" || !Number.isFinite(status.total)))
  ) {
    throw new Error("Invalid updater status");
  }
  // Only documented codes survive this boundary; native prose is never UI copy.
  return {
    ...(status as UpdaterStatus),
    error: updaterErrorCode(status.error),
  };
}

export function updateInProgress(phase: UpdatePhase): boolean {
  return ["checking", "downloading", "installing", "installed"].includes(phase);
}

export function updateProgress(
  downloaded: number,
  total: number | null,
): number | null {
  if (total === null || !Number.isFinite(total) || total <= 0) return null;
  const safeDownloaded = Number.isFinite(downloaded) ? downloaded : 0;
  return Math.round(Math.min(1, Math.max(0, safeDownloaded / total)) * 100);
}

export function copyForUpdate(status: UpdaterStatus) {
  const copy = phaseCopy[status.phase];
  const downloadsAvailable =
    status.phase === "error" &&
    status.error === "installFailed" &&
    Boolean(status.version);
  const action: UpdateAction | null = updateInProgress(status.phase)
    ? null
    : status.phase === "available" && status.version
      ? status.installable
        ? "install"
        : "downloads"
      : "check";
  return {
    label: t(copy.label),
    title: t(copy.title),
    detail: downloadsAvailable
      ? t(
          "The update could not be installed. You can install it manually from the official downloads.",
        )
      : t(copy.detail),
    action,
    downloadsAvailable,
    actionLabel:
      action === "install"
        ? t("Download & install")
        : action === "downloads"
          ? t("View downloads")
          : status.phase === "error"
            ? t("Retry check")
            : t("Check for updates"),
    note:
      action === "install"
        ? t(
            "Statusline Companion will restart after installation. Windows may ask for permission to install the update.",
          )
        : action === "downloads"
          ? t(
              "Install the DEB or RPM from the official release page using your package manager.",
            )
          : null,
    progress:
      status.phase === "downloading"
        ? updateProgress(status.downloaded, status.total)
        : null,
  };
}

// Decisions are independent of DOM/IPC so focus and dismissal races are testable.
export class UpdateNotices {
  private shown = new Set<string>();
  private dismissed = new Set<string>();

  dismiss(version: string): void {
    this.dismissed.add(version);
  }

  take(status: UpdaterStatus, focused: boolean): boolean {
    const version = status.version;
    if (
      !focused ||
      status.phase !== "available" ||
      !status.automatic ||
      !version ||
      status.dismissedVersion === version ||
      this.dismissed.has(version) ||
      this.shown.has(version)
    )
      return false;
    this.shown.add(version);
    return true;
  }

  markShown(status: UpdaterStatus): void {
    if (status.phase === "available" && status.version)
      this.shown.add(status.version);
  }
}

export class UpdaterController {
  status: UpdaterStatus = initialStatus;
  ready = false;
  pending = false;
  preferencePending = false;
  feedback: MessageKey | null = null;
  readonly notices = new UpdateNotices();
  private revision = 0;
  private readSequence = 0;
  private dismissals = new Set<string>();

  constructor(
    private readonly runtime: UpdateRuntime,
    private readonly changed: () => void,
  ) {}

  accept(payload: unknown): void {
    this.revision++;
    this.ready = true;
    try {
      this.status = parseUpdaterStatus(payload);
    } catch {
      this.status = { ...this.status, phase: "error", error: null };
    }
    this.changed();
  }

  async refresh(): Promise<void> {
    const revision = this.revision;
    const sequence = ++this.readSequence;
    try {
      const payload = await this.runtime("updater_status");
      if (revision === this.revision && sequence === this.readSequence)
        this.accept(payload);
    } catch {
      if (revision !== this.revision || sequence !== this.readSequence) return;
      this.ready = true;
      // A failed read must not turn an active native install into a retry button.
      if (
        !updateInProgress(this.status.phase) &&
        this.status.phase !== "error"
      ) {
        this.status = { ...this.status, phase: "error", error: null };
      }
      this.changed();
    }
  }

  get disabled(): boolean {
    return (
      !this.ready ||
      this.pending ||
      this.preferencePending ||
      updateInProgress(this.status.phase)
    );
  }

  async act(secondary?: "downloads"): Promise<void> {
    const copy = copyForUpdate(this.status);
    const action = secondary
      ? copy.downloadsAvailable
        ? secondary
        : null
      : copy.action;
    if (this.disabled || !action) return;
    const version = this.status.version;
    const previous = this.status;
    const revision = ++this.revision;
    this.pending = true;
    this.feedback = null;
    if (action === "check") {
      this.status = {
        ...this.status,
        phase: "checking",
        downloaded: 0,
        total: null,
      };
    } else if (action === "install") {
      this.status = {
        ...this.status,
        phase: "downloading",
        downloaded: 0,
        total: null,
      };
    }
    this.changed();
    try {
      const result =
        action === "check"
          ? await this.runtime("check_for_updates")
          : action === "install"
            ? await this.runtime("install_update", { version })
            : await this.runtime("open_update_release");
      // Native download/install failures resolve with an error status. Accept it
      // even if the follow-up read fails; newer events still take precedence.
      if (result != null && revision === this.revision) this.accept(result);
      await this.refresh();
    } catch {
      if (action === "downloads") {
        this.feedback = "Could not open downloads. Please try again.";
      } else if (revision === this.revision) {
        this.status = { ...previous, phase: "error", error: null };
      }
    } finally {
      this.pending = false;
      this.changed();
    }
  }

  async setAutomatic(enabled: boolean): Promise<void> {
    if (this.disabled || enabled === this.status.automatic) return;
    this.preferencePending = true;
    this.feedback = null;
    this.changed();
    const revision = this.revision;
    try {
      const result = await this.runtime("set_update_automatic", { enabled });
      if (result != null && revision === this.revision) this.accept(result);
      await this.refresh();
    } catch {
      this.feedback = "Could not save the update preference. Please try again.";
    } finally {
      this.preferencePending = false;
      this.changed();
    }
  }

  async dismiss(): Promise<void> {
    const version = this.status.version;
    if (
      this.status.phase !== "available" ||
      !version ||
      this.dismissals.has(version)
    )
      return;
    // Suppress repeated events immediately, even while persistence is in flight.
    this.notices.dismiss(version);
    this.dismissals.add(version);
    try {
      await this.runtime("dismiss_update", { version });
      if (this.status.version === version)
        this.status = { ...this.status, dismissedVersion: version };
    } catch {
      this.dismissals.delete(version);
      this.feedback =
        "Could not save this dismissal. The update may appear again next time.";
    }
    this.changed();
  }
}

export function previewUpdaterStatus(
  phase: string | null,
  error?: string | null,
): UpdaterStatus {
  const selected =
    phase && Object.hasOwn(phaseCopy, phase) ? (phase as UpdatePhase) : "idle";
  return {
    ...initialStatus,
    phase: selected,
    currentVersion: "0.1.17",
    version: [
      "available",
      "downloading",
      "installing",
      "installed",
      "error",
    ].includes(selected)
      ? "0.1.18"
      : null,
    automatic: true,
    installable: true,
    downloaded: selected === "downloading" ? 42 : 0,
    total: selected === "downloading" ? 100 : null,
    error: selected === "error" ? updaterErrorCode(error) : null,
  };
}

export function createPreviewUpdaterRuntime(
  initial: UpdaterStatus,
): UpdateRuntime {
  let status = initial;
  return async (command, args) => {
    switch (command) {
      case "check_for_updates":
        status = { ...status, phase: "current", version: null, error: null };
        break;
      case "install_update":
        status = {
          ...status,
          phase: "downloading",
          downloaded: 0,
          total: null,
        };
        break;
      case "set_update_automatic":
        status = { ...status, automatic: args?.enabled === true };
        break;
      case "dismiss_update":
        status = { ...status, dismissedVersion: String(args?.version) };
        break;
      case "open_update_release":
      case "updater_status":
        break;
    }
    return status;
  };
}

let refreshCopy: (() => void) | null = null;

export function refreshUpdaterCopy(): void {
  refreshCopy?.();
}

export async function bindUpdater(preview: boolean): Promise<void> {
  const element = <T extends HTMLElement>(
    id: string,
    type: { new (): T },
  ): T => {
    const found = document.getElementById(id);
    if (!(found instanceof type))
      throw new Error(`Missing updater element: ${id}`);
    return found;
  };
  const dialog = element("update-dialog", HTMLDialogElement);
  const button = element("update-button", HTMLButtonElement);
  const footerVersion = element("update-footer-version", HTMLElement);
  const footerStatus = element("update-footer-status", HTMLElement);
  const title = element("update-title", HTMLElement);
  const detail = element("update-detail", HTMLElement);
  const installedVersion = element("update-current-version", HTMLElement);
  const newVersion = element("update-new-version", HTMLElement);
  const newVersionRow = element("update-new-version-row", HTMLElement);
  const note = element("update-note", HTMLElement);
  const feedback = element("update-feedback", HTMLElement);
  const automatic = element("update-automatic", HTMLInputElement);
  const action = element("update-action", HTMLButtonElement);
  const downloads = element("update-downloads", HTMLButtonElement);
  const later = element("update-later", HTMLButtonElement);
  const close = element("update-close", HTMLButtonElement);
  const progress = element("update-progress", HTMLProgressElement);
  const progressGroup = element("update-progress-group", HTMLElement);
  const progressLabel = element("update-progress-label", HTMLElement);
  const previewLabel = element("update-preview", HTMLElement);
  const previewParams = new URLSearchParams(window.location.search);
  const previewPhase = previewParams.get("update");
  let manualRequested = preview && previewPhase !== null;
  let previousFocus: HTMLElement | null = null;
  const controller = new UpdaterController(
    preview
      ? createPreviewUpdaterRuntime(
          previewUpdaterStatus(previewPhase, previewParams.get("error")),
        )
      : invoke,
    render,
  );

  function showIfNeeded(): void {
    // showModal only focuses within an already focused document. Native code
    // owns showing the window for explicit tray requests; never focus the OS here.
    if (dialog.open || !document.hasFocus()) return;
    if (!manualRequested && !controller.notices.take(controller.status, true))
      return;
    manualRequested = false;
    controller.notices.markShown(controller.status);
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog.showModal();
    button.setAttribute("aria-expanded", "true");
  }

  function render(): void {
    const status = controller.status;
    const copy = copyForUpdate(status);
    dialog.dataset.phase = status.phase;
    button.dataset.phase = controller.feedback ? "error" : status.phase;
    footerVersion.textContent = status.currentVersion;
    footerStatus.textContent = controller.feedback
      ? t("Update needs attention")
      : copy.label;
    button.setAttribute(
      "aria-label",
      `${t("Companion updates")} · ${status.currentVersion} · ${footerStatus.textContent}`,
    );
    // Download events can arrive frequently; only announce actual copy changes.
    if (title.textContent !== copy.title) title.textContent = copy.title;
    if (detail.textContent !== copy.detail) detail.textContent = copy.detail;
    installedVersion.textContent = status.currentVersion;
    newVersion.textContent = status.version;
    newVersionRow.hidden = !status.version;
    note.textContent = copy.note;
    note.hidden = copy.note === null;
    feedback.textContent = controller.feedback ? t(controller.feedback) : "";
    feedback.hidden = controller.feedback === null;
    automatic.checked = status.automatic;
    automatic.disabled = controller.disabled;
    action.textContent = copy.actionLabel;
    action.hidden = copy.action === null;
    action.disabled = controller.disabled;
    downloads.hidden = !copy.downloadsAvailable;
    downloads.disabled = controller.disabled;
    later.textContent = status.phase === "available" ? t("Later") : t("Close");
    progressGroup.hidden =
      status.phase !== "downloading" && status.phase !== "installing";
    if (copy.progress === null) progress.removeAttribute("value");
    else progress.value = copy.progress;
    progressLabel.textContent =
      copy.progress === null ? copy.label : t("{0}% downloaded", copy.progress);
    progress.setAttribute("aria-valuetext", progressLabel.textContent);
    previewLabel.hidden = !preview;
    if (dialog.open) controller.notices.markShown(status);
    showIfNeeded();
  }

  function requestManual(): void {
    manualRequested = !dialog.open;
    showIfNeeded();
    if (!preview) void controller.refresh();
  }

  function dismiss(): void {
    // Native work keeps running when the dialog/window closes.
    void controller.dismiss();
    dialog.close();
  }

  button.addEventListener("click", requestManual);
  action.addEventListener("click", () => void controller.act());
  downloads.addEventListener("click", () => void controller.act("downloads"));
  automatic.addEventListener(
    "change",
    () => void controller.setAutomatic(automatic.checked),
  );
  later.addEventListener("click", dismiss);
  close.addEventListener("click", dismiss);
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    dismiss();
  });
  // Do not also close the underlying connections panel when Escape bubbles.
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") event.stopPropagation();
    if (event.key !== "Tab") return;
    const controls = [close, automatic, later, downloads, action].filter(
      (control) => !control.hidden && !control.disabled,
    );
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    button.setAttribute("aria-expanded", "false");
    if (document.hasFocus()) {
      const target =
        previousFocus?.isConnected && previousFocus !== document.body
          ? previousFocus
          : button;
      target.focus({ preventScroll: true });
    }
    previousFocus = null;
  });
  window.addEventListener("focus", () => {
    showIfNeeded();
    if (!preview) void controller.refresh();
  });
  refreshCopy = () => {
    localizeDocument(dialog);
    render();
  };
  refreshCopy();
  if (!preview) {
    // Subscribe before the snapshot; a newer event wins over a late read.
    await listen<unknown>("updater-status", (event) =>
      controller.accept(event.payload),
    ).catch(() => undefined);
    await listen("updater-open", requestManual).catch(() => undefined);
  }
  await controller.refresh();
}
