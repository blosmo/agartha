(() => {
  'use strict';
  const el = id => document.getElementById(`managed-${id}`);
  const money = cents => `$${(cents / 100).toFixed(2)}`;
  const tokenKey = 'agartha-compute-token';
  const recoveryKey = 'agartha-compute-recovery';
  const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
  const jobKey = 'agartha-compute-job';
  const purchaseKey = 'agartha-compute-purchase';
  const terminal = new Set(['completed', 'partial', 'failed', 'cancelled']);
  let token, job, capabilities, busy = false, timer;
  function error(err) { el('error').textContent = err.message || 'Request failed. Retry the same job to recover its status.'; }
  async function api(path, body, authenticated = true) {
    const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(authenticated ? { Authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store', signal: AbortSignal.timeout(30000) });
    let data;
    try { data = await response.json(); }
    catch { throw new Error("The creation service could not be reached. Please refresh or try again shortly."); }
    if (!response.ok) {
      const failure = new Error(typeof data.error === 'string' ? data.error : `Request failed (${response.status}). Your saved request can be retried.`);
      failure.status = response.status;
      throw failure;
    }
    return data;
  }
  async function identity() {
    if (!token) {
      token = localStorage.getItem(tokenKey);
      if (token && !/^[a-f0-9]{64}$/.test(token)) throw new Error('The saved browser identity is invalid. Restore your original token before continuing.');
      if (!token) {
        token = randomToken();
        localStorage.setItem(tokenKey, token);
      }
    }
    let recovery = localStorage.getItem(recoveryKey);
    if (!recovery) { recovery = randomToken(); localStorage.setItem(recoveryKey, recovery); }
    if (!/^[a-f0-9]{64}$/.test(recovery) || recovery === token) throw new Error('The saved wallet recovery credential is invalid.');
    try {
      const registered = await api('/api/session', { agentToken: token, recoveryToken: recovery, name: 'Compute creator' }, false);
      // Existing identities created before recovery support can safely add a separate credential.
      if (!registered.recoveryConfigured) await api('/api/session/renew', { newRecoveryToken: recovery });
      else await api('/api/session/renew', { recoveryToken: recovery });
    } catch (err) {
      if (err.status !== 401) throw err;
      await api('/api/session/renew', { recoveryToken: recovery });
    }
  }
  async function balance() {
    if (!token) return;
    const data = await api('/api/blender/balance');
    el('balance').textContent = `${money(data.availableCents)} available${Number.isFinite(data.heldCents) ? ` · ${money(data.heldCents)} held` : ''}.`;
  }
  async function check() {
    try {
      const [data, pricing] = await Promise.all([api('/api/blender/capabilities', undefined, Boolean(token)), api('/api/blender/pricing', undefined, false)]);
      capabilities = data.managed;
      el('reference-option').hidden = capabilities?.references?.enabled !== true;
      el('references').disabled = Boolean(job) || capabilities?.references?.enabled !== true;
      referenceHelp();
      el('availability').textContent = capabilities?.enabled === true ? 'Managed creation is available.' : 'Managed creation is not available yet. Direct Blender instructions are below.';
      el('submit').disabled = capabilities?.enabled !== true || Boolean(job) || busy;
      document.querySelectorAll('[data-fund]').forEach(button => { button.disabled = pricing.purchasesEnabled !== true || pricing.paymentMode !== 'live'; });
    } catch (err) { capabilities = null; el('submit').disabled = true; el('availability').textContent = 'Creation availability could not be verified. Refresh to try again.'; error(err); }
  }
  function referenceHelp() {
    el('budget-help').textContent = capabilities?.references?.enabled === true && el('references').checked ? '$5–$20 total, including design references, Astra, and Blender. Charged for actual usage; unused credits stay in your wallet.' : '$1–$20, including Astra and Blender. Charged for actual usage; unused credits stay in your wallet. A higher budget does not guarantee a better model.';
  }
  el('references').addEventListener('change', referenceHelp);
  function savedJob() { localStorage.setItem(jobKey, JSON.stringify(job)); }
  async function download(name, button) {
    button.disabled = true;
    try {
      const response = await fetch(`/api/blender/jobs/${encodeURIComponent(job.jobId)}/artifacts/${name}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Download unavailable (${response.status}).`);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = name; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) { error(err); } finally { button.disabled = false; }
  }
  function render(data) {
    const done = terminal.has(data.status);
    el('job').hidden = false;
    el('progress').textContent = `${data.status || 'Request saved'}${typeof data.progress === 'string' ? ` — ${data.progress}` : ''}${done && typeof data.reason === 'string' && data.reason !== data.progress ? ` — ${data.reason}` : ''}`;
    const charged = (data.chargedAiCents || 0) + (data.computeChargedCents || 0);
    el('cost').textContent = `${money(charged)} charged of ${money(job.budgetCents)} cap. ${money(data.pendingAiCents || 0)} AI usage pending reconciliation.${data.computeStatus ? ` Compute: ${data.computeStatus}.` : ''}`;
    el('inspection').textContent = data.visuallyInspected === true ? 'Astra inspected a preview. Review the downloaded model for your intended use.' : 'Visual inspection has not been confirmed.';
    el('cancel').hidden = done; el('new').hidden = !done; el('retry').hidden = done;
    el('artifacts').replaceChildren();
    for (const artifact of data.artifacts || []) {
      const value = typeof artifact === 'string' ? artifact : artifact.name || artifact.url || '';
      const name = value.split('/').pop()?.split('?')[0];
      if (!['model.glb', 'model.blend', 'preview.png', 'turnaround.mp4', 'reference.jpg', 'review.json'].includes(name)) continue;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = name === 'turnaround.mp4' ? 'Download 360° video' : name === 'reference.jpg' ? 'Download design reference' : name === 'review.json' ? 'Download review history' : `Download ${name}`; button.addEventListener('click', () => download(name, button)); el('artifacts').append(button);
    }
    return done;
  }
  async function poll() {
    clearTimeout(timer);
    if (!job || document.hidden) return;
    try {
      const data = await api(`/api/blender/jobs/${encodeURIComponent(job.jobId)}`);
      if (render(data)) { await balance(); return; }
      timer = setTimeout(poll, 4000);
    } catch (err) { error(err); } // Explicit retry after errors; never dispatch again automatically.
  }
  async function start() {
    if (busy || !job) return;
    busy = true; el('retry').disabled = true; el('submit').disabled = true; el('error').textContent = '';
    try {
      await identity();
      try {
        await api('/api/blender/jobs', job);
      } catch (err) {
        let rejected = [400, 413, 422].includes(err.status);
        if (err.status === 409) {
          // An explicit transaction rejection plus a missing job proves no budget was reserved.
          try { await api(`/api/blender/jobs/${encodeURIComponent(job.jobId)}`); }
          catch (lookup) { if (lookup.status === 404) rejected = true; }
        }
        if (rejected) {
          localStorage.removeItem(jobKey); job = null;
          el('brief').disabled = false; el('budget').disabled = false;
          el('submit').disabled = capabilities?.enabled !== true;
          el('job').hidden = true;
        }
        throw err;
      }
      await api(`/api/blender/jobs/${encodeURIComponent(job.jobId)}/start`, {});
      await poll();
    } catch (err) { error(err); if (job) { el('job').hidden = false; el('progress').textContent = 'Request saved. Retry this same job after resolving the error; no new job will be created.'; } }
    finally { busy = false; el('retry').disabled = false; }
  }
  el('form').addEventListener('submit', event => {
    event.preventDefault();
    if (job || busy || capabilities?.enabled !== true) return;
    const brief = el('brief').value.trim(); const amount = el('budget').value.trim();
    if (new TextEncoder().encode(brief).length > 4000) { error(new Error('Shorten the model brief to fit the 4,000-byte limit.')); el('brief').focus(); return; }
    const cents = /^\d+(?:\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : NaN;
    const referenceMode = !el('references').disabled && el('references').checked ? 'generate' : 'none';
    if (referenceMode === 'generate' && cents < 500) { error(new Error('Allow at least $5 for visual references, modeling, and rendering.')); return; }
    if (!brief || !Number.isSafeInteger(cents) || cents < (capabilities.minimumBudgetCents || 100) || cents > (capabilities.maximumBudgetCents || 2000)) { error(new Error('Enter a model brief and a total budget between $1 and $20.')); return; }
    try { job = { jobId: crypto.randomUUID(), requestId: crypto.randomUUID(), brief, budgetCents: cents, referenceMode }; savedJob(); } catch (err) { job = null; error(err); return; }
    el('brief').disabled = true; el('budget').disabled = true; el('references').disabled = true; start();
  });
  el('retry').addEventListener('click', start);
  el('cancel').addEventListener('click', async () => {
    if (!job) return;
    el('cancel').disabled = true;
    try { await identity(); await api(`/api/blender/jobs/${encodeURIComponent(job.jobId)}/cancel`, {}); await poll(); } catch (err) { error(err); } finally { el('cancel').disabled = false; }
  });
  el('new').addEventListener('click', () => { clearTimeout(timer); localStorage.removeItem(jobKey); job = null; el('job').hidden = true; el('brief').disabled = false; el('budget').disabled = false; el('references').disabled = capabilities?.references?.enabled !== true; el('submit').disabled = capabilities?.enabled !== true; });
  el('check').addEventListener('click', check);
  el('connect').addEventListener('click', async () => { try { await identity(); await balance(); } catch (err) { error(err); } });
  let funding = false;
  document.querySelectorAll('[data-fund]').forEach(button => button.addEventListener('click', async () => {
    if (funding) return;
    funding = true;
    try {
      await identity();
      let purchase = JSON.parse(localStorage.getItem(purchaseKey) || 'null');
      if (purchase) {
        const previous = await api(`/api/blender/purchases/${purchase.purchaseId}`);
        if (['credited', 'paid', 'expired', 'cancelled', 'failed', 'reversed'].includes(previous.status)) { purchase = null; localStorage.removeItem(purchaseKey); }
      }
      if (!purchase) { const id = crypto.randomUUID(); purchase = { purchaseId: id, requestId: id, amountCents: Number(button.dataset.fund), paymentRail: 'checkout' }; localStorage.setItem(purchaseKey, JSON.stringify(purchase)); }
      await api('/api/blender/purchases', purchase);
      const checkout = await api(`/api/blender/purchases/${purchase.purchaseId}/checkout`, {});
      const destination = new URL(checkout.paymentUrl, location.origin);
      if (destination.origin !== location.origin || !['https:', 'http:'].includes(destination.protocol)) throw new Error('Checkout returned an unexpected payment URL.');
      el('checkout').href = checkout.paymentUrl; el('checkout').hidden = false;
      el('funding').textContent = `Checkout ready for ${money(purchase.amountCents)} credits. Existing pending purchases are reused.`;
      window.open(checkout.paymentUrl, '_blank', 'noopener');
    } catch (err) { error(err); } finally { funding = false; }
  }));
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); else { balance().catch(error); poll(); } });
  window.addEventListener('focus', () => balance().catch(error));
  try {
    token = localStorage.getItem(tokenKey);
    job = JSON.parse(localStorage.getItem(jobKey) || 'null');
    if (job) { el('references').checked = job.referenceMode === 'generate'; el('brief').value = job.brief; el('budget').value = (job.budgetCents / 100).toFixed(2); el('brief').disabled = true; el('budget').disabled = true; el('job').hidden = false; poll(); }
    if (token) balance().catch(error);
  } catch (err) { error(err); }
  check();
})();
