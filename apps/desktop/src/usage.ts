import { t } from "./localization";
export type UsageWindow = Readonly<{
  usedPercent: number;
  remainingPercent: number;
  windowDurationMins: number;
  resetsAt: number;
  label: string;
}>;

export type UnavailableReason = "noWeeklyWindow" | "notSignedIn" | "unknown";

export type UsageErrorCode =
  | "codexNotFound"
  | "timeout"
  | "overloaded"
  | "appServer"
  | "invalidData"
  | "unknown";

export type UsageResponse =
  | Readonly<{
      status: "ready";
      weekly: UsageWindow;
      shortWindow: UsageWindow | null;
      plan: string | null;
      accountType: string;
      checkedAt: number;
      limitCount: number;
    }>
  | Readonly<{
      status: "unavailable";
      reason: UnavailableReason;
      checkedAt: number;
    }>
  | Readonly<{
      status: "error";
      code: UsageErrorCode;
      message: string;
      checkedAt: number;
    }>;

export type UsageState = UsageResponse | Readonly<{ status: "loading" }>;

export type StatusCopy = Readonly<{
  eyebrow: string;
  title: string;
  detail: string;
}>;

export class UsagePayloadError extends Error {}

export function parseUsageResponse(input: unknown): UsageResponse {
  const envelope = readRecord(input, "usage response");
  const status = readString(envelope.status, "status");

  switch (status) {
    case "ready":
      return {
        status,
        weekly: parseWindow(envelope.weekly, "weekly"),
        shortWindow:
          envelope.shortWindow === null
            ? null
            : parseWindow(envelope.shortWindow, "shortWindow"),
        plan: readNullableString(envelope.plan, "plan"),
        accountType: readString(envelope.accountType, "accountType"),
        checkedAt: readPositiveInteger(envelope.checkedAt, "checkedAt"),
        limitCount: readNonNegativeInteger(envelope.limitCount, "limitCount"),
      };
    case "unavailable":
      return {
        status,
        reason: parseUnavailableReason(readString(envelope.reason, "reason")),
        checkedAt: readPositiveInteger(envelope.checkedAt, "checkedAt"),
      };
    case "error":
      return {
        status,
        code: parseErrorCode(readString(envelope.code, "code")),
        message: readString(envelope.message, "message"),
        checkedAt: readPositiveInteger(envelope.checkedAt, "checkedAt"),
      };
    default:
      throw new UsagePayloadError(`Unknown usage status: ${status}`);
  }
}

export function copyForState(state: UsageState): StatusCopy {
  switch (state.status) {
    case "loading":
      return {
        eyebrow: t("SOURCE / CODEX LOCAL"),
        title: t("Reading local session"),
        detail: t("Reading usage windows through Codex App Server."),
      };
    case "ready":
      return {
        eyebrow: t("STATUS / AVAILABLE"),
        title: t("Weekly quota"),
        detail: t(
          "{0}% of the weekly quota used.",
          Math.round(state.weekly.usedPercent),
        ),
      };
    case "unavailable":
      return copyForUnavailable(state.reason);
    case "error":
      return copyForError(state.code);
  }
}

function parseWindow(input: unknown, path: string): UsageWindow {
  const window = readRecord(input, path);
  return {
    usedPercent: readPercent(window.usedPercent, `${path}.usedPercent`),
    remainingPercent: readPercent(
      window.remainingPercent,
      `${path}.remainingPercent`,
    ),
    windowDurationMins: readPositiveInteger(
      window.windowDurationMins,
      `${path}.windowDurationMins`,
    ),
    resetsAt: readPositiveInteger(window.resetsAt, `${path}.resetsAt`),
    label: readString(window.label, `${path}.label`),
  };
}

function parseUnavailableReason(reason: string): UnavailableReason {
  switch (reason) {
    case "noWeeklyWindow":
    case "notSignedIn":
      return reason;
    default:
      return "unknown";
  }
}

function parseErrorCode(code: string): UsageErrorCode {
  switch (code) {
    case "codexNotFound":
    case "timeout":
    case "overloaded":
    case "appServer":
    case "invalidData":
      return code;
    default:
      return "unknown";
  }
}

function copyForUnavailable(reason: UnavailableReason): StatusCopy {
  switch (reason) {
    case "noWeeklyWindow":
      return {
        eyebrow: t("STATUS / NO SAMPLE"),
        title: t("Weekly window unavailable"),
        detail: t("Codex has not published a 6–8 day window for this account."),
      };
    case "notSignedIn":
      return {
        eyebrow: t("AUTH / REQUIRED"),
        title: t("Connect Codex"),
        detail: t("Run codex login and refresh the meter."),
      };
    case "unknown":
      return {
        eyebrow: t("STATUS / UNSUPPORTED"),
        title: t("Unsupported Codex state"),
        detail: t("Update Statusline Companion to read this response."),
      };
  }
}

function copyForError(code: UsageErrorCode): StatusCopy {
  switch (code) {
    case "codexNotFound":
      return {
        eyebrow: t("SOURCE / MISSING"),
        title: t("Codex CLI not found"),
        detail: t("Open Source Settings to detect or select the local CLI."),
      };
    case "timeout":
      return {
        eyebrow: t("SOURCE / TIMEOUT"),
        title: t("Codex response timed out"),
        detail: t("Check your connection and try again in a few seconds."),
      };
    case "overloaded":
      return {
        eyebrow: t("SOURCE / BUSY"),
        title: t("Codex is busy"),
        detail: t("The server asked to try again later."),
      };
    case "invalidData":
      return {
        eyebrow: t("CONTRACT / CHANGED"),
        title: t("Unexpected quota format"),
        detail: t("Update Statusline Companion or check your CLI version."),
      };
    case "appServer":
    case "unknown":
      return {
        eyebrow: t("SOURCE / OFFLINE"),
        title: t("Codex query failed"),
        detail: t("Check that you are signed in to the CLI, then refresh."),
      };
  }
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new UsagePayloadError(`${path} must be an object`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown, path: string): string {
  if (typeof value !== "string") {
    throw new UsagePayloadError(`${path} must be a string`);
  }
  return value;
}

function readNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }
  return readString(value, path);
}

function readPercent(value: unknown, path: string): number {
  const number = readFiniteNumber(value, path);
  if (number < 0 || number > 100) {
    throw new UsagePayloadError(`${path} must be between 0 and 100`);
  }
  return number;
}

function readPositiveInteger(value: unknown, path: string): number {
  const number = readInteger(value, path);
  if (number <= 0) {
    throw new UsagePayloadError(`${path} must be positive`);
  }
  return number;
}

function readNonNegativeInteger(value: unknown, path: string): number {
  const number = readInteger(value, path);
  if (number < 0) {
    throw new UsagePayloadError(`${path} must not be negative`);
  }
  return number;
}

function readInteger(value: unknown, path: string): number {
  const number = readFiniteNumber(value, path);
  if (!Number.isSafeInteger(number)) {
    throw new UsagePayloadError(`${path} must be a safe integer`);
  }
  return number;
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new UsagePayloadError(`${path} must be a finite number`);
  }
  return value;
}
