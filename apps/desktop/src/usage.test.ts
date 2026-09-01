import { describe, expect, it } from "vitest";

import { copyForState, parseUsageResponse } from "./usage";

describe("parseUsageResponse", () => {
  it("parses the complete ready contract without accepting backend-only fields", () => {
    const input = {
      status: "ready",
      weekly: {
        usedPercent: 34,
        remainingPercent: 66,
        windowDurationMins: 10_080,
        resetsAt: 2_000_500_000,
        label: "Codex",
      },
      shortWindow: {
        usedPercent: 12,
        remainingPercent: 88,
        windowDurationMins: 300,
        resetsAt: 2_000_000_000,
        label: "Codex",
      },
      plan: "plus",
      accountType: "chatgpt",
      checkedAt: 1_900_000_000,
      limitCount: 1,
      email: "must-not-cross-the-boundary@example.com",
    };

    const result = parseUsageResponse(input);

    expect(result).toEqual({
      status: "ready",
      weekly: {
        usedPercent: 34,
        remainingPercent: 66,
        windowDurationMins: 10_080,
        resetsAt: 2_000_500_000,
        label: "Codex",
      },
      shortWindow: {
        usedPercent: 12,
        remainingPercent: 88,
        windowDurationMins: 300,
        resetsAt: 2_000_000_000,
        label: "Codex",
      },
      plan: "plus",
      accountType: "chatgpt",
      checkedAt: 1_900_000_000,
      limitCount: 1,
    });
  });

  it("rejects a ready payload with percentages outside zero to one hundred", () => {
    const input = {
      status: "ready",
      weekly: {
        usedPercent: 130,
        remainingPercent: -30,
        windowDurationMins: 10_080,
        resetsAt: 2_000_500_000,
        label: "Codex",
      },
      shortWindow: null,
      plan: null,
      accountType: "chatgpt",
      checkedAt: 1_900_000_000,
      limitCount: 1,
    };

    expect(() => parseUsageResponse(input)).toThrowError(
      "weekly.usedPercent must be between 0 and 100",
    );
  });

  it("maps a future unavailable reason to an exhaustive unknown variant", () => {
    const input = {
      status: "unavailable",
      reason: "futureServerReason",
      checkedAt: 1_900_000_000,
    };

    const result = parseUsageResponse(input);

    expect(result).toEqual({
      status: "unavailable",
      reason: "unknown",
      checkedAt: 1_900_000_000,
    });
  });

  it("rejects an envelope with an unknown status instead of casting it", () => {
    expect(() => parseUsageResponse({ status: "ready-ish" })).toThrowError(
      "Unknown usage status: ready-ish",
    );
  });
});

describe("copyForState", () => {
  it("explains how to recover when the Codex CLI cannot be found", () => {
    const copy = copyForState({
      status: "error",
      code: "codexNotFound",
      message: "internal path details",
      checkedAt: 1_900_000_000,
    });

    expect(copy).toEqual({
      eyebrow: "SOURCE / MISSING",
      title: "Codex CLI not found",
      detail: "Abre Source Settings para detectar o seleccionar la CLI local.",
    });
  });

  it("gives a distinct explanation when no weekly window exists", () => {
    const copy = copyForState({
      status: "unavailable",
      reason: "noWeeklyWindow",
      checkedAt: 1_900_000_000,
    });

    expect(copy).toEqual({
      eyebrow: "STATUS / NO SAMPLE",
      title: "Weekly window unavailable",
      detail:
        "Codex no ha publicado una ventana de 6 a 8 días para esta cuenta.",
    });
  });
});
