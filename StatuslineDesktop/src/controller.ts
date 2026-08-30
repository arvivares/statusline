import {
  UsagePayloadError,
  parseUsageResponse,
  type UsageState,
} from "./usage";

type LoadUsage = () => Promise<unknown>;
type RenderUsage = (state: UsageState) => void;
type Clock = () => number;

export class UsageController {
  private pendingRefresh: Promise<void> | null = null;

  public constructor(
    private readonly loadUsage: LoadUsage,
    private readonly renderUsage: RenderUsage,
    private readonly clock: Clock,
  ) {}

  public refresh(): Promise<void> {
    if (this.pendingRefresh !== null) {
      return this.pendingRefresh;
    }

    this.renderUsage({ status: "loading" });
    const operation = Promise.resolve()
      .then(() => this.loadUsage())
      .then((payload) => {
        this.renderUsage(parseUsageResponse(payload));
      })
      .catch((error: unknown) => {
        const invalidPayload = error instanceof UsagePayloadError;
        this.renderUsage({
          status: "error",
          code: invalidPayload ? "invalidData" : "appServer",
          message: invalidPayload
            ? "The Codex response did not match the expected contract."
            : "The Codex request could not be completed.",
          checkedAt: this.clock(),
        });
      })
      .finally(() => {
        this.pendingRefresh = null;
      });
    this.pendingRefresh = operation;
    return operation;
  }
}
