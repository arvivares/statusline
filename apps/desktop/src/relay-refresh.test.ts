import { describe, expect, it } from "vitest";

import { RelayStatusController, nextPairingPollAction } from "./relay-refresh";
import type { RelayStatus } from "./relay";

describe("RelayStatusController", () => {
  it("coalesces concurrent status refreshes into one relay request", async () => {
    let resolveLoad: (payload: unknown) => void = () => undefined;
    const delayedLoad = new Promise<unknown>((resolve) => {
      resolveLoad = resolve;
    });
    const rendered: RelayStatus[] = [];
    let loadCount = 0;
    const controller = new RelayStatusController(
      () => {
        loadCount += 1;
        return delayedLoad;
      },
      (status) => rendered.push(status),
      () => undefined,
    );

    const first = controller.refresh();
    const second = controller.refresh();
    resolveLoad({
      status: "unpaired",
      endpoint: "https://relay.statusline.example",
    });
    await first;

    expect({ samePromise: first === second, loadCount, rendered }).toEqual({
      samePromise: true,
      loadCount: 1,
      rendered: [
        {
          status: "unpaired",
          endpoint: "https://relay.statusline.example",
        },
      ],
    });
  });

  it("reports invalid status payloads without leaking a rejection", async () => {
    const failures: unknown[] = [];
    const controller = new RelayStatusController(
      async () => ({ status: "pairing", pairingUri: "private-invalid-link" }),
      () => undefined,
      (error) => failures.push(error),
    );

    await expect(controller.refresh()).resolves.toBeUndefined();
    expect(failures).toHaveLength(1);
  });
});

describe("nextPairingPollAction", () => {
  const startedAtMs = 1_900_000_000_000;
  const expiresAtSeconds = 1_900_000_600;

  it("polls every three seconds during the first 30 seconds", () => {
    expect(
      nextPairingPollAction(
        startedAtMs + 29_000,
        startedAtMs,
        expiresAtSeconds,
      ),
    ).toEqual({ kind: "poll", delayMs: 3_000 });
  });

  it("backs off to 15 seconds after the initial window", () => {
    expect(
      nextPairingPollAction(
        startedAtMs + 30_000,
        startedAtMs,
        expiresAtSeconds,
      ),
    ).toEqual({ kind: "poll", delayMs: 15_000 });
  });

  it("waits for local expiry instead of making a final relay request", () => {
    expect(
      nextPairingPollAction(
        startedAtMs + 598_000,
        startedAtMs,
        expiresAtSeconds,
      ),
    ).toEqual({ kind: "expire", delayMs: 2_000 });
  });

  it("expires immediately when the pairing window has elapsed", () => {
    expect(
      nextPairingPollAction(
        startedAtMs + 600_000,
        startedAtMs,
        expiresAtSeconds,
      ),
    ).toEqual({ kind: "expire", delayMs: 0 });
  });

  it("bounds a ten-minute pairing window to 47 automatic status reads", () => {
    let nowMs = startedAtMs;
    let pollCount = 0;

    for (;;) {
      const action = nextPairingPollAction(
        nowMs,
        startedAtMs,
        expiresAtSeconds,
      );
      nowMs += action.delayMs;
      if (action.kind === "expire") {
        break;
      }
      pollCount += 1;
    }

    expect({ pollCount, expiredAtMs: nowMs }).toEqual({
      pollCount: 47,
      expiredAtMs: expiresAtSeconds * 1_000,
    });
  });
});
