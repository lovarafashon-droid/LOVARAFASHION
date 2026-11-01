const fs = require('fs');
const vm = require('vm');
const context = { window: {}, console };
vm.runInNewContext(fs.readFileSync('public/js/pricing.js', 'utf8'), context);
const pricing = context.window.LovaraPricing;
function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}
let result = pricing.getCartPricing([{ price: 200, quantity: 2 }]);
assertEqual(result.lines[0].unitPrice, 190, 'eligible quantity discount is applied without a client flag');
result = pricing.getCartPricing([{ price: 500, quantity: 1, qty: 2, quantityDiscountEnabled: true }]);
assertEqual(result.lines[0].quantity, 1, 'visible checkout quantity wins over stale qty');
assertEqual(result.lines[0].total, 500, 'one visible piece is charged once even if the client flag is true');
result = pricing.getCartPricing([{ price: 200, quantity: 2, quantityDiscountEnabled: false }]);
assertEqual(result.lines[0].unitPrice, 190, 'a forged false client flag cannot suppress the canonical discount');
result = pricing.getCartPricing([
  { price: 200, quantity: 2, quantityDiscountEnabled: false },
  { price: 150, quantity: 1, quantityDiscountEnabled: true }
]);
assertEqual(result.lines[0].unitPrice, 190, 'quantity pricing is derived independently for each line');
assertEqual(result.lines[1].unitPrice, 150, 'a single item receives no quantity discount');
result = pricing.getCartPricing([{ price: 200, quantity: 3 }, { price: 99, quantity: 3 }]);
assertEqual(result.lines[0].unitPrice, 180, 'three eligible pieces receive the 20 EGP discount');
assertEqual(result.lines[1].unitPrice, 99, 'under-100 item is not eligible');
result = pricing.getCartPricing([{ price: 100, quantity: 3 }]);
assertEqual(result.lines[0].unitPrice, 100, 'exactly-100 item is not eligible');
result = pricing.getCartPricing([{ price: 300, quantity: 3, pricingUnit: 'dozen' }]);
assertEqual(result.lines[0].unitPrice, 300, 'dozen line is not discounted');
result = pricing.getCartPricing([{ price: 200, quantity: 2, storeId: 'shop-a' }]);
assertEqual(result.lines[0].unitPrice, 200, 'partner products do not receive LOVARA quantity discounts');
console.log('quantity discount tests passed');
