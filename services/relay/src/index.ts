import { createRelayApp } from "./app";
import { createFcmPushGateway } from "./push";
import { D1RelayStore } from "./store";
import type { Env, ExecutionContextLike } from "./types";

let gatewayCache: {
  readonly serviceAccountJSON: string;
  readonly encryptionKey: string;
  readonly gateway: ReturnType<typeof createFcmPushGateway>;
} | null = null;

function pushGateway(env: Env): ReturnType<typeof createFcmPushGateway> {
  const serviceAccountJSON = env.FCM_SERVICE_ACCOUNT_JSON ?? "";
  const encryptionKey = env.PUSH_TOKEN_ENCRYPTION_KEY ?? "";
  const cached = gatewayCache;
  if (
    cached?.serviceAccountJSON === serviceAccountJSON &&
    cached.encryptionKey === encryptionKey
  ) {
    return cached.gateway;
  }
  const gateway = createFcmPushGateway(env);
  gatewayCache = { serviceAccountJSON, encryptionKey, gateway };
  return gateway;
}

export default {
  fetch(
    request: Request,
    env: Env,
    _context: ExecutionContextLike,
  ): Promise<Response> {
    const gateway = pushGateway(env);
    return createRelayApp({
      store: new D1RelayStore(env.DB),
      clientRateLimiter: env.CLIENT_RATE_LIMITER,
      createRateLimiter: env.CREATE_RATE_LIMITER,
      channelRateLimiter: env.CHANNEL_RATE_LIMITER,
      pushEventRateLimiter: env.PUSH_EVENT_RATE_LIMITER,
      ...(gateway ? { pushGateway: gateway } : {}),
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
