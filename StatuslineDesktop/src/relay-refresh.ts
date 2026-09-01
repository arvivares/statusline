import { parseRelayStatus, type RelayStatus } from "./relay";

const FAST_POLL_INTERVAL_MS = 3_000;
const FAST_POLL_WINDOW_MS = 30_000;
const SLOW_POLL_INTERVAL_MS = 15_000;

type LoadRelayStatus = () => Promise<unknown>;
type RenderRelayStatus = (status: RelayStatus) => void;
type RenderRelayFailure = (error: unknown) => void;

export type PairingPollAction = Readonly<
  { kind: "poll"; delayMs: number } | { kind: "expire"; delayMs: number }
>;

export class RelayStatusController {
  private pendingRefresh: Promise<void> | null = null;

  public constructor(
    private readonly loadStatus: LoadRelayStatus,
    private readonly renderStatus: RenderRelayStatus,
    private readonly renderFailure: RenderRelayFailure,
  ) {}

  public refresh(): Promise<void> {
    if (this.pendingRefresh !== null) {
      return this.pendingRefresh;
    }

    const operation = Promise.resolve()
      .then(() => this.loadStatus())
      .then((payload) => {
        this.renderStatus(parseRelayStatus(payload));
      })
      .catch((error: unknown) => {
        this.renderFailure(error);
      })
      .finally(() => {
        this.pendingRefresh = null;
      });
    this.pendingRefresh = operation;
    return operation;
  }
}

export function nextPairingPollAction(
  nowMs: number,
  observedAtMs: number,
  expiresAtSeconds: number,
): PairingPollAction {
  const remainingMs = expiresAtSeconds * 1_000 - nowMs;
  if (remainingMs <= 0) {
    return { kind: "expire", delayMs: 0 };
  }

  const observedDurationMs = Math.max(0, nowMs - observedAtMs);
  const pollIntervalMs =
    observedDurationMs < FAST_POLL_WINDOW_MS
      ? FAST_POLL_INTERVAL_MS
      : SLOW_POLL_INTERVAL_MS;

  return remainingMs <= pollIntervalMs
    ? { kind: "expire", delayMs: remainingMs }
    : { kind: "poll", delayMs: pollIntervalMs };
}
