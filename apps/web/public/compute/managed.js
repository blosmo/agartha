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
  let token, job, capabilities, busy = false, timer, referenceTouched = false;
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
      if (!job && !referenceTouched) el('references').checked = capabilities?.defaultReferenceMode === 'generate';
      const meshAvailable = capabilities?.meshy?.enabled === true;
      el('meshy-option').hidden = !meshAvailable;
      el('meshy').disabled = Boolean(job) || !meshAvailable;
      ['meshy-budget', 'meshy-assets', 'meshy-rigging'].forEach(id => { el(id).disabled = Boolean(job) || !meshAvailable; });
      el('meshy-settings').hidden = !meshAvailable || !el('meshy').checked;
      referenceHelp(); meshHelp();
      el('availability').textContent = capabilities?.enabled === true ? 'Ready to create.' : 'Creation is unavailable. Select Use your agent to continue.';
      el('submit').disabled = capabilities?.enabled !== true || Boolean(job) || busy;
      document.querySelectorAll('[data-fund]').forEach(button => { button.disabled = pricing.purchasesEnabled !== true || pricing.paymentMode !== 'live'; });
    } catch (err) { capabilities = null; el('submit').disabled = true; el('availability').textContent = 'Unable to check availability. Select Refresh availability to retry.'; error(err); }
  }
  function referenceHelp() {
    el('budget-help').textContent = capabilities?.references?.enabled === true && el('references').checked ? '$5–$20 for references, Astra and Blender. Pay for usage; keep unused credits.' : '$1–$20 for Astra and Blender. Pay for usage; keep unused credits.';
  }
  function meshHelp() {
    const max = capabilities?.meshy?.maximumAllowanceCents || 1000;
    const minimum = capabilities?.meshy?.generationCents || 1;
    el('meshy-help').textContent = `Meshy 7, 2K textures and PBR maps are included. Allow at least ${money(minimum)} for one generation. This is a ceiling inside the existing total budget, not an additional charge (up to ${money(max)}).`;
  }
  el('references').addEventListener('change', () => { referenceTouched = true; referenceHelp(); });
  el('meshy').addEventListener('change', () => { el('meshy-settings').hidden = !el('meshy').checked; meshHelp(); });
  function savedJob() { localStorage.setItem(jobKey, JSON.stringify(job)); }
  const quality = document.createElement('div');
  quality.hidden = true; quality.setAttribute('aria-live', 'polite');
  el('inspection').after(quality);
  async function showReview(button) {
    const jobId = job?.jobId;
    button.disabled = true;
    try {
      const report = await api(`/api/blender/jobs/${encodeURIComponent(jobId)}/artifacts/review.json`);
      if (job?.jobId !== jobId) return;
      quality.replaceChildren(); quality.hidden = false;
      const line = text => { const p = document.createElement('p'); p.textContent = text; quality.append(p); };
      if (report.protocol === 3) {
        const reviews = Array.isArray(report.reviews) ? report.reviews : [];
        const reviewed = reviews.filter(review => review?.status === 'reviewed' && review.verdict && typeof review.verdict === 'object');
        const accepted = reviewed.find(review => review.candidateRevision === report.acceptedRevision && review.verdict.accepted === true);
        line(accepted ? 'An accepted exported GLB passed independent review.' : 'No independently accepted exported GLB is recorded.');
        const latest = reviewed.at(-1);
        if (latest) {
          line(`Reviewed exported candidate ${latest.candidateRevision}: ${latest.verdict.accepted === true ? 'accepted' : 'changes required'}.`);
          if (latest.verdict.accepted === true) {
            for (const [criterion, result] of Object.entries(latest.verdict.criteria || {})) if (result?.pass === true && typeof result.evidence === 'string') line(`${criterion}: ${result.evidence}`);
          } else {
            for (const defect of latest.verdict.defects || []) if (typeof defect?.description === 'string') line(`${defect.severity || 'defect'} · ${defect.criterion || 'review'}: ${defect.description}`);
          }
        } else if (reviews.length) line('The latest exported candidate review did not produce a usable verdict.');
        line('This review covers the export-bound GLB rendered in an isolated neutral scene. Inspect the downloaded GLB in your intended viewer.');
      } else {
        const reviews = Array.isArray(report.quality?.reviews) ? report.quality.reviews : [];
        const accepted = reviews.find(review => review.candidateRevision === report.acceptedRevision);
        line(accepted?.verdict === 'ready' ? 'An accepted checkpoint passed independent review of its Blender views.' : 'No independently accepted checkpoint is recorded.');
        const latest = reviews.at(-1);
        if (latest) {
          line(`Reviewed candidate ${latest.candidateRevision}: ${latest.score}/10. ${latest.summary}`);
          for (const correction of latest.corrections || []) line(`${correction.evidence} Next: ${correction.change}`);
        }
        if (report.quality?.stopReason) line(report.quality.stopReason);
        line('This review covers Blender renders. Inspect the downloaded GLB in your intended viewer.');
      }
    } catch (err) { if (job?.jobId === jobId) error(err); } finally { button.disabled = false; }
  }
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
    if (data.referenceMode === 'generate' || data.referenceMode === 'none') el('references').checked = data.referenceMode === 'generate';
    el('job').hidden = false;
    el('progress').textContent = `${data.status || 'Request saved'}${typeof data.progress === 'string' ? ` — ${data.progress}` : ''}${done && typeof data.reason === 'string' && data.reason !== data.progress ? ` — ${data.reason}` : ''}`;
    const chargedAi = data.chargedAiCents || 0;
    const charged = chargedAi + (data.computeChargedCents || 0);
    const meshyCharged = data.chargedMeshyCents || 0;
    const meshComponent = meshyCharged ? ` Meshy component: ${money(meshyCharged)} (included in AI usage).` : '';
    el('cost').textContent = `${money(charged)} charged of ${money(job.budgetCents)} cap.${meshComponent} ${money(data.pendingAiCents || 0)} AI usage pending reconciliation.${data.computeStatus ? ` Compute: ${data.computeStatus}.` : ''}`;
    el('inspection').textContent = data.visuallyInspected === true
      ? data.workflowVersion === 3 ? 'Independent visual review accepted this checkpoint. Review the downloaded model for your intended use.' : 'Astra inspected a preview. Review the downloaded model for your intended use.'
      : data.workflowVersion === 3 ? 'Independent visual acceptance has not been confirmed.' : 'Visual inspection has not been confirmed.';
    el('cancel').hidden = done; el('new').hidden = !done; el('retry').hidden = done;
    el('artifacts').replaceChildren();
    for (const artifact of data.artifacts || []) {
      const value = typeof artifact === 'string' ? artifact : artifact.name || artifact.url || '';
      const name = value.split('/').pop()?.split('?')[0];
      if (!['model.glb', 'model.blend', 'preview.png', 'turnaround.mp4', 'reference.jpg', 'review.json'].includes(name) && !/^generated-(?:image-to-3d|rigging)-[a-f0-9]{64}\.glb$/.test(name)) continue;
      if (name === 'review.json') {
        const review = document.createElement('button'); review.type = 'button'; review.textContent = 'View quality review';
        review.addEventListener('click', () => showReview(review)); el('artifacts').append(review);
      }
      const button = document.createElement('button'); button.type = 'button'; button.textContent = name === 'turnaround.mp4' ? 'Download 360° video' : name === 'reference.jpg' ? 'Download design reference' : name === 'review.json' ? 'Download review history' : /^generated-rigging-/.test(name) ? 'Download rigged component' : /^generated-image-to-3d-/.test(name) ? 'Download generated component' : `Download ${name}`; button.addEventListener('click', () => download(name, button)); el('artifacts').append(button);
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
    const referenceMode = !el('references').disabled && el('references').checked ? (capabilities?.defaultReferenceMode === 'generate' ? undefined : 'generate') : 'none';
    let meshyAllowance;
    if (el('meshy').checked && capabilities?.meshy?.enabled === true) {
      const amount = el('meshy-budget').value.trim();
      const meshCents = /^\d+(?:\.\d{1,2})?$/.test(amount) ? Math.round(Number(amount) * 100) : NaN;
      const computeReserve = capabilities?.workflowVersion === 3 && cents >= 500 || referenceMode === 'generate' ? 165 : 65;
      const minimumAllowance = capabilities.meshy.generationCents || 1;
      const maxAllowance = Math.min(capabilities.meshy.maximumAllowanceCents || 1000, cents - computeReserve - 100);
      if (!Number.isSafeInteger(meshCents) || meshCents < minimumAllowance || meshCents > maxAllowance) { error(new Error(`Enter a Meshy allowance between ${money(minimumAllowance)} and ${money(Math.max(0, maxAllowance))}.`)); return; }
      if (cents - meshCents < 100) { error(new Error('Leave at least $1 of the total budget for Astra, Blender and review.')); return; }
      meshyAllowance = { budgetCents: meshCents, maxAssets: Number(el('meshy-assets').value), allowRigging: el('meshy-rigging').checked };
    }
    if (referenceMode === 'generate' && cents < 500) { error(new Error('Allow at least $5 for visual references, modeling, and rendering.')); return; }
    if (!brief || !Number.isSafeInteger(cents) || cents < (capabilities.minimumBudgetCents || 100) || cents > (capabilities.maximumBudgetCents || 2000)) { error(new Error('Enter a model brief and a total budget between $1 and $20.')); return; }
    try { job = { jobId: crypto.randomUUID(), requestId: crypto.randomUUID(), brief, budgetCents: cents, ...(referenceMode === undefined ? {} : { referenceMode }), ...(meshyAllowance ? { meshyAllowance } : {}) }; savedJob(); } catch (err) { job = null; error(err); return; }
    el('brief').disabled = true; el('budget').disabled = true; el('references').disabled = true; el('meshy').disabled = true; ['meshy-budget', 'meshy-assets', 'meshy-rigging'].forEach(id => { el(id).disabled = true; }); start();
  });
  el('retry').addEventListener('click', start);
  el('cancel').addEventListener('click', async () => {
    if (!job) return;
    el('cancel').disabled = true;
    try { await identity(); await api(`/api/blender/jobs/${encodeURIComponent(job.jobId)}/cancel`, {}); await poll(); } catch (err) { error(err); } finally { el('cancel').disabled = false; }
  });
  el('new').addEventListener('click', () => { clearTimeout(timer); localStorage.removeItem(jobKey); job = null; referenceTouched = false; el('references').checked = capabilities?.defaultReferenceMode === 'generate'; el('meshy').checked = false; el('meshy-settings').hidden = true; quality.hidden = true; quality.replaceChildren(); el('job').hidden = true; el('brief').disabled = false; el('budget').disabled = false; el('references').disabled = capabilities?.references?.enabled !== true; el('meshy').disabled = capabilities?.meshy?.enabled !== true; ['meshy-budget', 'meshy-assets', 'meshy-rigging'].forEach(id => { el(id).disabled = capabilities?.meshy?.enabled !== true; }); el('submit').disabled = capabilities?.enabled !== true; });
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
    if (job) { el('references').checked = job.referenceMode === 'generate' || job.referenceMode === undefined && job.budgetCents >= 500; if (job.meshyAllowance) { el('meshy').checked = true; el('meshy-budget').value = (job.meshyAllowance.budgetCents / 100).toFixed(2); el('meshy-assets').value = String(job.meshyAllowance.maxAssets); el('meshy-rigging').checked = job.meshyAllowance.allowRigging === true; el('meshy-settings').hidden = false; } el('brief').value = job.brief; el('budget').value = (job.budgetCents / 100).toFixed(2); el('brief').disabled = true; el('budget').disabled = true; el('job').hidden = false; poll(); }
    if (token) balance().catch(error);
  } catch (err) { error(err); }
  meshHelp();
  check();
})();
