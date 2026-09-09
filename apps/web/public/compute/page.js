const form = document.querySelector('#plan-form');
const promptElement = document.querySelector('#agent-prompt');
const instructions = document.querySelector('#instructions');
const brief = document.querySelector('#brief');
const intendedUse = document.querySelector('#intended-use');
const budget = document.querySelector('#budget');
const budgetError = document.querySelector('#budget-error');
const presets = document.querySelectorAll('[data-budget]');
const copy = document.querySelector('#copy');
const copyStatus = document.querySelector('#copy-status');
const minutes = document.querySelector('#minutes');
const retry = document.querySelector('#retry-pricing');
const publishedPricing = { currency: 'usd', minimumMinutes: 5, maximumMinutes: 30, minimumCents: 40, priceCentsPerMinute: 5, topUpCents: [500, 2000] };
let pricing = publishedPricing;
let verified = false;
let copying = false;
const money = cents => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
const estimate = () => pricing.minimumCents + (Number(minutes.value) - pricing.minimumMinutes) * pricing.priceCentsPerMinute;
function budgetCents(value) {
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}
function updatePlan() {
  brief.setCustomValidity(brief.value.trim() ? '' : 'Describe the model you want to create.');
  const cents = budgetCents(budget.value);
  const error = cents === null
    ? 'Enter a positive USD amount with no more than two decimal places.'
    : cents < pricing.minimumCents
      ? `Allow at least ${money(pricing.minimumCents)} for the ${verified ? 'current' : 'published'} minimum compute charge, plus model and review costs.`
      : '';
  budget.setCustomValidity(error);
  budget.setAttribute('aria-invalid', String(Boolean(error)));
  budgetError.textContent = error;
  budgetError.hidden = !error;
  for (const preset of presets) preset.setAttribute('aria-pressed', String(cents !== null && cents === budgetCents(preset.dataset.budget)));
  copyStatus.textContent = '';
  if (error || !brief.value.trim()) {
    promptElement.textContent = error || 'Describe a model to prepare your agent instructions.';
    return false;
  }
  const pricingNote = verified
    ? `Current compute pricing: ${money(pricing.minimumCents)} for the first ${pricing.minimumMinutes} running minutes, then ${money(pricing.priceCentsPerMinute)} per additional begun minute. Sessions reserve ${pricing.minimumMinutes}–${pricing.maximumMinutes} minutes; get fresh quotes before reserving.`
    : `Live compute pricing is unverified. Check ${location.origin}/api/blender/pricing before planning paid work.`;
  promptElement.textContent = `Read ${location.origin}/compute/skill.md and its modeling guide.
Task: ${brief.value.trim()}
Intended use: ${intendedUse.value}
Maximum TOTAL task usage budget: ${money(cents)} USD, including compute, model inference and review. This is a ceiling, not a spending target.

Before spending, define acceptance criteria for this use and propose the best achievable scope within the budget. Estimate and bound all usage costs, reserving enough for inspection, validation, export and cleanup. If model or review costs cannot be measured and capped, disclose the unknown costs and resolve the budget scope with me before spending; do not promise a total cap you cannot enforce.
${pricingNote}
Show me the plan, compute quotes and any required prepaid credit purchase; wait for my approval. A credit purchase is separate upfront cash outlay, possibly larger than task usage, and needs explicit approval. Unused credits stay in the wallet; do not double count funding as usage.

Build a blockout, inspect actual previews, and fix the highest-impact affordable defects. Keep the best checkpoint and compare revisions against it. Stop early when acceptance criteria are met or further edits are unlikely to help. Stop iterating while enough budget remains to validate, export and close; never spend the full cap just because it is available.
Download the GLB, PNG preview and editable BLEND before stopping. Validate for the intended use and disclose any unsupported format or unverified requirement. Confirm shutdown and settlement.
Deliver files, what you checked, remaining defects, actual compute/model/review costs, any unknown costs, and why you stopped. Report unspent budget only when total costs are known. Ask before any additional spending or publication.`;
  return true;
}
function updateEstimate() {
  document.querySelector('#duration').textContent = `${minutes.value} minutes`;
  document.querySelector('#estimate').textContent = `${money(estimate())} ${verified ? 'compute session cap' : 'published estimate'}`;
}
brief.addEventListener('input', updatePlan);
budget.addEventListener('input', updatePlan);
intendedUse.addEventListener('change', updatePlan);
for (const preset of presets) {
  preset.addEventListener('click', () => {
    budget.value = preset.dataset.budget;
    updatePlan();
  });
}
minutes.addEventListener('input', updateEstimate);
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (copying) return;
  const ready = updatePlan();
  if (!form.reportValidity() || !ready) return;
  const text = promptElement.textContent;
  copying = true;
  copy.disabled = true;
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = text === promptElement.textContent ? 'Copied' : 'Plan changed. Copy again.';
  } catch {
    if (text !== promptElement.textContent) {
      copyStatus.textContent = 'Plan changed. Copy again.';
      return;
    }
    instructions.open = true;
    promptElement.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(promptElement);
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent = 'Instructions selected. Use your device’s Copy command.';
  } finally {
    copying = false;
    copy.disabled = false;
  }
});
function validPricing(data) {
  return data && data.currency === 'usd'
    && ['minimumMinutes', 'maximumMinutes', 'minimumCents', 'priceCentsPerMinute'].every(key => Number.isSafeInteger(data[key]) && data[key] > 0)
    && data.maximumMinutes >= data.minimumMinutes
    && Number.isSafeInteger(data.minimumCents + (data.maximumMinutes - data.minimumMinutes) * data.priceCentsPerMinute)
    && Array.isArray(data.topUpCents) && data.topUpCents.length > 0
    && data.topUpCents.every(value => Number.isSafeInteger(value) && value > 0);
}
async function checkPricing() {
  retry.hidden = true;
  document.querySelector('#availability').textContent = 'Checking live pricing and purchase availability…';
  try {
    const response = await fetch('/api/blender/pricing', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Pricing unavailable');
    const data = await response.json();
    if (!validPricing(data)) throw new Error('Invalid pricing');
    pricing = data;
    verified = true;
    document.querySelector('#availability').textContent = data.purchasesEnabled === true && data.paymentMode === 'live'
      ? 'Live credit purchases enabled. A quote checks compute eligibility and capacity.'
      : data.purchasesEnabled === true && data.paymentMode === 'test'
        ? 'Test payments only. Live credit purchases are not available.'
        : 'Credit purchases are currently unavailable. You can read the integration guide now.';
  } catch {
    pricing = publishedPricing;
    verified = false;
    retry.hidden = false;
    document.querySelector('#availability').textContent = 'Live pricing could not be checked. This is a published estimate. Retry or verify the pricing API before funding.';
  }
  minutes.min = String(pricing.minimumMinutes);
  minutes.max = String(pricing.maximumMinutes);
  minutes.value = String(Math.max(pricing.minimumMinutes, Math.min(Number(minutes.value), pricing.maximumMinutes)));
  budget.min = money(pricing.minimumCents).slice(1);
  document.querySelector('#price-description').textContent = `${money(pricing.minimumCents)} covers the first ${pricing.minimumMinutes} running minutes. Each additional begun minute costs ${money(pricing.priceCentsPerMinute)}. Prepaid credit options: ${pricing.topUpCents.map(money).join(' or ')} USD.`;
  updateEstimate();
  updatePlan();
}
retry.addEventListener('click', checkPricing);
updateEstimate();
updatePlan();
checkPricing();
