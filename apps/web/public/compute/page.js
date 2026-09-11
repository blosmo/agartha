const form = document.querySelector('#plan-form');
const promptElement = document.querySelector('#agent-prompt');
const instructions = document.querySelector('#instructions');
const brief = document.querySelector('#brief');
const briefError = document.querySelector('#brief-error');
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
const touched = new Set();
const money = cents => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
const estimate = () => pricing.minimumCents + (Number(minutes.value) - pricing.minimumMinutes) * pricing.priceCentsPerMinute;
function budgetCents(value) {
  value = value.trim();
  if (!/^(?:\d+(?:\.\d{1,2})?|\.\d{1,2})$/.test(value)) return null;
  const [whole, fraction = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}
function updatePlan({ showErrors = false } = {}) {
  const briefMessage = brief.value.trim() ? '' : 'Describe the model you want to create.';
  brief.setCustomValidity(briefMessage);
  const showBriefError = Boolean(briefMessage) && (showErrors || touched.has(brief));
  brief.setAttribute('aria-invalid', String(showBriefError));
  briefError.textContent = showBriefError ? briefMessage : '';
  briefError.hidden = !showBriefError;
  const cents = budgetCents(budget.value);
  const error = cents === null
    ? 'Enter a USD amount with no more than two decimal places.'
    : cents < 100 || cents > 2000
      ? 'Enter a managed job budget from $1.00 to $20.00.'
      : '';
  budget.setCustomValidity(error);
  const showBudgetError = Boolean(error) && (showErrors || touched.has(budget));
  budget.setAttribute('aria-invalid', String(showBudgetError));
  budgetError.textContent = showBudgetError ? error : '';
  budgetError.hidden = !showBudgetError;
  for (const preset of presets) preset.setAttribute('aria-pressed', String(cents !== null && cents === budgetCents(preset.dataset.budget)));
  copyStatus.textContent = '';
  if (error || !brief.value.trim()) {
    promptElement.textContent = error || 'Describe a model to prepare your agent instructions.';
    return false;
  }
  promptElement.textContent = `Read ${location.origin}/compute/skill.md and use its managed creation workflow.
Task: ${brief.value.trim()}
Intended use: ${intendedUse.value}
Maximum managed job budget: ${money(cents)} USD, including service Astra, generated references when used, independent review and Blender compute. This service cap is a hard ceiling, not a spending target. Any fee charged by your outside agent platform is separate; disclose and bound it within the user's broader spending authorization.

Use the managed service for Blender execution and delivery. Check managed.workflowVersion in capabilities: version 3 adds a separate modeling plan and independent review of the exported GLB. Report the workflow actually available; do not claim independent acceptance without a recorded review. Do not write or run Blender code yourself unless I explicitly switch to Direct Blender. Define observable acceptance criteria and propose the best achievable scope. If this exact brief and cap have not yet been approved, ask once before creating the paid job. After exact approval, continue without asking again for the same job.

Check GET ${location.origin}/api/blender/capabilities and require managed.enabled. Register or reuse one stable identity and check its balance. Save unique jobId and requestId plus the exact request payload before POSTing to /api/blender/jobs. Put the task and intended use in brief and send the approved amount as budgetCents. Omit referenceMode to use the advertised default; send referenceMode "none" only when references are declined. Never increase the cap.

Creating the job reserves its total cap. If the balance is insufficient, present the documented funding options; a credit purchase is a separate upfront cash outlay and needs separate approval. Buying credit never starts work. Reuse the same purchase ID after uncertainty and confirm credited balance.

POST the returned job start route, then poll its status with bounded waits. After any uncertain create or start response, reuse the same IDs and exact payload and observe the existing job. Never create a replacement paid job. Cancel through its cancel route when requested.

Download only returned authenticated artifacts, including available GLB, BLEND, preview, review trace, reference sheet or video. Report completed, partial, failed or cancelled status honestly; include actual charges, pending or unknown usage, independent acceptance state, remaining defects and unavailable files. A review is not a quality guarantee. Publication and additional spending require separate approval.`;
  return true;
}
function updateEstimate() {
  document.querySelector('#duration').textContent = `${minutes.value} minutes`;
  document.querySelector('#estimate').textContent = `${money(estimate())} ${verified ? 'compute session cap' : 'published estimate'}`;
}
brief.addEventListener('input', updatePlan);
budget.addEventListener('input', updatePlan);
for (const field of [brief, budget]) {
  field.addEventListener('blur', () => { touched.add(field); updatePlan(); });
}
brief.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    form.requestSubmit();
  }
});
const creationTabs = [...document.querySelectorAll('.creation-tabs [role=tab]')];
function selectCreationTab(selected, focus = false) {
  for (const tab of creationTabs) {
    const active = tab === selected;
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    document.getElementById(tab.getAttribute('aria-controls')).hidden = !active;
  }
  if (focus) selected.focus();
}
for (const tab of creationTabs) {
  tab.addEventListener('click', () => selectCreationTab(tab));
  tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? creationTabs.length - 1 : (creationTabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : creationTabs.length - 1)) % creationTabs.length;
    selectCreationTab(creationTabs[index], true);
  });
}
function selectHashTab() {
  if (location.hash === '#direct') selectCreationTab(document.getElementById('direct-tab'));
  else if (location.hash === '#start') selectCreationTab(document.getElementById('managed-tab'));
}
window.addEventListener('hashchange', selectHashTab);
selectHashTab();
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
  touched.add(brief);
  touched.add(budget);
  const ready = updatePlan({ showErrors: true });
  if (!form.checkValidity() || !ready) {
    form.querySelector(':invalid')?.focus();
    return;
  }
  const text = promptElement.textContent;
  copying = true;
  copy.disabled = true;
  copy.setAttribute('aria-busy', 'true');
  copyStatus.textContent = 'Copying plan…';
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = text === promptElement.textContent ? 'Copied. Paste it into your agent.' : 'Plan changed. Copy again.';
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
    copy.removeAttribute('aria-busy');
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
  document.querySelector('#availability').textContent = 'Checking prices…';
  try {
    const response = await fetch('/api/blender/pricing', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Pricing unavailable');
    const data = await response.json();
    if (!validPricing(data)) throw new Error('Invalid pricing');
    pricing = data;
    verified = true;
    document.querySelector('#availability').textContent = data.purchasesEnabled === true && data.paymentMode === 'live'
      ? 'Credit purchases are available.'
      : data.purchasesEnabled === true && data.paymentMode === 'test'
        ? 'Test payments only. Live credit purchases are not available.'
        : 'Credit purchases are unavailable. Try again later.';
  } catch {
    pricing = publishedPricing;
    verified = false;
    retry.hidden = false;
    document.querySelector('#availability').textContent = 'Showing estimated prices. Retry before buying credits.';
  }
  minutes.min = String(pricing.minimumMinutes);
  minutes.max = String(pricing.maximumMinutes);
  minutes.value = String(Math.max(pricing.minimumMinutes, Math.min(Number(minutes.value), pricing.maximumMinutes)));
  document.querySelector('#price-description').textContent = `Direct Blender compute: ${money(pricing.minimumCents)} for the first ${pricing.minimumMinutes} ${pricing.minimumMinutes === 1 ? 'minute' : 'minutes'}, then ${money(pricing.priceCentsPerMinute)} per started minute. Buy ${pricing.topUpCents.map(money).join(' or ')} in credits.`;
  updateEstimate();
  updatePlan();
}
retry.addEventListener('click', checkPricing);
form.hidden = false;
document.querySelector('#session-calculator').hidden = false;
document.querySelector('#availability').hidden = false;
updateEstimate();
updatePlan();
checkPricing();
