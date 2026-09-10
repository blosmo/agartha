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
  await vi.waitFor(()=>expect(el('copy-status').textContent).toBe('Copied. Paste it into your agent.'));
  const prompt=writeText.mock.calls[0][0];
  expect(prompt).toContain('Task: <script>private teapot</script>');
  expect(prompt).toContain('Intended use: 3D printing');
  expect(prompt).toContain('/compute/skill.md');
  expect(prompt).toContain('Maximum managed job budget: $12.75 USD');
  expect(prompt).toContain('service Astra, generated references when used, independent review and Blender compute');
  expect(prompt).toContain('outside agent platform is separate');
  expect(prompt).toContain('ask once before creating the paid job');
  expect(prompt).toContain('continue without asking again for the same job');
  expect(prompt).toContain('/api/blender/jobs');
  expect(prompt).toContain('same IDs and exact payload');
  expect(prompt).toContain('Buying credit never starts work');
  expect(prompt).toContain('partial, failed or cancelled status honestly');
  expect(prompt).not.toContain('/compute/direct.md');
  expect(prompt).not.toContain('Build a blockout');
  expect(prompt).not.toContain('compute quotes');
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
  const detailed=document.querySelector<HTMLButtonElement>('[data-budget="20.00"]')!;
  detailed.click();
  expect((el('budget') as HTMLInputElement).value).toBe('20.00');
  expect(detailed.getAttribute('aria-pressed')).toBe('true');
  const prompt=el('agent-prompt').textContent;
  expect(prompt).toContain('$20.00 USD');
  input('minutes','30');
  expect(el('estimate').textContent).toBe('$1.65 compute session cap');
  expect(el('agent-prompt').textContent).toBe(prompt);
  expect(prompt).not.toContain('Request a 30-minute');
  input('budget','7.25');
  expect(detailed.getAttribute('aria-pressed')).toBe('false');
  expect(el('agent-prompt').textContent).toContain('$7.25 USD');
});

it.each(['','0','-5','0.39','.75','20.01','30','1.005','9007199254740992'])('rejects invalid budget %s and removes the stale plan',async(value)=>{
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

it('accepts the one-dollar lower bound',async()=>{
  await boot();
  input('budget','1');
  expect(el('agent-prompt').textContent).toContain('$1.00 USD');
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

it('recovers failed Direct Blender pricing without changing managed budget bounds',async()=>{
  const fetcher=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ok:true,json:async()=>({...rates,minimumMinutes:8,minimumCents:800,priceCentsPerMinute:10,topUpCents:[1000]})});
  await boot(fetcher);
  expect(el('estimate').textContent).toContain('published estimate');
  expect(el('agent-prompt').textContent).toContain('/compute/skill.md');
  expect(el('retry-pricing').hidden).toBe(false);
  el('retry-pricing').click();
  await vi.waitFor(()=>expect(el('estimate').textContent).toBe('$8.00 compute session cap'));
  expect(el('price-description').textContent).toContain('first 8 minutes');
  expect(el('price-description').textContent).toContain('Buy $10.00 in credits');
  expect(el('budget-error').hidden).toBe(true);
  expect(el('retry-pricing').hidden).toBe(true);
  input('budget','15');
  expect(el('agent-prompt').textContent).toContain('Maximum managed job budget: $15.00 USD');
  expect(el('agent-prompt').textContent).not.toContain('first 8 running minutes');
});

it.each([{...rates,currency:'eur'},{...rates,maximumMinutes:3},{...rates,minimumCents:Number.MAX_SAFE_INTEGER},{...rates,topUpCents:[]}])('rejects invalid Direct Blender pricing without changing the managed handoff',async(data)=>{
  await boot(vi.fn().mockResolvedValue({ok:true,json:async()=>data}));
  expect(el('estimate').textContent).toBe('$0.40 published estimate');
  expect(el('agent-prompt').textContent).toContain('/compute/skill.md');
  expect(el('retry-pricing').hidden).toBe(false);
});

it('labels Direct Blender pricing and publishes truthful managed reservation limits',async()=>{
  await boot();
  expect(el('price-description').textContent).toContain('Direct Blender compute:');
  expect(document.body.textContent).toContain('Direct Blender compute excludes the controller agent’s AI charges');
  expect(document.body.textContent).toContain('either path may have separate outside-platform fees');
  expect(document.body.textContent).toContain('Version 3 managed jobs reserve 30 minutes at caps of at least $5 and 10 minutes below $5.');
  expect(document.querySelector('a[href="/compute/direct.md"]')?.textContent).toContain('Direct Blender');
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
  expect(el('copy').getAttribute('aria-busy')).toBe('true');
  expect(el('copy-status').textContent).toBe('Copying plan…');
  input('budget','20');
  finish();
  await vi.waitFor(()=>expect(el('copy-status').textContent).toBe('Plan changed. Copy again.'));
  expect((el('copy') as HTMLButtonElement).disabled).toBe(false);
  expect(el('copy').hasAttribute('aria-busy')).toBe(false);
});

it('shows persistent field errors on submission and focuses the first invalid field',async()=>{
  await boot();
  input('brief','');
  input('budget','');
  expect(el('brief-error').hidden).toBe(true);
  el('copy').click();
  expect(document.activeElement).toBe(el('brief'));
  expect(el('brief').getAttribute('aria-invalid')).toBe('true');
  expect(el('brief').getAttribute('aria-describedby')).toContain('brief-error');
  expect(el('brief-error').textContent).toContain('Describe the model');
  expect(el('brief-error').hidden).toBe(false);
  expect(el('budget-error').hidden).toBe(false);
  input('brief','A teapot');
  el('copy').click();
  expect(document.activeElement).toBe(el('budget'));
  expect(el('brief-error').hidden).toBe(true);
  input('budget',' 12.75 ');
  expect(el('budget-error').hidden).toBe(true);
  expect(el('agent-prompt').textContent).toContain('$12.75 USD');
});

it('allows the textarea keyboard shortcut to copy the plan without a pointer',async()=>{
  await boot();
  const writeText=clipboard();
  el('brief').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',ctrlKey:true,bubbles:true,cancelable:true}));
  await vi.waitFor(()=>expect(writeText).toHaveBeenCalledOnce());
  expect(writeText.mock.calls[0][0]).toContain('A ceramic teapot with a wide handle');
});

it('switches creation workflows without losing either brief or starting work',async()=>{
  const fetcher=await boot();
  input('managed-brief','Keep this hosted-model brief');
  input('brief','Keep this direct-agent brief');
  el('direct-tab').click();
  expect(el('direct').hidden).toBe(false);
  expect(el('managed-panel').hidden).toBe(true);
  expect(el('direct-tab').getAttribute('aria-selected')).toBe('true');
  el('managed-tab').click();
  expect(el('managed-panel').hidden).toBe(false);
  expect(el('direct').hidden).toBe(true);
  expect((el('managed-brief') as HTMLTextAreaElement).value).toBe('Keep this hosted-model brief');
  expect((el('brief') as HTMLTextAreaElement).value).toBe('Keep this direct-agent brief');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('supports keyboard selection between the creation tabs',async()=>{
  await boot();
  el('managed-tab').focus();
  el('managed-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
  expect(document.activeElement).toBe(el('direct-tab'));
  expect(el('direct').hidden).toBe(false);
  expect(el('managed-tab').tabIndex).toBe(-1);
  el('direct-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}));
  expect(document.activeElement).toBe(el('managed-tab'));
  expect(el('managed-panel').hidden).toBe(false);
});
