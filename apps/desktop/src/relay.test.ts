import { describe, expect, it } from "vitest";

import { RelayPayloadError, parseRelayStatus } from "./relay";

const pairingURI =
  "statusline://pair?v=1&channel=018f47a0-7b52-4c15-9e55-5f0f266b7440&pairing=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA&key=BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

describe("parseRelayStatus", () => {
  it("parses a universal pairing without exposing publisher credentials", () => {
    expect(
      parseRelayStatus({
        status: "pairing",
        endpoint: "https://relay.statusline.example",
        pairingUri: pairingURI,
        pairingExpiresAt: 1_900_000_600,
        lastPublishedAt: null,
      }),
    ).toEqual({
      status: "pairing",
      endpoint: "https://relay.statusline.example",
      pairingUri: pairingURI,
      pairingExpiresAt: 1_900_000_600,
      lastPublishedAt: null,
    });
  });

  it("parses a connected encrypted relay", () => {
    expect(
      parseRelayStatus({
        status: "connected",
        endpoint: "https://relay.statusline.example",
        lastPublishedAt: 1_900_000_000,
      }),
    ).toMatchObject({ status: "connected", lastPublishedAt: 1_900_000_000 });
  });

  it("rejects pairing links with malformed secret material", () => {
    expect(() =>
      parseRelayStatus({
        status: "pairing",
        endpoint: "https://relay.statusline.example",
        pairingUri: "statusline://pair?v=1&channel=nope&pairing=x&key=y",
        pairingExpiresAt: 1_900_000_600,
        lastPublishedAt: null,
      }),
    ).toThrow(RelayPayloadError);
  });
});
