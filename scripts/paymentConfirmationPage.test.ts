// @vitest-environment jsdom
import {readFileSync} from 'node:fs';
import {afterEach, expect, it, vi} from 'vitest';

const html=readFileSync('apps/web/public/payments/return/index.html','utf8');
const script=readFileSync('apps/web/public/payments/return/page.js','utf8');
const el=(id:string)=>document.getElementById(id)!;
const credited={state:'credited',amountCents:500,currency:'usd',livemode:true,creditedCents:500};
const receiptId='cs_live_receipt123';
const cleanupListeners:Array<[string,EventListenerOrEventListenerObject,boolean|AddEventListenerOptions|undefined]>=[];

function boot(query=`?session_id=${receiptId}`, fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>credited})) {
  document.documentElement.innerHTML=html;
  window.history.replaceState(null,'',`/payments/return/${query}`);
  vi.stubGlobal('fetch',fetcher);
  const add=window.addEventListener.bind(window);
  vi.spyOn(window,'addEventListener').mockImplementation((type,listener,options)=>{
    cleanupListeners.push([type,listener,options]);
    add(type,listener,options);
  });
  new Function(script)();
  return fetcher;
}
afterEach(()=>{
  window.dispatchEvent(new Event('pagehide'));
  for(const [type,listener,options] of cleanupListeners.splice(0)) window.removeEventListener(type,listener,options);
  vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();
});

it('shows only verified credit contribution and links back to both services',async()=>{
  const fetcher=boot();
  await vi.waitFor(()=>expect(el('receipt-title').textContent).toBe('Payment confirmed'));
  expect(el('receipt-amount').textContent).toBe('$5.00 USD');
  expect(el('receipt-credits').textContent).toBe('$5.00 USD');
  expect(el('receipt-mode').hidden).toBe(true);
  expect(document.querySelector('a[href="https://3dforagents.com/compute/"]')).not.toBeNull();
  expect(document.querySelector('a[href="https://agartha-dusky.vercel.app/"]')).not.toBeNull();
  expect(fetcher).toHaveBeenCalledWith(`/api/blender/checkout-status?session_id=${receiptId}`,expect.objectContaining({credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'}));
});

it.each(['','?success=true&amount=500','?canceled=1','?legacy=1','?blenderPayment=complete','?session_id=bad','?session_id=cs_live_receipt123&session_id=cs_live_another123'])('does not claim payment from missing, forged or incomplete redirect %s',query=>{
  const fetcher=boot(query);
  expect(fetcher).not.toHaveBeenCalled();
  expect(el('receipt').dataset.state).not.toBe('credited');
  expect(el('receipt-title').textContent).not.toContain('confirmed');
  expect(el('receipt-amounts').hidden).toBe(true);
  expect(el('receipt-retry').hidden).toBe(true);
});

it('uses the verified receipt even when a conflicting cancel flag is supplied',async()=>{
  boot(`?session_id=${receiptId}&canceled=1`);
  await vi.waitFor(()=>expect(el('receipt').dataset.state).toBe('credited'));
});

it('distinguishes payment received from ledger crediting and stops polling after confirmation',async()=>{
  vi.useFakeTimers();
  const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>({...credited,state:'payment_received',creditedCents:undefined})}).mockResolvedValueOnce({ok:true,json:async()=>credited});
  boot(undefined,fetcher);
  await vi.advanceTimersByTimeAsync(0);
  expect(el('receipt-title').textContent).toBe('Payment received');
  expect(el('receipt-credit-row').hidden).toBe(true);
  await vi.advanceTimersByTimeAsync(2500);
  expect(el('receipt-title').textContent).toBe('Payment confirmed');
  await vi.advanceTimersByTimeAsync(30000);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('bounds automatic polling and allows a fresh manual status check without creating a payment',async()=>{
  vi.useFakeTimers();
  const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({...credited,state:'pending',creditedCents:undefined})});
  boot(undefined,fetcher);
  await vi.advanceTimersByTimeAsync(30000);
  expect(fetcher).toHaveBeenCalledTimes(6);
  expect(el('receipt-progress').textContent).toContain('Check again later');
  fetcher.mockResolvedValue({ok:true,json:async()=>credited});
  el('receipt-retry').click();
  await vi.advanceTimersByTimeAsync(0);
  expect(fetcher).toHaveBeenCalledTimes(7);
  expect(el('receipt').dataset.state).toBe('credited');
  for(const [,request] of fetcher.mock.calls) expect(request.method).toBeUndefined();
});

it('recovers from unavailable status and never renders upstream error details',async()=>{
  const fetcher=vi.fn().mockResolvedValueOnce({ok:false,json:async()=>({error:'private details'})}).mockResolvedValueOnce({ok:true,json:async()=>credited});
  boot(undefined,fetcher);
  await vi.waitFor(()=>expect(el('receipt').dataset.state).toBe('unavailable'));
  expect(document.body.textContent).not.toContain('private details');
  el('receipt-retry').click();
  await vi.waitFor(()=>expect(el('receipt').dataset.state).toBe('credited'));
});

it('marks test mode without promising live credits',async()=>{
  boot('?session_id=cs_test_receipt123',vi.fn().mockResolvedValue({ok:true,json:async()=>({...credited,livemode:false})}));
  await vi.waitFor(()=>expect(el('receipt-title').textContent).toBe('Test payment confirmed'));
  expect(el('receipt-mode').hidden).toBe(false);
  expect(el('receipt-message').textContent).toContain('does not add live credits');
});

it('shows a partial credit adjustment without claiming the original full amount was credited',async()=>{
  boot(undefined,vi.fn().mockResolvedValue({ok:true,json:async()=>({...credited,state:'adjusted',creditedCents:250})}));
  await vi.waitFor(()=>expect(el('receipt-title').textContent).toBe('Payment updated'));
  expect(el('receipt-credits').textContent).toBe('$2.50 USD');
  expect(el('receipt-message').textContent).toContain('refund or payment review');
});

it.each([{...credited,creditedCents:undefined},{...credited,creditedCents:250},{...credited,currency:'eur'},{...credited,state:'<script>confirmed</script>'}])('fails closed for an invalid receipt response',async(data)=>{
  boot(undefined,vi.fn().mockResolvedValue({ok:true,json:async()=>data}));
  await vi.waitFor(()=>expect(el('receipt').dataset.state).toBe('unavailable'));
  expect(el('receipt-amounts').hidden).toBe(true);
});
