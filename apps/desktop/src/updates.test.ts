import { afterEach, describe, expect, it, vi } from "vitest";
import { setLanguage } from "./localization";
import {
  copyForUpdate,
  createPreviewUpdaterRuntime,
  parseUpdaterStatus,
  previewUpdaterStatus,
  UpdateNotices,
  UpdaterController,
  updateProgress,
  type UpdateCommand,
  type UpdatePhase,
  type UpdaterStatus,
} from "./updates";

afterEach(() => setLanguage("en"));

function state(
  phase: UpdatePhase,
  changes: Partial<UpdaterStatus> = {},
): UpdaterStatus {
  return { ...previewUpdaterStatus(phase), ...changes };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("updater presentation", () => {
  it.each([
    ["idle", "Companion updates", "check", "Check for updates"],
    ["checking", "Checking for updates", null, "Check for updates"],
    ["current", "You're up to date", "check", "Check for updates"],
    ["available", "Update available", "install", "Download & install"],
    ["downloading", "Downloading update", null, "Check for updates"],
    ["installing", "Installing update", null, "Check for updates"],
    ["installed", "Update installed", null, "Check for updates"],
    ["error", "Could not complete the update", "check", "Retry check"],
  ] as const)(
    "maps %s to safe copy and its action",
    (phase, title, action, actionLabel) => {
      setLanguage("en");
      const copy = copyForUpdate(
        parseUpdaterStatus({ ...state(phase), error: "secret /private/token" }),
      );
      expect(copy).toMatchObject({ title, action, actionLabel });
      expect(JSON.stringify(copy)).not.toContain("secret");
    },
  );

  it("refreshes phase and consent copy in the current system language", () => {
    setLanguage("es-ES");
    const available = copyForUpdate(state("available"));
    expect(available.title).toBe("Actualización disponible");
    expect(available.actionLabel).toBe("Descargar e instalar");
    expect(available.note).toContain("se reiniciará");
    expect(available.note).toContain("Windows puede pedir permiso");
    expect(copyForUpdate(state("error")).actionLabel).toBe("Volver a buscar");
    setLanguage("en-US");
    expect(copyForUpdate(state("available")).title).toBe("Update available");
  });

  it("offers official downloads for package-managed installs and never installs without a version", () => {
    expect(
      copyForUpdate(state("available", { installable: false })),
    ).toMatchObject({
      action: "downloads",
      actionLabel: "View downloads",
      note: "Install the DEB or RPM from the official release page using your package manager.",
    });
    expect(copyForUpdate(state("available", { version: null })).action).toBe(
      "check",
    );
  });

  it.each([
    [42, 100, 42],
    [150, 100, 100],
    [-10, 100, 0],
    [42, null, null],
    [42, 0, null],
    [42, -1, null],
    [42, Infinity, null],
    [NaN, 100, 0],
    [42, NaN, null],
  ])("bounds progress for %s / %s", (downloaded, total, expected) => {
    expect(updateProgress(downloaded!, total!)).toBe(expected);
  });

  it("keeps unknown download length and installation indeterminate", () => {
    expect(
      copyForUpdate(state("downloading", { total: null })).progress,
    ).toBeNull();
    expect(
      copyForUpdate(state("installing", { downloaded: 100, total: 100 }))
        .progress,
    ).toBeNull();
  });

  it("validates native fields and drops native error prose", () => {
    expect(
      parseUpdaterStatus({ ...state("error"), error: "private path" }).error,
    ).toBeNull();
    for (const invalid of [
      null,
      {},
      { ...state("idle"), phase: "unknown" },
      { ...state("idle"), automatic: "true" },
      { ...state("idle"), downloaded: NaN },
      { ...state("idle"), version: { html: "<img>" } },
    ]) {
      expect(() => parseUpdaterStatus(invalid)).toThrow(
        "Invalid updater status",
      );
    }
  });

  it.each([
    "checkFailed",
    "downloadFailed",
    "installFailed",
    "preferencesFailed",
    "unavailable",
  ] as const)(
    "retains the documented %s code without rendering it",
    (error) => {
      const parsed = parseUpdaterStatus({ ...state("error"), error });
      expect(parsed.error).toBe(error);
      expect(JSON.stringify(copyForUpdate(parsed))).not.toContain(error);
    },
  );

  it.each([
    "unknown",
    "installFailed: /private/app",
    "<b>installFailed</b>",
    "INSTALLFAILED",
  ])("discards unrecognized error %s and keeps neutral copy", (error) => {
    const parsed = parseUpdaterStatus({ ...state("error"), error });
    expect(parsed.error).toBeNull();
    expect(copyForUpdate(parsed)).toMatchObject({
      action: "check",
      downloadsAvailable: false,
      detail: "Statusline could not complete the update. Please try again.",
    });
  });

  it("offers downloads after a known installation failure without promising rollback", () => {
    const failed = state("error", { error: "installFailed" });
    expect(copyForUpdate(failed)).toMatchObject({
      action: "check",
      actionLabel: "Retry check",
      downloadsAvailable: true,
      detail:
        "The update could not be installed. You can install it manually from the official downloads.",
    });
    setLanguage("es-ES");
    expect(copyForUpdate(failed).detail).toBe(
      "No se pudo instalar la actualización. Puedes instalarla manualmente desde las descargas oficiales.",
    );
  });

  it("requires both installation failure and a candidate for the fallback", () => {
    for (const status of [
      state("error", { error: "installFailed", version: null }),
      state("error", { error: "downloadFailed" }),
      state("error", { error: "checkFailed" }),
      state("error", { error: "preferencesFailed" }),
      state("error", { error: "unavailable" }),
      state("available", { error: "installFailed" }),
      state("downloading", { error: "installFailed" }),
    ]) {
      expect(copyForUpdate(status).downloadsAvailable).toBe(false);
    }
  });
});

describe("automatic updater notices", () => {
  it("defers while the document is unfocused, then shows a version only once", () => {
    const notices = new UpdateNotices();
    expect(notices.take(state("available"), false)).toBe(false);
    expect(notices.take(state("available"), false)).toBe(false);
    expect(notices.take(state("available"), true)).toBe(true);
    expect(notices.take(state("available"), true)).toBe(false);
    expect(notices.take(state("available", { version: "0.1.19" }), true)).toBe(
      true,
    );
  });

  it("honors persisted dismissal and automatic preference without suppressing future versions", () => {
    const notices = new UpdateNotices();
    expect(
      notices.take(state("available", { dismissedVersion: "0.1.18" }), true),
    ).toBe(false);
    expect(notices.take(state("available", { automatic: false }), true)).toBe(
      false,
    );
    notices.dismiss("0.1.18");
    expect(notices.take(state("available"), true)).toBe(false);
    expect(notices.take(state("available", { version: "0.1.19" }), true)).toBe(
      true,
    );
  });

  it("never opens for progress/error events or an obsolete deferred release", () => {
    const notices = new UpdateNotices();
    expect(notices.take(state("available"), false)).toBe(false);
    for (const phase of [
      "idle",
      "checking",
      "current",
      "downloading",
      "installing",
      "installed",
      "error",
    ] as const) {
      expect(notices.take(state(phase), true)).toBe(false);
    }
  });

  it("does not prompt again for an available version already seen in a manual dialog", () => {
    const notices = new UpdateNotices();
    notices.markShown(state("available"));
    expect(notices.take(state("available"), true)).toBe(false);
  });
});

describe("updater native actions", () => {
  it("does not check or install on startup/status events", async () => {
    const runtime = vi.fn(async () => state("available"));
    const controller = new UpdaterController(runtime, vi.fn());
    await controller.refresh();
    controller.accept(state("available"));
    expect(runtime.mock.calls).toEqual([["updater_status"]]);
  });

  it("requires an explicit action to install the exact version and blocks duplicate actions", async () => {
    const install = deferred<unknown>();
    const runtime = vi.fn((command: UpdateCommand) =>
      command === "install_update"
        ? install.promise
        : Promise.resolve(state("downloading")),
    );
    const controller = new UpdaterController(runtime, vi.fn());
    controller.accept(state("available"));
    const first = controller.act();
    await controller.act();
    expect(runtime).toHaveBeenCalledExactlyOnceWith("install_update", {
      version: "0.1.18",
    });
    expect(controller.status.phase).toBe("downloading");
    expect(controller.disabled).toBe(true);
    controller.accept(state("installing"));
    await controller.dismiss();
    expect(runtime).toHaveBeenCalledTimes(1);
    install.resolve(undefined);
    await first;
    await controller.act();
    expect(
      runtime.mock.calls.filter(([command]) => command === "install_update"),
    ).toHaveLength(1);
  });

  it("coalesces checks and maps failures to generic localized retry copy", async () => {
    const check = deferred<unknown>();
    const runtime = vi.fn(() => check.promise);
    const controller = new UpdaterController(runtime, vi.fn());
    controller.accept(state("current"));
    const first = controller.act();
    await controller.act();
    expect(runtime).toHaveBeenCalledExactlyOnceWith("check_for_updates");
    check.reject(new Error("https://private.example/?token=secret"));
    await first;
    expect(controller.status.phase).toBe("error");
    expect(controller.disabled).toBe(false);
    expect(copyForUpdate(controller.status).action).toBe("check");
    expect(JSON.stringify(controller.status)).not.toContain("secret");
  });

  it("opens only the native official downloads command for DEB/RPM", async () => {
    const runtime = vi.fn(async () =>
      state("available", { installable: false }),
    );
    const controller = new UpdaterController(runtime, vi.fn());
    controller.accept(state("available", { installable: false }));
    await controller.act();
    expect(runtime.mock.calls).toEqual([
      ["open_update_release"],
      ["updater_status"],
    ]);
  });

  it("opens native downloads after installation failure and blocks duplicate/mixed actions", async () => {
    const opening = deferred<unknown>();
    const failed = state("error", { error: "installFailed" });
    const runtime = vi.fn((command: UpdateCommand) =>
      command === "open_update_release"
        ? opening.promise
        : Promise.resolve(failed),
    );
    const controller = new UpdaterController(runtime, vi.fn());
    controller.accept(failed);
    const first = controller.act("downloads");
    await controller.act("downloads");
    await controller.act();
    await controller.setAutomatic(false);
    await controller.dismiss();
    expect(controller.disabled).toBe(true);
    expect(runtime).toHaveBeenCalledExactlyOnceWith("open_update_release");
    opening.resolve(undefined);
    await first;
    expect(runtime.mock.calls).toEqual([
      ["open_update_release"],
      ["updater_status"],
    ]);
    expect(controller.disabled).toBe(false);
    expect(controller.status.error).toBe("installFailed");
  });

  it("rechecks fallback eligibility when the secondary button is activated", async () => {
    const runtime = vi.fn();
    const controller = new UpdaterController(runtime, vi.fn());
    for (const status of [
      state("current"),
      state("downloading"),
      state("error", { error: "downloadFailed" }),
      state("error", { error: "installFailed", version: null }),
    ]) {
      controller.accept(status);
      await controller.act("downloads");
    }
    expect(runtime).not.toHaveBeenCalled();
  });

  it("keeps the fallback available after a safe downloads-opening error", async () => {
    const runtime = vi.fn(async () => {
      throw new Error("secret OS path");
    });
    const controller = new UpdaterController(runtime, vi.fn());
    controller.accept(state("error", { error: "installFailed" }));
    await controller.act("downloads");
    expect(controller.feedback).toBe(
      "Could not open downloads. Please try again.",
    );
    expect(controller.status.error).toBe("installFailed");
    expect(copyForUpdate(controller.status).downloadsAvailable).toBe(true);
    expect(controller.disabled).toBe(false);
    await controller.act("downloads");
    expect(runtime).toHaveBeenCalledTimes(2);
  });

  it("persists Later exactly once and suppresses an event while the write is pending", async () => {
    const dismissal = deferred<unknown>();
    const runtime = vi.fn(() => dismissal.promise);
    const controller = new UpdaterController(runtime, vi.fn());
    controller.accept(state("available"));
    const first = controller.dismiss();
    await controller.dismiss();
    controller.accept(state("available"));
    expect(controller.notices.take(controller.status, true)).toBe(false);
    expect(runtime).toHaveBeenCalledExactlyOnceWith("dismiss_update", {
      version: "0.1.18",
    });
    dismissal.resolve(undefined);
    await first;
    expect(controller.status.dismissedVersion).toBe("0.1.18");
  });

  it("reports a failed dismissal safely and permits a later retry", async () => {
    const runtime = vi.fn(async () => {
      throw new Error("private path");
    });
    const controller = new UpdaterController(runtime, vi.fn());
    controller.accept(state("available"));
    await controller.dismiss();
    expect(controller.feedback).toBe(
      "Could not save this dismissal. The update may appear again next time.",
    );
    expect(controller.status.dismissedVersion).toBeNull();
    await controller.dismiss();
    expect(runtime).toHaveBeenCalledTimes(2);
  });

  it("saves the automatic preference once and never triggers installation", async () => {
    const save = deferred<unknown>();
    const runtime = vi.fn((command: UpdateCommand) =>
      command === "set_update_automatic"
        ? save.promise
        : Promise.resolve(state("current", { automatic: false })),
    );
    const controller = new UpdaterController(runtime, vi.fn());
    controller.accept(state("current"));
    const first = controller.setAutomatic(false);
    await controller.setAutomatic(false);
    await controller.act();
    expect(runtime).toHaveBeenCalledExactlyOnceWith("set_update_automatic", {
      enabled: false,
    });
    save.resolve(undefined);
    await first;
    expect(controller.status.automatic).toBe(false);
    expect(controller.disabled).toBe(false);
  });

  it("retains the saved preference on failure", async () => {
    const controller = new UpdaterController(async () => {
      throw new Error("secret");
    }, vi.fn());
    controller.accept(state("available"));
    await controller.setAutomatic(false);
    expect(controller.status.automatic).toBe(true);
    expect(controller.feedback).toBe(
      "Could not save the update preference. Please try again.",
    );
  });

  it("ignores a late snapshot after a newer event", async () => {
    const read = deferred<unknown>();
    const controller = new UpdaterController(() => read.promise, vi.fn());
    const refresh = controller.refresh();
    controller.accept(state("downloading"));
    read.resolve(state("available"));
    await refresh;
    expect(controller.status.phase).toBe("downloading");
  });

  it("honors a resolved native install error, including when the next read fails", async () => {
    const runtime = vi.fn(async (command: UpdateCommand) => {
      if (command === "install_update")
        return state("error", { error: "installFailed" });
      throw new Error("read failed");
    });
    const controller = new UpdaterController(runtime, vi.fn());
    controller.accept(state("available"));
    await controller.act();
    expect(controller.status.phase).toBe("error");
    expect(controller.status.error).toBe("installFailed");
    expect(copyForUpdate(controller.status).downloadsAvailable).toBe(true);
    expect(copyForUpdate(controller.status).action).toBe("check");
    expect(controller.disabled).toBe(false);
  });

  it("does not overwrite a newer native event with a late command rejection", async () => {
    const command = deferred<unknown>();
    const controller = new UpdaterController(() => command.promise, vi.fn());
    controller.accept(state("available"));
    const action = controller.act();
    controller.accept(state("installed"));
    command.reject(new Error("IPC closed during restart"));
    await action;
    expect(controller.status.phase).toBe("installed");
  });

  it("invalidates an older snapshot as soon as the user starts installation", async () => {
    const read = deferred<unknown>();
    const install = deferred<unknown>();
    const controller = new UpdaterController(
      (command) =>
        command === "updater_status" ? read.promise : install.promise,
      vi.fn(),
    );
    controller.accept(state("available"));
    const refresh = controller.refresh();
    const action = controller.act();
    read.resolve(state("available"));
    await refresh;
    expect(controller.status.phase).toBe("downloading");
    install.reject(new Error("unavailable"));
    await action;
  });

  it("ignores a late read failure and keeps active work disabled when a later read fails", async () => {
    const read = deferred<unknown>();
    const controller = new UpdaterController(() => read.promise, vi.fn());
    const refresh = controller.refresh();
    controller.accept(state("installing"));
    read.reject(new Error("secret"));
    await refresh;
    await controller.refresh();
    expect(controller.status.phase).toBe("installing");
    expect(controller.disabled).toBe(true);
  });

  it("recovers from an initial IPC failure with a manual retry", async () => {
    const runtime = vi.fn(async () => state("current"));
    runtime.mockRejectedValueOnce(new Error("secret"));
    const controller = new UpdaterController(runtime, vi.fn());
    await controller.refresh();
    expect(controller.status.phase).toBe("error");
    await controller.act();
    expect(controller.status.phase).toBe("current");
    expect(runtime).toHaveBeenCalledWith("check_for_updates");
  });
});

describe("local updater preview", () => {
  it("uses current/future preview versions and only known failure codes", () => {
    expect(previewUpdaterStatus("available")).toMatchObject({
      currentVersion: "0.1.17",
      version: "0.1.18",
    });
    expect(previewUpdaterStatus("error", "installFailed").error).toBe(
      "installFailed",
    );
    expect(previewUpdaterStatus("error", "secret").error).toBeNull();
    expect(previewUpdaterStatus("available", "installFailed").error).toBeNull();
  });
  it.each(["available", "current", "downloading", "error"] as const)(
    "provides %s without network/native operations",
    async (phase) => {
      const runtime = createPreviewUpdaterRuntime(previewUpdaterStatus(phase));
      expect(parseUpdaterStatus(await runtime("updater_status")).phase).toBe(
        phase,
      );
      await runtime("open_update_release");
      await runtime("set_update_automatic", { enabled: false });
      await runtime("dismiss_update", { version: "0.1.18" });
      expect(await runtime("updater_status")).toMatchObject({
        automatic: false,
        dismissedVersion: "0.1.18",
      });
      await runtime("check_for_updates");
      expect(await runtime("updater_status")).toMatchObject({
        phase: "current",
      });
      await runtime("install_update", { version: "0.1.18" });
      expect(await runtime("updater_status")).toMatchObject({
        phase: "downloading",
        total: null,
      });
    },
  );
});
