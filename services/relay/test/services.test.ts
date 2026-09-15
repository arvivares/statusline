/// <reference types="node" />
import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createRelayApp } from "../src/app";
import { SERVICES_MEDIA_TYPE, type ServicesPublication } from "../src/protocol";
import { D1RelayStore, type RelayStore } from "../src/store";
import type { D1Database, D1PreparedStatement } from "../src/types";
import { MemoryRelayStore } from "./memory-store";

const CHANNEL = "018f47a0-7b52-4c15-9e55-5f0f266b7440";
const NOW = 1_900_000_000;
const ORIGIN = "https://relay.test/v1/channels/" + CHANNEL;
const databases = new Set<DatabaseSync>();
afterEach(() => {
  for (const db of databases) db.close();
  databases.clear();
});

function migrate(db: DatabaseSync, name: string) {
  db.exec(
    readFileSync(new URL("../migrations/" + name, import.meta.url), "utf8"),
  );
}

function sqliteAdapter(db: DatabaseSync): D1Database {
  const statement = (
    query: string,
    values: SQLInputValue[] = [],
  ): D1PreparedStatement => ({
    bind(...next: unknown[]) {
      return statement(query, next as SQLInputValue[]);
    },
    async first<T>() {
      return (db.prepare(query).get(...values) as T | undefined) ?? null;
    },
    async run() {
      return {
        success: true,
        meta: { changes: Number(db.prepare(query).run(...values).changes) },
      };
    },
  });
  return { prepare: (query) => statement(query) };
}

function envelope(sequence: number, services = false) {
  return {
    protocolVersion: 1 as const,
    sequence,
    nonce: services ? "AQEBAQEBAQEBAQEB" : "AAAAAAAAAAAAAAAA",
    ciphertext: services
      ? "AgICAgICAgICAgICAgICAgICAgI"
      : "AQEBAQEBAQEBAQEBAQEBAQEBAQE",
  };
}
function publication(sequence: number, withCodex = true): ServicesPublication {
  return {
    services: { ...envelope(sequence, true), payloadKind: "services-v1" },
    codex: withCodex ? envelope(sequence) : null,
  };
}

async function fixture(kind: "memory" | "sqlite") {
  let clock = NOW;
  let fill = 0;
  const keys: string[] = [];
  let db: DatabaseSync | null = null;
  let store: RelayStore;
  if (kind === "sqlite") {
    db = new DatabaseSync(":memory:");
    databases.add(db);
    for (const migration of [
      "0001_initial.sql",
      "0002_rotate_pairing_credentials.sql",
      "0003_optional_services_snapshot.sql",
    ])
      migrate(db, migration);
    store = new D1RelayStore(sqliteAdapter(db));
  } else store = new MemoryRelayStore();
  const app = createRelayApp({
    store,
    clientRateLimiter: { limit: async () => ({ success: true }) },
    createRateLimiter: { limit: async () => ({ success: true }) },
    channelRateLimiter: {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    },
    now: () => clock,
    randomUUID: () => CHANNEL,
    randomBytes: (length) => new Uint8Array(length).fill(++fill),
  });
  const created = await app(
    new Request("https://relay.test/v1/channels", { method: "POST" }),
  );
  const credentials = (await created.json()) as {
    publisherToken: string;
    pairingToken: string;
    channelId: string;
  };
  const claimed = await app(
    new Request(ORIGIN + "/claim", {
      method: "POST",
      headers: { Authorization: "Bearer " + credentials.pairingToken },
    }),
  );
  expect(claimed.status).toBe(201);
  const reader = (await claimed.json()) as { readerToken: string };
  const put = (
    value: unknown,
    route = "services",
    token = credentials.publisherToken,
  ) =>
    app(
      new Request(ORIGIN + "/" + route, {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(value),
      }),
    );
  const get = (modern = true, token = reader.readerToken) =>
    app(
      new Request(ORIGIN + "/snapshot", {
        headers: {
          Authorization: "Bearer " + token,
          ...(modern ? { Accept: SERVICES_MEDIA_TYPE } : {}),
        },
      }),
    );
  const metadata = () =>
    app(
      new Request(ORIGIN, {
        headers: { Authorization: "Bearer " + credentials.publisherToken },
      }),
    );
  return {
    db,
    store,
    app,
    put,
    get,
    metadata,
    credentials,
    reader,
    keys,
    advance: (seconds: number) => {
      clock += seconds;
    },
  };
}

describe.each(["memory", "sqlite"] as const)(
  "services-v1 compatibility (%s)",
  (kind) => {
    it("stops reading oversized chunked requests without a Content-Length", async () => {
      const f = await fixture(kind);
      let cancelled = false;
      let chunks = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          chunks += 1;
          controller.enqueue(new Uint8Array(8_192));
        },
        cancel() {
          cancelled = true;
        },
      });
      const request = new Request(ORIGIN + "/services", {
        method: "PUT",
        headers: {
          Authorization: "Bearer " + f.credentials.publisherToken,
          "Content-Type": "application/json",
        },
        body: stream,
        duplex: "half",
      } as RequestInit);
      expect((await f.app(request)).status).toBe(400);
      expect(cancelled).toBe(true);
      expect(chunks).toBeLessThanOrEqual(4);
      expect((await f.get()).status).toBe(404);
    });
    it("new readers keep reading an old publisher without another request", async () => {
      const f = await fixture(kind);
      expect((await f.put(envelope(10), "snapshot")).status).toBe(201);
      expect(await (await f.get()).json()).toEqual(envelope(10));
      expect(await (await f.get(false)).json()).toEqual(envelope(10));
    });

    it("publishes both projections atomically without rotating paired credentials", async () => {
      const f = await fixture(kind);
      await f.put(envelope(10), "snapshot");
      const before = (await (await f.metadata()).json()) as Record<
        string,
        unknown
      >;
      expect((await f.put(publication(20))).status).toBe(201);
      expect(await (await f.get(false)).json()).toEqual(envelope(20));
      const modern = await f.get();
      expect(modern.headers.get("Vary")).toBe("Accept");
      expect(await modern.json()).toEqual(publication(20).services);
      const after = (await (await f.metadata()).json()) as Record<
        string,
        unknown
      >;
      expect(after.readerClaimedAt).toEqual(before.readerClaimedAt);
      expect(after.pairingExpiresAt).toEqual(before.pairingExpiresAt);
      expect(after.capabilities).toEqual(["services-v1"]);
      expect(after).not.toHaveProperty("readerToken");
      expect(after).not.toHaveProperty("publisherToken");
    });

    it("AGY-only publication never invents a Codex snapshot", async () => {
      const f = await fixture(kind);
      expect((await f.put(publication(10, false))).status).toBe(201);
      expect(await (await f.get()).json()).toEqual(
        publication(10, false).services,
      );
      const legacy = await f.get(false);
      expect(legacy.status).toBe(404);
      expect(await legacy.json()).toMatchObject({
        error: { code: "snapshotNotFound" },
      });
    });

    it("removing or failing Codex keeps the old projection and its original age", async () => {
      const f = await fixture(kind);
      await f.put(envelope(10), "snapshot");
      f.advance(300);
      expect((await f.put(publication(20, false))).status).toBe(201);
      expect(await (await f.get(false)).json()).toEqual(envelope(10));
      const metadata = (await (await f.metadata()).json()) as Record<
        string,
        unknown
      >;
      expect(metadata.lastPublishedAt).toBe(NOW);
      expect(metadata.servicesLastPublishedAt).toBe(NOW + 300);
      expect(metadata.expiresAt).toBe(NOW + 300 + 30 * 86400);
    });

    it("publisher downgrade returns a fresh legacy reading instead of stale AGY", async () => {
      const f = await fixture(kind);
      await f.put(publication(10));
      expect((await f.put(envelope(20), "snapshot")).status).toBe(201);
      expect(await (await f.get()).json()).toEqual(envelope(20));
    });

    it.each(["snapshot", "services"])(
      "rejects replays across both slots (%s)",
      async (route) => {
        const f = await fixture(kind);
        await f.put(publication(20));
        expect(
          (
            await f.put(
              route === "snapshot" ? envelope(10) : publication(10),
              route,
            )
          ).status,
        ).toBe(409);
        expect(
          (
            await f.put(
              route === "snapshot" ? envelope(20) : publication(20),
              route,
            )
          ).status,
        ).toBe(409);
        expect(await (await f.get()).json()).toEqual(publication(20).services);
      },
    );

    it("reader and expired pairing tokens cannot write; publisher cannot read", async () => {
      const f = await fixture(kind);
      for (const token of [
        f.reader.readerToken,
        f.credentials.pairingToken,
        "Z".repeat(43),
      ]) {
        expect((await f.put(publication(20), "services", token)).status).toBe(
          404,
        );
      }
      for (const token of [
        f.credentials.publisherToken,
        f.credentials.pairingToken,
        "Z".repeat(43),
      ]) {
        expect((await f.get(true, token)).status).toBe(404);
      }
    });

    it("uses the same channel limiter for legacy and multi-service writes", async () => {
      const f = await fixture(kind);
      await f.put(envelope(10), "snapshot");
      const oldKey = f.keys.at(-1);
      await f.put(publication(20));
      expect(f.keys.at(-1)).toBe(oldKey);
    });

    it("deleting or expiring a channel also removes access to services", async () => {
      const f = await fixture(kind);
      await f.put(publication(10));
      f.advance(30 * 86400 + 1);
      expect((await f.get()).status).toBe(410);
      expect((await f.put(publication(20))).status).toBe(410);
      expect(await f.store.purgeExpired(NOW + 30 * 86400 + 1)).toBe(1);
      expect((await f.get()).status).toBe(404);
    });

    it("preserves the current sample on malformed envelopes and oversized bodies", async () => {
      const f = await fixture(kind);
      await f.put(publication(10));
      const next = publication(20);
      for (const invalid of [
        { ...next, services: { ...next.services, payloadKind: "unknown" } },
        { ...next, services: { ...next.services, protocolVersion: 2 } },
        {
          ...next,
          services: { ...next.services, sequence: Number.MAX_SAFE_INTEGER + 1 },
        },
        { ...next, services: { ...next.services, nonce: "invalid" } },
        { ...next, codex: { ...next.codex, sequence: 19 } },
        { ...next, codex: { ...next.codex, nonce: next.services.nonce } },
        {
          ...next,
          services: { ...next.services, ciphertext: "A".repeat(22_000) },
        },
      ]) {
        expect((await f.put(invalid)).status).toBe(400);
        expect(await (await f.get()).json()).toEqual(publication(10).services);
      }
    });
  },
);

it("the additive migration preserves existing channel values byte-for-byte", () => {
  const db = new DatabaseSync(":memory:");
  databases.add(db);
  migrate(db, "0001_initial.sql");
  migrate(db, "0002_rotate_pairing_credentials.sql");
  db.prepare(
    "INSERT INTO relay_channels VALUES (?, ?, NULL, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)",
  ).run(
    CHANNEL,
    "publisher-hash",
    "reader-hash",
    NOW + 600,
    NOW,
    10,
    envelope(10).nonce,
    envelope(10).ciphertext,
    NOW,
    NOW,
    NOW + 86400,
  );
  const before = db.prepare("SELECT * FROM relay_channels").get()!;
  migrate(db, "0003_optional_services_snapshot.sql");
  const after = db.prepare("SELECT * FROM relay_channels").get()!;
  for (const [key, value] of Object.entries(before))
    expect(after[key]).toEqual(value);
  expect(after.services_sequence).toBeNull();
  expect(after.services_ciphertext).toBeNull();
});

it("handles an older worker publishing into an already-migrated database", async () => {
  const f = await fixture("sqlite");
  await f.put(publication(10));
  // An old worker knows none of the optional columns; it leaves them intact.
  f.db!.prepare(
    "UPDATE relay_channels SET sequence = ?, nonce = ?, ciphertext = ? WHERE id = ?",
  ).run(20, envelope(20).nonce, envelope(20).ciphertext, CHANNEL);
  expect(await (await f.get()).json()).toEqual(envelope(20));
});
