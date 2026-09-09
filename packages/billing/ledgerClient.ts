export class BillingHttpError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) { super(message); }
}

export type LedgerCall = <T = unknown>(operation: string, args: Record<string, unknown>) => Promise<T>;

export function createLedgerClient(config: { siteUrl: string; gatewayKey: string; paymentKey?: string; brokerKey?: string }, fetcher: typeof fetch = fetch): LedgerCall {
  const base = new URL(config.siteUrl);
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(base.hostname))) throw new Error('Ledger URL must use HTTPS.');
  if (!config.gatewayKey) throw new Error('Billing gateway key is required.');
  return async <T>(operation: string, args: Record<string, unknown>): Promise<T> => {
    if (!/^[a-zA-Z]+$/.test(operation)) throw new Error('Invalid billing operation.');
    const response = await fetcher(new URL(`/billing/api/${operation}`, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-agartha-billing-key': config.gatewayKey, ...(config.paymentKey ? { 'x-agartha-payment-key': config.paymentKey } : {}), ...(config.brokerKey ? { 'x-agartha-broker-key': config.brokerKey } : {}) },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      const code = body?.code === 'stale_generation' ? 'stale_generation' : undefined;
      throw new BillingHttpError(response.status, response.status === 401 ? 'Billing authorization failed.' : 'Billing operation could not complete.', code);
    }
    return await response.json() as T;
  };
}
