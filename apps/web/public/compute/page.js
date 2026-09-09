const promptElement = document.querySelector('#agent-prompt');
const brief = document.querySelector('#brief');
const copy = document.querySelector('#copy');
const copyStatus = document.querySelector('#copy-status');
const minutes = document.querySelector('#minutes');
const retry = document.querySelector('#retry-pricing');
const publishedPricing = { currency: 'usd', minimumMinutes: 5, maximumMinutes: 30, minimumCents: 40, priceCentsPerMinute: 5, topUpCents: [500, 2000] };
let pricing = publishedPricing;
let verified = false;
let copying = false;
const money = cents => `$${(cents / 100).toFixed(2)}`;
const estimate = () => pricing.minimumCents + (Number(minutes.value) - pricing.minimumMinutes) * pricing.priceCentsPerMinute;
function updatePrompt() {
  const task = brief.value.trim() || 'Create a 3D model.';
  promptElement.textContent = `Read ${location.origin}/compute/skill.md.\nTask: ${task}\nRequest a ${minutes.value}-minute session quote.${verified ? ` The current estimated session cap is ${money(estimate())} USD.` : ' Verify live pricing first.'}\nShow me the quote and any required credit purchase before spending; wait for my approval.\nInspect the result, download the GLB, preview and editable source, then stop the session and confirm settlement.`;
  copyStatus.textContent = '';
}
function updateEstimate() {
  document.querySelector('#duration').textContent = `${minutes.value} minutes`;
  document.querySelector('#estimate').textContent = `${money(estimate())} ${verified ? 'session cap' : 'published estimate'}`;
  updatePrompt();
}
brief.addEventListener('input', updatePrompt);
minutes.addEventListener('input', updateEstimate);
copy.addEventListener('click', async () => {
  if (copying) return;
  const text = promptElement.textContent;
  copying = true;
  copy.disabled = true;
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = text === promptElement.textContent ? ' Copied' : ' Instructions changed. Copy again.';
  } catch {
    promptElement.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(promptElement);
    selection.removeAllRanges();
    selection.addRange(range);
    copyStatus.textContent = ' Instructions selected. Use your device’s Copy command.';
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
  document.querySelector('#price-description').textContent = `${money(pricing.minimumCents)} covers the first ${pricing.minimumMinutes} running minutes. Each additional begun minute costs ${money(pricing.priceCentsPerMinute)}. Prepaid credit options: ${pricing.topUpCents.map(money).join(' or ')} USD.`;
  updateEstimate();
}
retry.addEventListener('click', checkPricing);
updateEstimate();
checkPricing();
