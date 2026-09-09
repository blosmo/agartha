const receipt = document.querySelector('#receipt');
const title = document.querySelector('#receipt-title');
const message = document.querySelector('#receipt-message');
const detail = document.querySelector('#receipt-detail');
const progress = document.querySelector('#receipt-progress');
const retry = document.querySelector('#receipt-retry');
const amounts = document.querySelector('#receipt-amounts');
const creditRow = document.querySelector('#receipt-credit-row');
const mode = document.querySelector('#receipt-mode');
const mark = document.querySelector('#receipt-mark');
const parameters = new URLSearchParams(location.search);
const sessionIds = parameters.getAll('session_id');
const sessionId = sessionIds.length === 1 ? sessionIds[0] : '';
const validSessionId = /^cs_(?:test|live)_[A-Za-z0-9]{8,200}$/.test(sessionId);
const states = new Set(['pending', 'payment_received', 'credited', 'adjusted', 'not_completed', 'expired']);
const MAX_CHECKS = 6;
let checks = 0;
let busy = false;
let active = true;
let timer;
const money = cents => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')} USD`;
function show(state, heading, explanation, nextStep = '') {
  receipt.dataset.state = state;
  title.textContent = heading;
  message.textContent = explanation;
  detail.textContent = nextStep;
  mark.textContent = state === 'credited' ? '✓' : state === 'checking' || state === 'pending' || state === 'payment_received' ? '…' : '–';
}
function validReceipt(data) {
  return data && states.has(data.state) && data.currency === 'usd' && typeof data.livemode === 'boolean'
    && Number.isSafeInteger(data.amountCents) && data.amountCents > 0
    && (data.creditedCents === undefined || (Number.isSafeInteger(data.creditedCents) && data.creditedCents >= 0 && data.creditedCents <= data.amountCents))
    && (data.state !== 'credited' || data.creditedCents === data.amountCents);
}
function render(data) {
  mode.hidden = data.livemode;
  amounts.hidden = false;
  document.querySelector('#receipt-amount').textContent = money(data.amountCents);
  creditRow.hidden = data.creditedCents === undefined;
  document.querySelector('#receipt-credits').textContent = data.creditedCents === undefined ? '' : money(data.creditedCents);
  const label = data.livemode ? '' : 'Test: ';
  switch (data.state) {
    case 'credited':
      show('credited', data.livemode ? 'Payment confirmed' : 'Test payment confirmed',
        data.livemode ? 'Your modeling credits have been added to the purchasing agent’s shared balance.' : 'This purchase was recorded in the test balance. It does not add live credits.',
        'Return to your agent to continue. It will check the current available balance before starting compute.');
      break;
    case 'payment_received':
      show(data.state, `${label}Payment received`, 'Stripe confirmed this payment. We’re waiting for the credit record to finish updating.', 'Keep the existing purchase. There is no need to create another payment while credits are processing.');
      break;
    case 'pending':
      show(data.state, `${label}Payment processing`, 'This purchase is still processing. Credits have not been confirmed yet.', 'Your agent can check the same purchase while processing finishes.');
      break;
    case 'adjusted':
      show(data.state, `${label}Payment updated`, 'A refund or payment review affects this purchase.', 'Ask your agent to check the current balance before continuing.');
      break;
    case 'not_completed':
      show(data.state, `${label}Checkout is not complete`, 'This Checkout session has not confirmed a payment.', 'Return to your agent to continue the existing purchase.');
      break;
    case 'expired':
      show(data.state, `${label}Checkout expired`, 'This Checkout session expired without a confirmed payment.', 'Ask your agent to check the purchase before creating a replacement.');
      break;
  }
}
async function checkStatus() {
  if (busy || !active || !validSessionId) return;
  clearTimeout(timer);
  busy = true;
  checks += 1;
  retry.hidden = false;
  retry.disabled = true;
  progress.textContent = 'Checking the latest receipt status…';
  let pending = false;
  try {
    const response = await fetch(`/api/blender/checkout-status?session_id=${encodeURIComponent(sessionId)}`, {cache:'no-store', credentials:'omit', referrerPolicy:'no-referrer', signal:AbortSignal.timeout(35000)});
    if (!response.ok) throw new Error('Receipt unavailable');
    const data = await response.json();
    if (!validReceipt(data)) throw new Error('Invalid receipt');
    if (!active) return;
    render(data);
    pending = data.state === 'pending' || data.state === 'payment_received';
    progress.textContent = pending
      ? checks < MAX_CHECKS ? 'We’ll check again automatically in a moment.' : 'Still processing. Check again later or ask your agent to check this same purchase.'
      : 'Status checked with the payment service.';
  } catch {
    if (!active) return;
    amounts.hidden = true;
    creditRow.hidden = true;
    mode.hidden = true;
    show('unavailable', 'We couldn’t confirm the payment yet', 'The receipt check did not complete.', 'Check again or ask your agent to check the same purchase before paying again.');
    progress.textContent = '';
  } finally {
    busy = false;
    retry.disabled = false;
    if (active && pending && checks < MAX_CHECKS) timer = setTimeout(checkStatus, 2500);
  }
}
retry.addEventListener('click', () => {
  if (busy) return;
  checks = 0;
  checkStatus();
});
window.addEventListener('pagehide', () => { active = false; clearTimeout(timer); });
window.addEventListener('pageshow', event => {
  if (event.persisted) { active = true; checks = 0; checkStatus(); }
});
if (validSessionId) {
  checkStatus();
} else if (sessionIds.length) {
  show('invalid', 'This receipt link is incomplete', 'Open the full confirmation link from Checkout.', 'Your agent can also check the purchase it already created.');
} else if (parameters.get('canceled') === '1' || parameters.get('blenderPayment') === 'canceled') {
  show('closed', 'Checkout closed', 'You returned from Checkout. This link does not confirm whether a payment completed.', 'Ask your agent to check the existing purchase before trying again.');
} else if (parameters.has('legacy') || parameters.has('blenderPayment')) {
  show('unverified', 'Let’s confirm your payment', 'This older return link does not include a receipt.', 'Ask your agent to check the purchase it already created, or open its direct confirmation link.');
} else {
  show('missing', 'No payment receipt to check', 'Open the confirmation link from Checkout.', 'Your agent can confirm the existing purchase and current balance.');
}
