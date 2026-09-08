export const BLENDER_BILLING = {
  pricingVersion: "blender-cpu2-v2",
  currency: "usd",
  topUpCents: [500, 2_000],
  priceCentsPerMinute: 5,
  minimumCents: 40,
  minimumMinutes: 5,
  maximumMinutes: 30,
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
  quoteTtlMilliseconds: 120_000,
  startupAllowanceSeconds: 75,
} as const;

export type BlenderSessionQuote = {
  pricingVersion: typeof BLENDER_BILLING.pricingVersion;
  currency: typeof BLENDER_BILLING.currency;
  minutes: number;
  reserveCents: number;
  minimumCents: number;
  expiresAt: number;
  platformLifetimeSeconds: number;
};

export type BlenderSessionSettlement = {
  pricingVersion?: string;
  reservedMinutes: number;
  readyAt: number | null;
  stoppedAt: number;
  startupFailed: boolean;
};

export type BlenderSessionSettlementResult = {
  chargedMinutes: number;
  chargeCents: number;
  releaseCents: number;
};

const isSafeNonNegativeInteger = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0;

const assertSafeNonNegativeInteger = (value: number, name: string): void => {
  if (!isSafeNonNegativeInteger(value)) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
};

export function quoteBlenderSession(minutes: number, now: number): BlenderSessionQuote {
  if (
    !Number.isSafeInteger(minutes) ||
    minutes < BLENDER_BILLING.minimumMinutes ||
    minutes > BLENDER_BILLING.maximumMinutes
  ) {
    throw new RangeError("minutes must be an integer from 5 through 30.");
  }
  assertSafeNonNegativeInteger(now, "now");

  const reserveCents = sessionPriceCents(minutes, BLENDER_BILLING.pricingVersion);
  const expiresAt = now + BLENDER_BILLING.quoteTtlMilliseconds;
  const platformLifetimeSeconds = minutes * 60 + BLENDER_BILLING.startupAllowanceSeconds;
  if (!Number.isSafeInteger(expiresAt) || !Number.isSafeInteger(platformLifetimeSeconds)) {
    throw new RangeError("quote values exceed safe integer bounds.");
  }

  return {
    pricingVersion: BLENDER_BILLING.pricingVersion,
    currency: BLENDER_BILLING.currency,
    minutes,
    reserveCents,
    minimumCents: BLENDER_BILLING.minimumCents,
    expiresAt,
    platformLifetimeSeconds,
  };
}

function sessionPriceCents(minutes: number, pricingVersion: string): number {
  if (pricingVersion === "blender-cpu2-v1") return minutes * 5;
  if (pricingVersion !== BLENDER_BILLING.pricingVersion) throw new Error("Unsupported Blender pricing version.");
  return BLENDER_BILLING.minimumCents + (minutes - BLENDER_BILLING.minimumMinutes) * BLENDER_BILLING.priceCentsPerMinute;
}

export function settleBlenderSession({
  pricingVersion = BLENDER_BILLING.pricingVersion,
  reservedMinutes,
  readyAt,
  stoppedAt,
  startupFailed,
}: BlenderSessionSettlement): BlenderSessionSettlementResult {
  if (
    !Number.isSafeInteger(reservedMinutes) ||
    reservedMinutes < BLENDER_BILLING.minimumMinutes ||
    reservedMinutes > BLENDER_BILLING.maximumMinutes
  ) {
    throw new RangeError("reservedMinutes must be an integer from 5 through 30.");
  }
  assertSafeNonNegativeInteger(stoppedAt, "stoppedAt");
  if (typeof startupFailed !== "boolean") throw new TypeError("startupFailed must be boolean.");

  const reservedCents = sessionPriceCents(reservedMinutes, pricingVersion);

  if (startupFailed) {
    if (readyAt !== null) throw new Error("a failed startup cannot have a ready timestamp.");
    return {
      chargedMinutes: 0,
      chargeCents: 0,
      releaseCents: reservedCents,
    };
  }

  if (readyAt === null) throw new Error("a successful session requires a ready timestamp.");
  assertSafeNonNegativeInteger(readyAt, "readyAt");
  if (stoppedAt < readyAt) throw new RangeError("stoppedAt cannot precede readyAt.");

  const elapsedMilliseconds = stoppedAt - readyAt;
  const elapsedMinutes = Math.ceil(elapsedMilliseconds / 60_000);
  const chargedMinutes = Math.min(
    reservedMinutes,
    Math.max(BLENDER_BILLING.minimumMinutes, elapsedMinutes),
  );
  const chargeCents = sessionPriceCents(chargedMinutes, pricingVersion);
  return {
    chargedMinutes,
    chargeCents,
    releaseCents: reservedCents - chargeCents,
  };
}

export function worstCaseBlenderCostNanoUsd(minutes: number): number {
  if (!Number.isSafeInteger(minutes) || minutes <= 0) {
    throw new RangeError("minutes must be a positive safe integer.");
  }
  const lifetimeSeconds = minutes * 60 + BLENDER_BILLING.startupAllowanceSeconds;
  const nanoUsdPerSecond = 2 * 39_420 + 4 * 6_670;
  const cost = lifetimeSeconds * nanoUsdPerSecond;
  if (!Number.isSafeInteger(cost)) throw new RangeError("cost exceeds safe integer bounds.");
  return cost;
}
