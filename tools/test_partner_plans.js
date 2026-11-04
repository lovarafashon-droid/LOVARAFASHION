const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const { PARTNER_PLANS } = require('../api/_lib/partner-plans');

const context = {};
vm.createContext(context);
vm.runInContext(fs.readFileSync(require.resolve('../public/js/partner-plans.js'), 'utf8'), context);
const browserPlans = context.LovaraPartnerPlans;

for (const id of Object.keys(PARTNER_PLANS)) {
  const server = PARTNER_PLANS[id];
  const browser = browserPlans[id];
  assert(browser, `browser plan ${id} exists`);
  assert.strictEqual(browser.amount, server.amount, `${id} amount matches`);
  assert.strictEqual(browser.durationDays, server.durationDays, `${id} days match`);
  assert.strictEqual(browser.durationMonths, server.durationMonths, `${id} months match`);
}
assert.strictEqual(PARTNER_PLANS.free_trial.durationDays, 7);
assert.strictEqual(PARTNER_PLANS.plus.amount, 105);
assert.strictEqual(PARTNER_PLANS.super_plus.amount, 225);
assert.strictEqual(PARTNER_PLANS.premium.amount, 555);
assert.deepStrictEqual([PARTNER_PLANS.plus.productLimit, PARTNER_PLANS.super_plus.productLimit, PARTNER_PLANS.premium.productLimit], [20, 75, 150]);
assert.strictEqual(PARTNER_PLANS.super_plus.storeBranding, true);
assert.strictEqual(PARTNER_PLANS.premium.advancedStorefront, true);
assert.strictEqual(PARTNER_PLANS.premium.discounts, true);
assert.strictEqual(PARTNER_PLANS.premium.prioritySupport24h, true);
assert.strictEqual(browserPlans.plus.productLimit, 20);
assert.strictEqual(browserPlans.super_plus.productLimit, 75);
assert.strictEqual(browserPlans.premium.productLimit, 150);
console.log('partner plan catalog tests passed');
