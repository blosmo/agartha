const promptElement = document.querySelector('#agent-prompt');
promptElement.textContent = promptElement.textContent.replace('/compute/skill.md on this website', `${location.origin}/compute/skill.md`);
document.querySelector('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(promptElement.textContent);
    document.querySelector('#copy-status').textContent = ' Copied';
  } catch {
    document.querySelector('#copy-status').textContent = ' Select and copy the instructions above.';
  }
});
let pricing = { minimumMinutes: 5, maximumMinutes: 30, minimumCents: 40, priceCentsPerMinute: 5 };
const minutes = document.querySelector('#minutes');
function updateEstimate() {
  const count = Number(minutes.value);
  document.querySelector('#duration').textContent = `${count} minutes`;
  document.querySelector('#estimate').textContent = `${((pricing.minimumCents + Math.max(0, count - pricing.minimumMinutes) * pricing.priceCentsPerMinute) / 100).toFixed(2).replace(/^/, '$')} maximum`;
}
minutes.addEventListener('input', updateEstimate);
fetch('/api/blender/pricing', { cache: 'no-store', signal: AbortSignal.timeout(10000) })
  .then(async response => {
    if (!response.ok) throw new Error('Pricing unavailable');
    const data = await response.json();
    if (!['minimumMinutes', 'maximumMinutes', 'minimumCents', 'priceCentsPerMinute'].every(key => Number.isSafeInteger(data[key]) && data[key] > 0)
      || data.maximumMinutes < data.minimumMinutes) throw new Error('Invalid pricing');
    pricing = data;
    minutes.min = String(data.minimumMinutes);
    minutes.max = String(data.maximumMinutes);
    minutes.value = String(Math.max(data.minimumMinutes, Math.min(Number(minutes.value), data.maximumMinutes)));
    updateEstimate();
    document.querySelector('#availability').textContent = data.purchasesEnabled === true && data.paymentMode === 'live'
      ? 'Live credit purchases enabled. A quote checks compute eligibility and capacity.'
      : data.purchasesEnabled === true && data.paymentMode === 'test'
        ? 'Test payments only. Live credit purchases are not available.'
        : 'Credit purchases are currently unavailable. You can read the integration guide now.';
  })
  .catch(() => {
    document.querySelector('#availability').textContent = 'Live pricing could not be checked. Estimates use published pricing; verify the API before funding.';
  });
