(function (global) {
  'use strict';

  const PRICE_THRESHOLD = 100;
  const TWO_ITEM_DISCOUNT = 10;
  const THREE_PLUS_DISCOUNT = 20;

  function quantityOf(item) {
    return Math.max(1, Number(item?.quantity ?? item?.qty) || 1);
  }

  function baseUnitPrice(item) {
    return Number(item?.price ?? item?.pricePiece) || 0;
  }

  function discountPerPiece(totalQuantity) {
    const quantity = Math.max(0, Number(totalQuantity) || 0);
    if (quantity >= 3) return THREE_PLUS_DISCOUNT;
    if (quantity === 2) return TWO_ITEM_DISCOUNT;
    return 0;
  }

  function isEligible(item) {
    // The offer is for individual pieces; do not apply it to a dozen-priced line.
    const unit = item?.pricingUnit || 'piece';
    return unit !== 'dozen' && baseUnitPrice(item) > PRICE_THRESHOLD;
  }

  function getCartPricing(items) {
    const cart = Array.isArray(items) ? items : [];
    const totalQuantity = cart.reduce((sum, item) => sum + quantityOf(item), 0);
    const lines = cart.map(item => {
      const quantity = quantityOf(item);
      const basePrice = baseUnitPrice(item);
      // A discount is activated only when this line was added with quantity > 1
      // from the product preview. Cart +/- changes do not activate it.
      const previewQuantity = item?.quantityDiscountEnabled ? quantity : 0;
      const discountPerItem = isEligible(item) ? discountPerPiece(previewQuantity) : 0;
      const unitPrice = Math.max(0, basePrice - discountPerItem);
      return {
        item,
        quantity,
        basePrice,
        discountPerPiece: discountPerItem,
        unitPrice,
        total: unitPrice * quantity,
        totalDiscount: discountPerItem * quantity
      };
    });
    return {
      totalQuantity,
      discountPerPiece: lines.reduce((max, line) => Math.max(max, line.discountPerPiece), 0),
      lines,
      subtotal: lines.reduce((sum, line) => sum + line.total, 0),
      totalDiscount: lines.reduce((sum, line) => sum + line.totalDiscount, 0)
    };
  }

  function getItemPricing(item, items) {
    const pricing = getCartPricing(items || [item]);
    return pricing.lines.find(line => line.item === item) || pricing.lines[0];
  }

  global.LovaraPricing = {
    PRICE_THRESHOLD,
    quantityOf,
    baseUnitPrice,
    discountPerPiece,
    isEligible,
    getCartPricing,
    getItemPricing
  };
})(window);
