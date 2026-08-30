import { describe, expect, it } from "vitest";

import { UsageController } from "./controller";
import type { UsageState } from "./usage";

const READY_PAYLOAD = {
  status: "ready",
  weekly: {
    usedPercent: 34,
    remainingPercent: 66,
    windowDurationMins: 10_080,
    resetsAt: 2_000_500_000,
    label: "Codex",
  },
  shortWindow: null,
  plan: "plus",
  accountType: "chatgpt",
  checkedAt: 1_900_000_000,
  limitCount: 1,
};

describe("UsageController", () => {
  it("renders loading before the parsed ready state", async () => {
    const rendered: UsageState[] = [];
    const controller = new UsageController(
      async () => READY_PAYLOAD,
      (state) => rendered.push(state),
      () => 1_900_000_001,
    );

    await controller.refresh();

    expect(rendered).toEqual([
      { status: "loading" },
      {
        status: "ready",
        weekly: {
          usedPercent: 34,
          remainingPercent: 66,
          windowDurationMins: 10_080,
          resetsAt: 2_000_500_000,
          label: "Codex",
        },
        shortWindow: null,
        plan: "plus",
        accountType: "chatgpt",
        checkedAt: 1_900_000_000,
        limitCount: 1,
      },
    ]);
  });

  it("coalesces concurrent refreshes into one App Server request", async () => {
    let resolveLoad: (payload: unknown) => void = () => undefined;
    const delayedLoad = new Promise<unknown>((resolve) => {
      resolveLoad = resolve;
    });
    let loadCount = 0;
    const controller = new UsageController(
      () => {
        loadCount += 1;
        return delayedLoad;
      },
      () => undefined,
      () => 1_900_000_001,
    );

    const first = controller.refresh();
    const second = controller.refresh();
    resolveLoad(READY_PAYLOAD);
    await first;

    expect({ samePromise: first === second, loadCount }).toEqual({
      samePromise: true,
      loadCount: 1,
    });
  });

  it("turns a malformed backend payload into a safe invalid-data state", async () => {
    const rendered: UsageState[] = [];
    const controller = new UsageController(
      async () => ({ status: "ready", weekly: null }),
      (state) => rendered.push(state),
      () => 1_900_000_001,
    );

    await controller.refresh();

    expect(rendered.at(-1)).toEqual({
      status: "error",
      code: "invalidData",
      message: "The Codex response did not match the expected contract.",
      checkedAt: 1_900_000_001,
    });
  });

  it("turns an IPC rejection into a safe App Server state", async () => {
    const rendered: UsageState[] = [];
    const controller = new UsageController(
      async () => {
        throw new Error("private process details");
      },
      (state) => rendered.push(state),
      () => 1_900_000_001,
    );

    await controller.refresh();

    expect(rendered.at(-1)).toEqual({
      status: "error",
      code: "appServer",
      message: "The Codex request could not be completed.",
      checkedAt: 1_900_000_001,
    });
  });
});
