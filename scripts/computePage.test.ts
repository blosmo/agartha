// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
const html = readFileSync('apps/web/public/compute/index.html', 'utf8');
const script = readFileSync('apps/web/public/compute/page.js', 'utf8');
const rates = {currency:'usd',minimumMinutes:5,maximumMinutes:30,minimumCents:40,priceCentsPerMinute:5,topUpCents:[500,2000],purchasesEnabled:true,paymentMode:'live'};
const el = (id: string) => document.getElementById(id)!;
async function boot(fetcher = vi.fn().mockResolvedValue({ok:true,json:async()=>rates})) {
  document.documentElement.innerHTML = html;
  vi.stubGlobal('fetch',fetcher);
  new Function(script)();
  await vi.waitFor(()=>expect(el('availability').textContent).not.toContain('Checking'));
  return fetcher;
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it('carries a private brief and selected cap into the copied approval-gated handoff',async()=>{
  const fetcher = await boot();
  const writeText=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
  (el('brief') as HTMLTextAreaElement).value='<script>private teapot</script>';
  el('brief').dispatchEvent(new Event('input'));
  (el('minutes') as HTMLInputElement).value='12'; el('minutes').dispatchEvent(new Event('input'));
  el('copy').click();
  await vi.waitFor(()=>expect(el('copy-status').textContent).toContain('Copied'));
  expect(writeText.mock.calls[0][0]).toContain('12-minute session quote. The current estimated session cap is $0.75 USD');
  expect(writeText.mock.calls[0][0]).toContain('wait for my approval');
  expect(el('agent-prompt').querySelector('script')).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  el('brief').dispatchEvent(new Event('input')); expect(el('copy-status').textContent).toBe('');
});
it('recovers failed pricing and updates both prose and estimates from live rates',async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ok:true,json:async()=>({...rates,minimumMinutes:8,minimumCents:80,priceCentsPerMinute:10,topUpCents:[1000]})});
  await boot(fetcher);
  expect(el('estimate').textContent).toContain('published estimate');
  expect(el('agent-prompt').textContent).toContain('Verify live pricing first');
  expect(el('retry-pricing').hidden).toBe(false);
  el('retry-pricing').click();
  await vi.waitFor(()=>expect(el('estimate').textContent).toBe('$0.80 session cap'));
  expect(el('price-description').textContent).toContain('first 8 running minutes');
  expect(el('price-description').textContent).toContain('$10.00 USD');
  expect(el('retry-pricing').hidden).toBe(true);
});
it.each([{...rates,currency:'eur'},{...rates,maximumMinutes:3},{...rates,minimumCents:Number.MAX_SAFE_INTEGER},{...rates,topUpCents:[]}])('rejects invalid pricing without presenting a verified cap',async(data)=>{
  await boot(vi.fn().mockResolvedValue({ok:true,json:async()=>data}));
  expect(el('estimate').textContent).toBe('$0.40 published estimate');
  expect(el('retry-pricing').hidden).toBe(false);
});
it('selects instructions when clipboard access fails',async()=>{
  await boot();
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}});
  el('copy').click();
  await vi.waitFor(()=>expect(el('copy-status').textContent).toContain('Instructions selected'));
  expect(window.getSelection()?.toString()).toBe(el('agent-prompt').textContent);
});
