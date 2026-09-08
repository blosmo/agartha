import { describe, expect, it } from "vitest";

import {
  BLENDER_BILLING,
  quoteBlenderSession,
  settleBlenderSession,
  worstCaseBlenderCostNanoUsd,
} from "./blenderBilling";

describe("Blender billing policy", () => {
  it("quotes the minimum and maximum reservations with bounded lifetime", () => {
    expect(quoteBlenderSession(5, 1_000)).toEqual({
      pricingVersion: "blender-cpu2-v2",
      currency: "usd",
      minutes: 5,
      reserveCents: 40,
      minimumCents: 40,
      expiresAt: 121_000,
      platformLifetimeSeconds: 375,
    });
    expect(quoteBlenderSession(30, 1_000).reserveCents).toBe(165);
  });

  it("rejects invalid quote inputs", () => {
    for (const minutes of [4, 31, 5.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => quoteBlenderSession(minutes, 1_000)).toThrow();
    }
    for (const now of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => quoteBlenderSession(5, now)).toThrow();
    }
  });

  it("rounds successful runtime up and releases the unused reservation", () => {
    expect(
      settleBlenderSession({
        reservedMinutes: 30,
        readyAt: 1_000,
        stoppedAt: 61_001,
        startupFailed: false,
      }),
    ).toEqual({ chargedMinutes: 5, chargeCents: 40, releaseCents: 125 });
    expect(
      settleBlenderSession({
        reservedMinutes: 10,
        readyAt: 1_000,
        stoppedAt: 1_001,
        startupFailed: false,
      }).chargedMinutes,
    ).toBe(5);
    expect(
      settleBlenderSession({
        reservedMinutes: 5,
        readyAt: 1_000,
        stoppedAt: 3_500,
        startupFailed: false,
      }).chargeCents,
    ).toBe(40);
  });

  it("rounds a started minute above the minimum upward", () => {
    expect(settleBlenderSession({reservedMinutes: 30, readyAt: 1_000, stoppedAt: 301_000, startupFailed: false}))
      .toEqual({chargedMinutes: 5, chargeCents: 40, releaseCents: 125});
    expect(settleBlenderSession({reservedMinutes: 30, readyAt: 1_000, stoppedAt: 301_001, startupFailed: false}))
      .toEqual({chargedMinutes: 6, chargeCents: 45, releaseCents: 120});
  });

  it("caps successful late stops at the reservation", () => {
    expect(settleBlenderSession({ reservedMinutes: 30, readyAt: 1_000, stoppedAt: 3_601_000, startupFailed: false }))
      .toEqual({ chargedMinutes: 30, chargeCents: 165, releaseCents: 0 });
    expect(
      settleBlenderSession({
        reservedMinutes: 5,
        readyAt: 1_000,
        stoppedAt: 601_000,
        startupFailed: false,
      }),
    ).toEqual({ chargedMinutes: 5, chargeCents: 40, releaseCents: 0 });
  });

  it("refunds a verified pre-ready startup failure", () => {
    expect(
      settleBlenderSession({
        reservedMinutes: 30,
        readyAt: null,
        stoppedAt: 75_000,
        startupFailed: true,
      }),
    ).toEqual({ chargedMinutes: 0, chargeCents: 0, releaseCents: 165 });
  });

  it("preserves v1 reserved-session charges and refunds", () => {
    expect(settleBlenderSession({ pricingVersion: "blender-cpu2-v1", reservedMinutes: 30, readyAt: 1_000, stoppedAt: 301_001, startupFailed: false }))
      .toEqual({ chargedMinutes: 6, chargeCents: 30, releaseCents: 120 });
    expect(settleBlenderSession({ pricingVersion: "blender-cpu2-v1", reservedMinutes: 30, readyAt: null, stoppedAt: 75_000, startupFailed: true }))
      .toEqual({ chargedMinutes: 0, chargeCents: 0, releaseCents: 150 });
    expect(() => settleBlenderSession({ pricingVersion: "unknown", reservedMinutes: 5, readyAt: null, stoppedAt: 75_000, startupFailed: true })).toThrow("Unsupported");
  });

  it("rejects inconsistent settlement timestamps and startup state", () => {
    const invalid = [
      { reservedMinutes: 4, readyAt: 1_000, stoppedAt: 2_000, startupFailed: false },
      { reservedMinutes: 5, readyAt: -1, stoppedAt: 2_000, startupFailed: false },
      { reservedMinutes: 5, readyAt: 2_000, stoppedAt: 1_000, startupFailed: false },
      { reservedMinutes: 5, readyAt: null, stoppedAt: 2_000, startupFailed: false },
      { reservedMinutes: 5, readyAt: 1_000, stoppedAt: 2_000, startupFailed: true },
      { reservedMinutes: 5, readyAt: null, stoppedAt: -1, startupFailed: true },
    ];
    for (const input of invalid) expect(() => settleBlenderSession(input)).toThrow();
  });

  it("uses integer nanodollar resource ceilings", () => {
    expect(worstCaseBlenderCostNanoUsd(60)).toBe(387_786_000);
    expect(worstCaseBlenderCostNanoUsd(1)).toBe(14_245_200);
    expect(() => worstCaseBlenderCostNanoUsd(0)).toThrow();
    expect(() => worstCaseBlenderCostNanoUsd(1.5)).toThrow();
  });

  it("publishes the bounded paid-session constants", () => {
    expect(BLENDER_BILLING).toMatchObject({
      pricingVersion: "blender-cpu2-v2",
      currency: "usd",
      topUpCents: [500, 2_000],
      cpuCores: 2,
      memoryMiB: 4_096,
      idleTimeoutSeconds: 60,
      projectSnapshotBytes: 256_000_000,
      accountStoredBytes: 1_073_741_824,
      responseBytes: 268_435_456,
      retentionDays: 7,
      callsPerMinute: 120,
      globalLaunchLimit: 4,
      failedStartsPerAccountPer24h: 2,
      failedStartBudgetNanoUsd: 1_000_000_000,
    });
  });
});
