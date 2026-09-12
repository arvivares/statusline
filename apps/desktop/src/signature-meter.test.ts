import { describe, expect, it } from "vitest";
import { signatureMeter } from "./signature-meter";

describe("Still Signature meter", () => {
  it("does not mark an empty or unavailable reading", () => {
    for (const value of [0, -1, null, NaN, Infinity]) {
      expect(signatureMeter(value, 300).tipWidth).toBe(0);
    }
  });
  it("completes only the final active stripe in white", () => {
    expect(signatureMeter(53.5, 300)).toEqual({
      value: 53.5,
      tipLeft: 156,
      tipWidth: 4,
    });
    expect(signatureMeter(50, 300)).toEqual({
      value: 50,
      tipLeft: 144,
      tipWidth: 4,
    });
    expect(signatureMeter(100, 300)).toEqual({
      value: 100,
      tipLeft: 294,
      tipWidth: 4,
    });
    expect(signatureMeter(0.1, 300).tipWidth).toBe(4);
  });
  it("clips to the track and clamps over-range readings", () => {
    expect(signatureMeter(120, 301)).toEqual({
      value: 100,
      tipLeft: 300,
      tipWidth: 1,
    });
    expect(signatureMeter(53, 0).tipWidth).toBe(0);
  });
});
