const SELLER_STATUSES = Object.freeze(['new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled']);

const SELLER_TRANSITIONS = Object.freeze({
  new: Object.freeze(['confirmed', 'cancelled']),
  confirmed: Object.freeze(['preparing', 'shipped', 'cancelled']),
  preparing: Object.freeze(['shipped', 'cancelled']),
  shipped: Object.freeze(['delivered']),
  delivered: Object.freeze([]),
  cancelled: Object.freeze([])
});

const PAID_STATUSES = new Set(['paid', 'succeeded', 'success', 'completed', 'approved']);

function normalizeSellerStatus(value) {
  const status = String(value ?? '').trim().toLowerCase();
  return SELLER_STATUSES.includes(status) ? status : '';
}

function canTransitionSellerStatus(currentValue, nextValue) {
  const current = normalizeSellerStatus(currentValue);
  const next = normalizeSellerStatus(nextValue);
  return Boolean(current && next && SELLER_TRANSITIONS[current].includes(next));
}

function isPaidPayment(payment = {}) {
  return payment.paid === true || PAID_STATUSES.has(String(payment.status || '').trim().toLowerCase());
}

function normalizeCancellationReason(value) {
  if (typeof value !== 'string') return '';
  const reason = value.trim();
  return reason.length >= 5 && reason.length <= 300 ? reason : '';
}

module.exports = {
  SELLER_STATUSES,
  SELLER_TRANSITIONS,
  normalizeSellerStatus,
  canTransitionSellerStatus,
  isPaidPayment,
  normalizeCancellationReason
};
