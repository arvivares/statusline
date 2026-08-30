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

export interface Env {
  readonly DB: D1Database;
  readonly CREATE_RATE_LIMITER: RateLimitBinding;
  readonly CHANNEL_RATE_LIMITER: RateLimitBinding;
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}
