export type ClaudeView = Readonly<{
  revision: number;
  checkedAt: number;
  installations: Readonly<{ cli: boolean; desktop: boolean }>;
  status: "notFound" | "quotaUnavailable" | "discoveryUnavailable";
}>;

export function claudeIsVisible(view: ClaudeView | null): boolean {
  return !!view && (view.installations.cli || view.installations.desktop);
}

export function acceptClaudeView(
  current: ClaudeView | null,
  input: unknown,
): ClaudeView {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("Invalid Claude state");
  const raw = input as Record<string, unknown>;
  const installs = raw.installations as Record<string, unknown> | null;
  if (
    !installs ||
    typeof installs !== "object" ||
    Array.isArray(installs) ||
    typeof installs.cli !== "boolean" ||
    typeof installs.desktop !== "boolean" ||
    typeof raw.revision !== "number" ||
    !Number.isSafeInteger(raw.revision) ||
    raw.revision <= 0 ||
    typeof raw.checkedAt !== "number" ||
    !Number.isSafeInteger(raw.checkedAt) ||
    raw.checkedAt <= 0 ||
    raw.checkedAt > 253402300799 ||
    typeof raw.status !== "string" ||
    !["notFound", "quotaUnavailable", "discoveryUnavailable"].includes(
      raw.status,
    )
  )
    throw new Error("Invalid Claude state");
  const detected = installs.cli || installs.desktop;
  if ((raw.status === "quotaUnavailable") !== detected)
    throw new Error("Invalid Claude detection");
  if (current && raw.revision <= current.revision) return current;
  return {
    revision: raw.revision,
    checkedAt: raw.checkedAt,
    // A transient scan failure is not evidence that the user uninstalled Claude.
    installations:
      raw.status === "discoveryUnavailable" && current
        ? current.installations
        : { cli: installs.cli, desktop: installs.desktop },
    status: raw.status as ClaudeView["status"],
  };
}
