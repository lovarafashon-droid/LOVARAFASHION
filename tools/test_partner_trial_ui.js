const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

class FakeElement {
  constructor(id, dataset = {}) {
    this.id = id;
    this.dataset = dataset;
    this.disabled = false;
    this.hidden = false;
    this.readOnly = false;
    this.required = false;
    this.value = '';
    this.files = [];
    this.textContent = '';
    this.style = {};
    this.attributes = {};
    this.listeners = {};
    this.classList = {
      add() {},
      remove() {},
      toggle() {}
    };
    this.small = { textContent: '' };
  }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  setAttribute(name, value) { this.attributes[name] = value; }
  querySelector(selector) { return selector === 'small' ? this.small : null; }
}

function createHarness(used) {
  const ids = [
    'storeName', 'supportPhone', 'storeImage', 'notice', 'paymentMethods', 'visaMethod',
    'vodafoneMethod', 'visaPanel', 'vodafonePanel', 'freePanel', 'whatsappLink',
    'paymentArea', 'summaryPrice', 'summaryTerm', 'summaryPerks', 'startVisa',
    'vodafoneInstructions', 'loading', 'activateFreeTrial', 'confirmVisa', 'xpayBox',
    'xpay-payment-element', 'copyNumber'
  ];
  const elements = Object.fromEntries(ids.map(id => [id, new FakeElement(id)]));
  const planButtons = ['free_trial', 'plus', 'super_plus', 'premium'].map(plan =>
    new FakeElement(`plan-${plan}`, { plan })
  );
  let authCallback = null;
  let statusAction = null;
  const context = {
    document: {
      getElementById: id => elements[id] || (elements[id] = new FakeElement(id)),
      querySelector: selector => selector === '[data-plan="free_trial"]' ? planButtons[0] : null,
      querySelectorAll: selector => selector === '[data-plan]' ? planButtons : []
    },
    window: {
      LovaraPartnerPlans: { free_trial: { id: 'free_trial', amount: 0, productLimit: 20, perks: [] } },
      LovaraPartnerOnboarding: { getApplication: async () => null }
    },
    firebase: {
      auth: () => ({
        currentUser: null,
        onAuthStateChanged: callback => { authCallback = callback; }
      })
    },
    fetch: async (_url, options) => {
      statusAction = JSON.parse(options.body).action;
      return { ok: true, json: async () => ({ used }) };
    },
    sessionStorage: { getItem: () => null, removeItem() {} },
    location: { search: '' },
    URLSearchParams,
    navigator: { clipboard: { writeText: async () => {} } },
    console,
    encodeURIComponent,
    setTimeout
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, '../public/js/partnership.js'), 'utf8'),
    context,
    { filename: 'public/js/partnership.js' }
  );
  return {
    elements,
    planButtons,
    authenticate: async () => authCallback({ getIdToken: async () => 'test-id-token' }),
    get statusAction() { return statusAction; }
  };
}

(async () => {
  const eligible = createHarness(false);
  await eligible.authenticate();
  assert.strictEqual(eligible.statusAction, 'trial-status');
  assert.strictEqual(eligible.planButtons[0].disabled, false, 'an eligible account can select its first free trial');

  const used = createHarness(true);
  await used.authenticate();
  assert.strictEqual(used.statusAction, 'trial-status');
  assert.strictEqual(used.planButtons[0].disabled, true, 'an account with a prior trial cannot select it again');
  assert.match(used.planButtons[0].small.textContent, /تم استخدام التجربة/);

  console.log('partner trial UI tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
