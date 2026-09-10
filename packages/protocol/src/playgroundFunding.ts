/** Values are prepaid USD cents, not newly issued currency. */
export type PlaygroundPassOffer = {
  offerId: string;
  feeCents: number;
  generationCents: number;
  totalCents: number;
  livemode: boolean;
  available: boolean;
  unavailableReason?: string;
};
export type PlaygroundPassReceipt = {
  passId: string;
  offerId: string;
  feeCents: number;
  generationCents: number;
  livemode: boolean;
  activatedAt: number;
};
export type PlaygroundFunding = {
  projectId: string;
  livemode: boolean;
  targetCents: number;
  feeCents: number;
  backedCents: number;
  status: 'funding' | 'building' | 'settled' | 'cancelled';
  jobId?: string;
  job?: { status: 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled'; progress: string; artifactsReady: boolean; visuallyInspected: boolean };
  chargedCents: number;
  refundedCents: number;
  backers: Array<{ backingId: string; contributorName: string; amountCents: number; refundedCents: number; chargedCents: number; status: 'held' | 'withdrawn' | 'settled'; mine: boolean }>;
};

/** Deterministic largest-remainder allocation; exact conservation, no rounding loss. */
export function allocateFundingRefund(amounts: number[], refundCents: number): number[] {
  if (amounts.some(n => !Number.isSafeInteger(n) || n <= 0) || !Number.isSafeInteger(refundCents) || refundCents < 0) throw new Error('Invalid funding allocation.');
  const total = amounts.reduce((a, b) => a + b, 0);
  if (!Number.isSafeInteger(total) || refundCents > total) throw new Error('Refund exceeds funding.');
  if (!total) return [];
  const denominator = BigInt(total);
  const products = amounts.map(n => BigInt(n) * BigInt(refundCents));
  const result = products.map(n => Number(n / denominator));
  const order = products.map((n, i) => ({ i, remainder: n % denominator })).sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
  const extra = refundCents - result.reduce((a, b) => a + b, 0);
  for (let i = 0; i < extra; i++) result[order[i].i]++;
  return result;
}
