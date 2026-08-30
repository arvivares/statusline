import { createRelayApp } from "./app";
import { D1RelayStore } from "./store";
import type { Env, ExecutionContextLike } from "./types";

export default {
  fetch(
    request: Request,
    env: Env,
    _context: ExecutionContextLike,
  ): Promise<Response> {
    return createRelayApp({
      store: new D1RelayStore(env.DB),
      createRateLimiter: env.CREATE_RATE_LIMITER,
      channelRateLimiter: env.CHANNEL_RATE_LIMITER,
    })(request);
  },

  async scheduled(
    _controller: unknown,
    env: Env,
    _context: ExecutionContextLike,
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1_000);
    await new D1RelayStore(env.DB).purgeExpired(now);
  },
};
