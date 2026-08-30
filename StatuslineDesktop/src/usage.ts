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
        eyebrow: "SOURCE / CODEX LOCAL",
        title: "Reading local session",
        detail: "Consultando las ventanas de uso mediante Codex App Server.",
      };
    case "ready":
      return {
        eyebrow: "STATUS / AVAILABLE",
        title: "Weekly quota",
        detail: `${Math.round(state.weekly.usedPercent)}% consumido en ${state.weekly.label}.`,
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
        eyebrow: "STATUS / NO SAMPLE",
        title: "Weekly window unavailable",
        detail:
          "Codex no ha publicado una ventana de 6 a 8 días para esta cuenta.",
      };
    case "notSignedIn":
      return {
        eyebrow: "AUTH / REQUIRED",
        title: "Connect Codex",
        detail: "Ejecuta codex login y vuelve a actualizar el medidor.",
      };
    case "unknown":
      return {
        eyebrow: "STATUS / UNSUPPORTED",
        title: "Unsupported Codex state",
        detail:
          "Actualiza Statusline Companion para interpretar esta respuesta.",
      };
  }
}

function copyForError(code: UsageErrorCode): StatusCopy {
  switch (code) {
    case "codexNotFound":
      return {
        eyebrow: "SOURCE / MISSING",
        title: "Codex CLI not found",
        detail:
          "Instala la CLI o define STATUSLINE_CODEX_PATH y vuelve a actualizar.",
      };
    case "timeout":
      return {
        eyebrow: "SOURCE / TIMEOUT",
        title: "Codex response timed out",
        detail: "Comprueba la conexión y vuelve a intentarlo en unos segundos.",
      };
    case "overloaded":
      return {
        eyebrow: "SOURCE / BUSY",
        title: "Codex is busy",
        detail: "El servidor pidió reintentar más tarde.",
      };
    case "invalidData":
      return {
        eyebrow: "CONTRACT / CHANGED",
        title: "Unexpected quota format",
        detail: "Actualiza Statusline Companion o revisa la versión de la CLI.",
      };
    case "appServer":
    case "unknown":
      return {
        eyebrow: "SOURCE / OFFLINE",
        title: "Codex query failed",
        detail:
          "Revisa que la CLI esté abierta a tu sesión y vuelve a actualizar.",
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
