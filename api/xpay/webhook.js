const crypto = require('crypto');
const { admin } = require('../_lib/firestore');
const { hasPartnerItems, buildPartnerOrderRecords } = require('../_lib/partner-orders');

async function notifyNewOrder(orderNumber) {
  const siteUrl = String(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
  if (!siteUrl) return;
  try {
    await fetch(`${siteUrl}/api/notifications/new-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber })
    });
  } catch (error) {
    console.error('[XPay webhook] New-order notification failed:', error.message);
  }
}

function isValidSignature(req) {
  const secret = process.env.XPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const provided = req.headers['x-xpay-signature'] || req.headers['x-webhook-signature'] || '';
  const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
  const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function safeEventKey(event, orderNumber, status, transactionId) {
  const stableId = event.id || event.event_id || event.eventId || event.data?.id;
  const value = stableId ? String(stableId) : `${orderNumber}:${status}:${transactionId || ''}`;
  return crypto.createHash('sha256').update(value).digest('hex');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isValidSignature(req)) return res.status(401).json({ error: 'Invalid webhook signature.' });

  const event = req.body || {};
  const status = String(event.status || event.payment_status || event.data?.status || '').toLowerCase();
  const orderNumber = String(event.orderNumber || event.reference || event.metadata?.orderNumber || event.data?.metadata?.orderNumber || '').trim();
  if (!/^LOV-[A-Z0-9]{5,40}$/.test(orderNumber)) return res.status(400).json({ error: 'Missing or invalid order reference.' });

  const paid = ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(status);
  const failed = ['failed', 'cancelled', 'canceled', 'declined', 'expired'].includes(status);
  if (!paid && !failed) return res.status(200).json({ received: true, ignored: true });
  const transactionId = String(event.transaction_id || event.transactionId || event.data?.transaction_id || event.data?.transactionId || event.id || '');
  const eventKey = safeEventKey(event, orderNumber, status, transactionId);

  try {
    const adminApp = admin();
    const db = adminApp.firestore();
    const pendingRef = db.collection('pendingOrders').doc(orderNumber);
    const orderRef = db.collection('orders').doc(orderNumber);
    const eventRef = db.collection('xpayWebhookEvents').doc(eventKey);
    const pendingSnapshot = await pendingRef.get();
    const orderSnapshot = await orderRef.get();
    if (!pendingSnapshot.exists && !orderSnapshot.exists) return res.status(404).json({ error: 'Order not found.' });
    const initialData = pendingSnapshot.exists ? pendingSnapshot.data() : orderSnapshot.data();
    if (String(initialData.payment?.method || '').toLowerCase() !== 'visa') {
      return res.status(409).json({ error: 'Payment method does not match this checkout.' });
    }
    const expectedAmount = Number(initialData.payment?.expectedAmountMinor);
    const eventAmount = Number(event.amount ?? event.amount_total ?? event.data?.amount ?? event.data?.amount_total);
    if (paid && Number.isFinite(expectedAmount) && expectedAmount > 0 && Number.isFinite(eventAmount) && eventAmount > 0) {
      // Providers may express amount in minor units, or in major units for legacy payloads.
      const matchesMinor = Math.round(eventAmount) === expectedAmount;
      const matchesMajor = Math.abs(eventAmount * 100 - expectedAmount) <= 1;
      if (!matchesMinor && !matchesMajor) return res.status(409).json({ error: 'Payment amount does not match this order.' });
    }

    let transitionedToPaid = false;
    await db.runTransaction(async transaction => {
      transitionedToPaid = false;
      const [eventSnapshot, pending, existingOrder] = await Promise.all([
        transaction.get(eventRef),
        transaction.get(pendingRef),
        transaction.get(orderRef)
      ]);
      if (eventSnapshot.exists) return;
      const baseSnapshot = pending.exists ? pending : existingOrder;
      if (!baseSnapshot.exists) throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
      const baseData = baseSnapshot.data() || {};
      if (String(baseData.payment?.method || '').toLowerCase() !== 'visa') {
        throw Object.assign(new Error('Payment method does not match this checkout.'), { statusCode: 409 });
      }
      const previousStatus = String(baseData.payment?.status || '').toLowerCase();
      const alreadyPaid = previousStatus === 'paid' || previousStatus === 'succeeded' || previousStatus === 'completed';
      const timestamp = adminApp.firestore.FieldValue.serverTimestamp();
      if (alreadyPaid) {
        transaction.create(eventRef, { orderNumber, status, transactionId, processedAt: timestamp });
        return; // A later failed/cancelled event can never downgrade paid.
      }

      const nextPayment = {
        ...(baseData.payment || {}),
        status: paid ? 'paid' : 'failed',
        providerStatus: status,
        paid,
        ...(transactionId ? { transactionId } : {}),
        updatedAt: timestamp
      };
      if (paid) nextPayment.paidAt = timestamp;
      if (paid) {
        const finalOrder = {
          ...baseData,
          orderNumber,
          status: baseData.status || 'pending',
          confirmationStatus: baseData.confirmationStatus || 'pending',
          payment: nextPayment,
          updatedAt: timestamp
        };
        const partnerOrders = hasPartnerItems(finalOrder) ? buildPartnerOrderRecords(finalOrder, orderRef.id, db) : [];
        // Read all child orders before any writes to comply with Firestore transactions.
        const children = await Promise.all(partnerOrders.map(record => transaction.get(record.ref)));
        transaction.create(eventRef, { orderNumber, status, transactionId, processedAt: timestamp });
        transaction.set(orderRef, finalOrder, { merge: true });
        partnerOrders.forEach((record, index) => {
          const data = { ...record.data };
          if (children[index].exists) {
            const oldData = children[index].data() || {};
            if (oldData.sellerStatus) data.sellerStatus = oldData.sellerStatus;
            if (oldData.createdAt) delete data.createdAt;
          }
          transaction.set(record.ref, data, { merge: true });
        });
        if (pending.exists) transaction.delete(pendingRef);
        transitionedToPaid = true;
      } else if (pending.exists) {
        transaction.create(eventRef, { orderNumber, status, transactionId, processedAt: timestamp });
        transaction.set(pendingRef, { payment: nextPayment, updatedAt: timestamp }, { merge: true });
      } else {
        transaction.create(eventRef, { orderNumber, status, transactionId, processedAt: timestamp });
        transaction.set(orderRef, { payment: nextPayment, updatedAt: timestamp }, { merge: true });
      }
    });

    if (transitionedToPaid) await notifyNewOrder(orderNumber);
    console.log(JSON.stringify({ source: 'xpay', orderNumber, status, paid: transitionedToPaid, transactionId }));
    return res.status(200).json({ received: true, orderNumber, paid: transitionedToPaid });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('[XPay webhook]', error);
    return res.status(500).json({ error: 'Could not update the order.' });
  }
};
