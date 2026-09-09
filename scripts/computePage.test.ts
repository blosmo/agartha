// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';

const html = readFileSync('apps/web/public/compute/index.html', 'utf8');
const script = readFileSync('apps/web/public/compute/page.js', 'utf8');
const rates = {currency:'usd',minimumMinutes:5,maximumMinutes:30,minimumCents:40,priceCentsPerMinute:5,topUpCents:[500,2000],purchasesEnabled:true,paymentMode:'live'};
const el = (id: string) => document.getElementById(id)!;
function input(id: string, value: string) {
  (el(id) as HTMLInputElement).value = value;
  el(id).dispatchEvent(new Event('input'));
}
function clipboard(writeText = vi.fn().mockResolvedValue(undefined)) {
  Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText}});
  return writeText;
}
async function boot(fetcher = vi.fn().mockResolvedValue({ok:true,json:async()=>rates})) {
  document.documentElement.innerHTML = html;
  vi.stubGlobal('fetch',fetcher);
  new Function(script)();
  await vi.waitFor(()=>expect(el('availability').textContent).not.toContain('Checking'));
  input('brief', 'A ceramic teapot with a wide handle');
  return fetcher;
}
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});

it('copies the custom brief, intended use and total budget without submitting private inputs', async()=>{
  const fetcher = await boot();
  const writeText = clipboard();
  input('brief','<script>private teapot</script>');
  (el('intended-use') as HTMLSelectElement).value='3D printing';
  el('intended-use').dispatchEvent(new Event('change'));
  input('budget','12.75');
  el('copy').click();
  await vi.waitFor(()=>expect(el('copy-status').textContent).toBe('Copied'));
  const prompt=writeText.mock.calls[0][0];
  expect(prompt).toContain('Task: <script>private teapot</script>');
  expect(prompt).toContain('Intended use: 3D printing');
  expect(prompt).toContain('Maximum TOTAL task usage budget: $12.75 USD');
  expect(prompt).toContain('compute, model inference and review');
  expect(prompt).toContain('wait for my approval');
  expect(prompt).toContain('If model or review costs cannot be measured and capped');
  expect(prompt).toContain('Keep the best checkpoint');
  expect(prompt).toContain('Stop early');
  expect(prompt).toContain('before stopping');
  expect(prompt).toContain('Report unspent budget only when total costs are known');
  expect(el('agent-prompt').querySelector('script')).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls[0][0]).toBe('/api/blender/pricing');
  expect(fetcher.mock.calls[0][1]).not.toHaveProperty('body');
  expect([...document.querySelectorAll('[data-budget]')].every(button=>button.getAttribute('aria-pressed')==='false')).toBe(true);
  input('budget','15');
  expect(el('copy-status').textContent).toBe('');
});

it('treats effort presets as editable budgets and keeps the session calculator independent', async()=>{
  await boot();
  const detailed=document.querySelector<HTMLButtonElement>('[data-budget="30.00"]')!;
  detailed.click();
  expect((el('budget') as HTMLInputElement).value).toBe('30.00');
  expect(detailed.getAttribute('aria-pressed')).toBe('true');
  const prompt=el('agent-prompt').textContent;
  expect(prompt).toContain('$30.00 USD');
  input('minutes','30');
  expect(el('estimate').textContent).toBe('$1.65 compute session cap');
  expect(el('agent-prompt').textContent).toBe(prompt);
  expect(prompt).not.toContain('Request a 30-minute');
  input('budget','7.25');
  expect(detailed.getAttribute('aria-pressed')).toBe('false');
  expect(el('agent-prompt').textContent).toContain('$7.25 USD');
});

it.each(['','0','-5','0.39','1.005','9007199254740992'])('rejects invalid budget %s and removes the stale plan',async(value)=>{
  await boot();
  const writeText=clipboard();
  input('budget',value);
  el('copy').click();
  expect(writeText).not.toHaveBeenCalled();
  expect(el('budget').getAttribute('aria-invalid')).toBe('true');
  expect(el('budget-error').hidden).toBe(false);
  expect(el('agent-prompt').textContent).not.toContain('Maximum TOTAL');
  input('budget','5');
  expect(el('budget').getAttribute('aria-invalid')).toBe('false');
  expect(el('budget-error').hidden).toBe(true);
});

it('accepts a sub-dollar amount written without the leading zero',async()=>{
  await boot();
  input('budget','.75');
  expect(el('agent-prompt').textContent).toContain('$0.75 USD');
});

it('requires a meaningful brief before copying a plan',async()=>{
  await boot();
  const writeText=clipboard();
  input('brief','   ');
  el('copy').click();
  expect(writeText).not.toHaveBeenCalled();
  expect((el('brief') as HTMLTextAreaElement).validity.valid).toBe(false);
  expect(el('agent-prompt').textContent).toBe('Describe a model to prepare your agent instructions.');
});

it('recovers failed pricing and revalidates the task budget against new rates',async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ok:true,json:async()=>({...rates,minimumMinutes:8,minimumCents:800,priceCentsPerMinute:10,topUpCents:[1000]})});
  await boot(fetcher);
  expect(el('estimate').textContent).toContain('published estimate');
  expect(el('agent-prompt').textContent).toContain('Live compute pricing is unverified');
  expect(el('retry-pricing').hidden).toBe(false);
  el('retry-pricing').click();
  await vi.waitFor(()=>expect(el('estimate').textContent).toBe('$8.00 compute session cap'));
  expect(el('price-description').textContent).toContain('first 8 running minutes');
  expect(el('price-description').textContent).toContain('$10.00 USD');
  expect(el('budget-error').textContent).toContain('at least $8.00');
  expect(el('retry-pricing').hidden).toBe(true);
  input('budget','15');
  expect(el('agent-prompt').textContent).toContain('Current compute pricing: $8.00');
});

it.each([{...rates,currency:'eur'},{...rates,maximumMinutes:3},{...rates,minimumCents:Number.MAX_SAFE_INTEGER},{...rates,topUpCents:[]}])('rejects invalid API pricing without presenting a verified session cap',async(data)=>{
  await boot(vi.fn().mockResolvedValue({ok:true,json:async()=>data}));
  expect(el('estimate').textContent).toBe('$0.40 published estimate');
  expect(el('agent-prompt').textContent).toContain('Live compute pricing is unverified');
  expect(el('retry-pricing').hidden).toBe(false);
});

it('reveals and selects the plan when clipboard access fails',async()=>{
  await boot();
  clipboard(vi.fn().mockRejectedValue(new Error('denied')));
  el('copy').click();
  await vi.waitFor(()=>expect(el('copy-status').textContent).toContain('Instructions selected'));
  expect((el('instructions') as HTMLDetailsElement).open).toBe(true);
  expect(window.getSelection()?.toString()).toBe(el('agent-prompt').textContent);
});

it('does not report an outdated plan as copied when the budget changes during clipboard access',async()=>{
  await boot();
  let finish!: () => void;
  clipboard(vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;})));
  el('copy').click();
  input('budget','20');
  finish();
  await vi.waitFor(()=>expect(el('copy-status').textContent).toBe('Plan changed. Copy again.'));
  expect((el('copy') as HTMLButtonElement).disabled).toBe(false);
});
