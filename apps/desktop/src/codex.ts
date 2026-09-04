export type CodexDiagnosticStatus = "ready" | "missing" | "invalid";

export type CodexSource =
  | "environment"
  | "saved"
  | "standalone"
  | "npm"
  | "volta"
  | "versionManager"
  | "path";

export type CodexDiagnostic = Readonly<{
  status: CodexDiagnosticStatus;
  path: string | null;
  source: CodexSource | null;
  version: string | null;
  savedPath: string | null;
  message: string | null;
}>;

export class CodexDiagnosticError extends Error {}

export function parseCodexDiagnostic(input: unknown): CodexDiagnostic {
  const diagnostic = readRecord(input, "Codex diagnostic");
  return {
    status: readStatus(diagnostic.status),
    path: readNullableString(diagnostic.path, "path"),
    source: readNullableSource(diagnostic.source),
    version: readNullableString(diagnostic.version, "version"),
    savedPath: readNullableString(diagnostic.savedPath, "savedPath"),
    message: readNullableString(diagnostic.message, "message"),
  };
}

export function labelForCodexSource(source: CodexSource | null): string {
  switch (source) {
    case "environment":
      return "ENV OVERRIDE";
    case "saved":
      return "SAVED PATH";
    case "standalone":
      return "STANDALONE";
    case "npm":
      return "NPM GLOBAL";
    case "volta":
      return "VOLTA";
    case "versionManager":
      return "VERSION MANAGER";
    case "path":
      return "SYSTEM PATH";
    case null:
      return "NOT DETECTED";
  }
}

function readStatus(value: unknown): CodexDiagnosticStatus {
  if (value === "ready" || value === "missing" || value === "invalid") {
    return value;
  }
  throw new CodexDiagnosticError("Unknown Codex diagnostic status");
}

function readNullableSource(value: unknown): CodexSource | null {
  if (value === null) {
    return null;
  }
  switch (value) {
    case "environment":
      return "environment";
    case "saved":
      return "saved";
    case "standalone":
      return "standalone";
    case "npm":
      return "npm";
    case "volta":
      return "volta";
    case "versionManager":
      return "versionManager";
    case "path":
      return "path";
    default:
      throw new CodexDiagnosticError("Unknown Codex source");
  }
}

function readNullableString(value: unknown, path: string): string | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new CodexDiagnosticError(`${path} must be a string or null`);
  }
  return value;
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CodexDiagnosticError(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}
