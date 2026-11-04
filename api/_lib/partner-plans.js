'use strict';

const PARTNER_PLANS = Object.freeze({
  free_trial: Object.freeze({
    id: 'free_trial',
    name: 'الباقة المجانية',
    label: 'مجانية',
    amountMinor: 0,
    amount: 0,
    durationDays: 7,
    durationMonths: 0,
    productLimit: 20,
    storeBranding: false,
    advancedStorefront: false,
    discounts: false,
    prioritySupport24h: false
  }),
  plus: Object.freeze({
    id: 'plus',
    name: 'Plus',
    label: 'Plus',
    amountMinor: 10500,
    amount: 105,
    durationDays: 0,
    durationMonths: 1,
    productLimit: 20,
    storeBranding: false,
    advancedStorefront: false,
    discounts: false,
    prioritySupport24h: false
  }),
  super_plus: Object.freeze({
    id: 'super_plus',
    name: 'Super Plus',
    label: 'Super Plus',
    amountMinor: 22500,
    amount: 225,
    durationDays: 0,
    durationMonths: 3,
    productLimit: 75,
    storeBranding: true,
    advancedStorefront: false,
    discounts: false,
    prioritySupport24h: false
  }),
  premium: Object.freeze({
    id: 'premium',
    name: 'Premium',
    label: 'Premium',
    amountMinor: 55500,
    amount: 555,
    durationDays: 0,
    durationMonths: 6,
    productLimit: 150,
    storeBranding: true,
    advancedStorefront: true,
    discounts: true,
    prioritySupport24h: true
  })
});

function getPartnerPlan(planId) {
  return PARTNER_PLANS[String(planId || '')] || null;
}

module.exports = { PARTNER_PLANS, getPartnerPlan };
