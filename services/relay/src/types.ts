export interface RateLimitBinding {
  limit(
    input: Readonly<{ key: string }>,
  ): Promise<Readonly<{ success: boolean }>>;
}

export interface D1RunResult {
  readonly success: boolean;
  readonly meta: Readonly<{ changes?: number }>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T>(): Promise<T | null>;
  run(): Promise<D1RunResult>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

export interface EncryptedPushToken {
  readonly nonce: string;
  readonly ciphertext: string;
}

export interface PushDevice {
  readonly deviceID: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly language: "en" | "es";
  readonly updatedAt: number;
  readonly resetCredits?: boolean;
  readonly quotaAlerts?: boolean;
}

export interface QuotaAlert {
  readonly eventID: string;
  readonly provider: "codex" | "antigravity" | "claude";
  readonly kind: "quotaRecovered" | "weeklyExpiring";
  readonly window: "short" | "weekly";
  readonly expiresAt: number;
}

export type PushEventClaim = "claimed" | "sent" | "busy";

export interface PushGateway {
  isReady(): Promise<boolean>;
  encryptInstallationID(fid: string): Promise<EncryptedPushToken>;
  sendResetAdded(device: PushDevice): Promise<"sent" | "invalidToken">;
  sendQuotaAlert(
    device: PushDevice,
    alert: QuotaAlert,
  ): Promise<"sent" | "invalidToken">;
}

export interface Env {
  readonly DB: D1Database;
  readonly CLIENT_RATE_LIMITER: RateLimitBinding;
  readonly CREATE_RATE_LIMITER: RateLimitBinding;
  readonly CHANNEL_RATE_LIMITER: RateLimitBinding;
  readonly PUSH_EVENT_RATE_LIMITER: RateLimitBinding;
  readonly FCM_SERVICE_ACCOUNT_JSON?: string;
  readonly PUSH_TOKEN_ENCRYPTION_KEY?: string;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}
