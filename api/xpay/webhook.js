const crypto = require('crypto');
const { admin } = require('../_lib/firestore');
const { hasPartnerItems, buildPartnerOrderRecords } = require('../_lib/partner-orders');
const { getPartnerPlan } = require('../_lib/partner-plans');

const SIGNATURE_TOLERANCE_SECONDS = 300;

async function notifyNewOrder(orderNumber) {
  const siteUrl = String(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
  if (!siteUrl) return;
  try {
    await fetch(`${siteUrl}/api/notifications/new-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-LOVARA-Internal-Key': String(process.env.XPAY_WEBHOOK_SECRET || '') },
      body: JSON.stringify({ orderNumber })
    });
  } catch (error) {
    console.error('[XPay webhook] New-order notification failed:', error.message);
  }
}

async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody;
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody);
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body);
  if (req.body && typeof req.body === 'object') return Buffer.from(JSON.stringify(req.body));
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function timingSafeHexEqual(provided, expected) {
  if (!/^[a-f0-9]{64}$/i.test(provided || '')) return false;
  const providedBuffer = Buffer.from(provided, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function isValidSignature(req, rawBody) {
  const secret = process.env.XPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = String(req.headers['x-xpay-signature'] || req.headers['xpay-signature'] || '').trim();
  const timestamp = header.match(/(?:^|[,;\s])t=(\d+)/)?.[1];
  const signatures = [...header.matchAll(/(?:^|[,;\s])v1=([a-f0-9]{64})/ig)].map(match => match[1]);
  if (!timestamp || !signatures.length) return false;
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || Math.abs(Date.now() / 1000 - timestampNumber) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');
  return signatures.some(signature => timingSafeHexEqual(signature, expected));
}

function eventObject(event) {
  return event?.data?.object && typeof event.data.object === 'object' ? event.data.object
    : (event?.data && typeof event.data === 'object' ? event.data : event || {});
}

function normalizeStatus(event, object) {
  const eventType = String(event?.type || '').toLowerCase();
  const rawStatus = String(object?.paymentStatus || object?.status || event?.status || event?.payment_status || event?.data?.status || '').toLowerCase();
  if (eventType.endsWith('.async_payment_succeeded')) return 'paid';
  if (eventType.endsWith('.async_payment_failed')) return 'failed';
  if (eventType.endsWith('.expired')) return 'expired';
  if (eventType.endsWith('.completed') && (!rawStatus || ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(rawStatus))) return 'paid';
  return rawStatus;
}

function eventAmounts(event, object) {
  const minorValues = [object?.amountTotal, object?.amount_total_minor, event?.amountTotal, event?.total_amount_piasters, event?.data?.amountTotal];
  for (const value of minorValues) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return { minor: amount, major: null };
  }
  const majorValues = [object?.amount, object?.total_amount, event?.amount, event?.amount_total, event?.total_amount, event?.data?.amount, event?.data?.amount_total];
  for (const value of majorValues) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) return { minor: null, major: amount };
  }
  return { minor: null, major: null };
}

function amountMatches(expectedMinor, amounts) {
  if (amounts.minor !== null) return Math.round(amounts.minor) === expectedMinor;
  if (amounts.major !== null) return Math.round(amounts.major) === expectedMinor || Math.abs(amounts.major * 100 - expectedMinor) <= 1;
  return false;
}

function safeEventKey(event, orderNumber, status, transactionId) {
  const stableId = event.id || event.event_id || event.eventId || event.data?.id;
  const value = stableId ? String(stableId) : `${orderNumber}:${status}:${transactionId || ''}`;
  return crypto.createHash('sha256').update(value).digest('hex');
}

function addCalendarMonths(date, months) {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function partnerShopId(storeName, uid) {
  const base = String(storeName || '').toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'shop';
  const suffix = String(uid || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 28) || 'store';
  return `${base}-${suffix}`.slice(0, 60);
}

async function handleStoreSubscriptionEvent(event, res, status, paymentId) {
  const paid = ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(status);
  const failed = ['failed', 'cancelled', 'canceled', 'declined', 'expired'].includes(status);
  if (!paid && !failed) return res.status(200).json({ received: true, ignored: true });
  if (!/^SUB-[A-F0-9]{24}$/.test(paymentId)) return res.status(400).json({ error: 'Invalid subscription payment reference.' });

  const transactionId = String(event.transaction_id || event.transactionId || event.data?.transaction_id || event.data?.transactionId || event.id || '');
  const eventKey = safeEventKey(event, paymentId, status, transactionId);
  try {
    const app = admin();
    const db = app.firestore();
    const paymentRef = db.collection('pendingStoreSubscriptions').doc(paymentId);
    const eventRef = db.collection('xpayWebhookEvents').doc(eventKey);
    const initialPayment = await paymentRef.get();
    if (!initialPayment.exists) return res.status(404).json({ error: 'Subscription payment not found.' });
    const initialData = initialPayment.data() || {};
    const expectedAmount = Number(initialData.amountMinor);
    const paymentSession = eventObject(event);
    const amounts = eventAmounts(event, paymentSession);
    const currency = String(paymentSession.currency || event.currency || event.data?.currency || '').toUpperCase();
    const plan = getPartnerPlan(initialData.planId);
    if (paid) {
      const expectedByPlan = plan?.amountMinor;
      if (!plan || !Number.isFinite(expectedAmount) || expectedAmount <= 0 || expectedByPlan !== expectedAmount || !amountMatches(expectedAmount, amounts)) {
        return res.status(409).json({ error: 'Paid subscription event is missing a verifiable amount.' });
      }
      if (currency !== 'EGP') return res.status(409).json({ error: 'Subscription payment currency does not match EGP.' });
      if (String(initialData.currency || '').toUpperCase() !== 'EGP') return res.status(409).json({ error: 'Subscription payment record currency does not match EGP.' });
    }

    let transitionedToPaid = false;
    await db.runTransaction(async transaction => {
      transitionedToPaid = false;
      const eventSnapshot = await transaction.get(eventRef);
      const paymentSnapshot = await transaction.get(paymentRef);
      if (!paymentSnapshot.exists) throw Object.assign(new Error('Subscription payment not found.'), { statusCode: 404 });
      const payment = paymentSnapshot.data() || {};
      const paymentPlan = getPartnerPlan(payment.planId);
      const validAmount = !!paymentPlan && Number(payment.amountMinor) > 0 && paymentPlan.amountMinor === Number(payment.amountMinor);
      if (payment.type !== 'store_subscription' || payment.paymentId !== paymentId || !validAmount) {
        throw Object.assign(new Error('Subscription payment record is invalid.'), { statusCode: 409 });
      }
      const requestUid = String(payment.requestUid || '');
      const shopId = String(payment.shopId || '');
      if (!requestUid && !shopId) throw Object.assign(new Error('Payment is not linked to a store request or shop.'), { statusCode: 409 });
      const targetRef = requestUid ? db.collection('storeRequests').doc(requestUid) : db.collection('shops').doc(shopId);
      const targetSnapshot = await transaction.get(targetRef);
      if (!targetSnapshot.exists) throw Object.assign(new Error(requestUid ? 'Store request not found.' : 'Store not found.'), { statusCode: 404 });
      const target = targetSnapshot.data() || {};
      if (target.ownerUid !== payment.ownerUid) throw Object.assign(new Error('Store owner does not match payment.'), { statusCode: 403 });
      if (requestUid && (!['pending', 'approved'].includes(target.status) || (target.paymentId && target.paymentId !== paymentId))) {
        throw Object.assign(new Error('Store request is no longer awaiting this payment.'), { statusCode: 409 });
      }
      const requestedShopId = target.status === 'approved' ? String(target.shopId || '') : '';
      const resolvedShopId = requestUid
        ? (/^[a-z0-9-]{1,60}$/i.test(requestedShopId) ? requestedShopId : partnerShopId(target.storeName, requestUid))
        : shopId;
      const shopRef = requestUid ? db.collection('shops').doc(resolvedShopId) : targetRef;
      const shopSnapshot = requestUid ? await transaction.get(shopRef) : targetSnapshot;
      const shop = shopSnapshot.exists ? shopSnapshot.data() || {} : {};
      if (shopSnapshot.exists && shop.ownerUid !== payment.ownerUid) {
        throw Object.assign(new Error('Store owner does not match payment.'), { statusCode: 403 });
      }
      const oldStatus = String(payment.status || '').toLowerCase();
      const alreadyPaid = payment.paid === true || ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(oldStatus);
      const recoverPaidRequest = paid && alreadyPaid && requestUid && target.status === 'pending'
        && target.paymentId === paymentId;
      const timestamp = app.firestore.FieldValue.serverTimestamp();
      if (alreadyPaid && !recoverPaidRequest) {
        if (!eventSnapshot.exists) transaction.create(eventRef, { paymentId, status, transactionId, processedAt: timestamp });
        return;
      }
      if (!paid) {
        if (!eventSnapshot.exists) transaction.create(eventRef, { paymentId, status, transactionId, processedAt: timestamp });
        transaction.set(paymentRef, { status: 'failed', providerStatus: status, paid: false, ...(transactionId ? { transactionId } : {}), updatedAt: timestamp }, { merge: true });
        if (requestUid && target.paymentId === paymentId) {
          transaction.set(targetRef, { paymentStatus: 'failed', paymentProviderStatus: status, updatedAt: timestamp }, { merge: true });
        }
        return;
      }

      if (!eventSnapshot.exists) transaction.create(eventRef, { paymentId, status, transactionId, processedAt: timestamp });
      const now = new Date();
      const oldExpiry = shop.expiresAt?.toDate ? shop.expiresAt.toDate() : new Date(shop.expiresAt || 0);
      const start = shopSnapshot.exists && Number.isFinite(oldExpiry.getTime()) && oldExpiry > now ? oldExpiry : now;
      const durationMonths = Number(paymentPlan.durationMonths || 0);
      const durationDays = Number(paymentPlan.durationDays || 0);
      const newExpiry = durationMonths > 0 ? addCalendarMonths(start, durationMonths)
        : new Date(start.getTime() + Math.max(1, durationDays || 30) * 86400000);
      const expiresAt = app.firestore.Timestamp.fromDate(newExpiry);
      const suspended = shop.status === 'suspended' || shop.subscriptionStatus === 'suspended';
      const deleted = shop.deleted === true || shop.status === 'deleted';
      const shopStatus = deleted ? 'deleted' : suspended ? 'suspended' : 'active';
      const financials = {
        amountDueMinor: Number(payment.amountMinor),
        amountReceivedMinor: Number(payment.amountMinor),
        balanceDueMinor: 0,
        currency: 'EGP',
        paymentMethod: 'visa',
        paymentId,
        transactionId: transactionId || '',
        recordedBy: 'xpay',
        updatedAt: timestamp
      };
      transaction.set(paymentRef, {
        status: 'paid', paid: true, providerStatus: status, ...(transactionId ? { transactionId } : {}),
        shopId: resolvedShopId,
        termMonths: durationMonths, termDays: durationDays,
        subscriptionStartsAt: app.firestore.Timestamp.fromDate(start), expiresAt, paidAt: timestamp,
        updatedAt: timestamp
      }, { merge: true });
      if (requestUid) {
        transaction.set(shopRef, {
          slug: resolvedShopId,
          ownerUid: payment.ownerUid,
          ownerEmail: target.ownerEmail || shop.ownerEmail || '',
          storeName: target.storeName || payment.storeName || 'متجر شريك',
          supportPhone: target.supportPhone || shop.supportPhone || '',
          imageUrl: target.imageUrl || shop.imageUrl || '',
          active: !suspended && !deleted,
          status: shopStatus,
          subscriptionStatus: deleted ? 'cancelled' : shopStatus,
          subscriptionPlan: payment.planId,
          durationDays,
          durationMonths,
          productLimit: paymentPlan.productLimit,
          storeBranding: paymentPlan.storeBranding,
          advancedStorefront: paymentPlan.advancedStorefront,
          discounts: paymentPlan.discounts,
          prioritySupport24h: paymentPlan.prioritySupport24h,
          freeTrialUsed: target.freeTrialUsed === true || shop.freeTrialUsed === true,
          paymentMethod: 'visa',
          paymentStatus: 'paid',
          paymentId,
          paymentTransactionId: transactionId || '',
          adminFinancials: financials,
          ...(shop.subscriptionFirstPaymentAt ? {} : { subscriptionFirstPaymentAt: timestamp }),
          approvedAt: shop.approvedAt || timestamp,
          expiresAt,
          createdAt: shop.createdAt || target.createdAt || timestamp,
          updatedAt: timestamp
        }, { merge: true });
        transaction.set(targetRef, {
          status: 'approved',
          shopId: resolvedShopId,
          planId: payment.planId,
          paymentMethod: 'visa', paymentStatus: 'paid', paymentId,
          amountMinor: payment.amountMinor, currency: payment.currency || 'EGP',
          durationDays: Number(payment.durationDays || 0), durationMonths: Number(payment.durationMonths || 0),
          adminFinancials: financials,
          paidAt: timestamp, paymentTransactionId: transactionId || '', autoActivatedAt: timestamp, updatedAt: timestamp
        }, { merge: true });
        transaction.set(db.collection('users').doc(requestUid), { storeId: resolvedShopId }, { merge: true });
      } else {
        transaction.set(targetRef, {
          ...(shop.subscriptionFirstPaymentAt ? {} : { subscriptionFirstPaymentAt: timestamp }),
          expiresAt, active: !suspended && !deleted, status: shopStatus,
          subscriptionStatus: deleted ? 'cancelled' : shopStatus,
          paymentStatus: 'paid', paymentMethod: 'visa', adminFinancials: financials, updatedAt: timestamp
        }, { merge: true });
      }
      transitionedToPaid = true;
    });
    console.log(JSON.stringify({ source: 'xpay', type: 'store_subscription', paymentId, status, paid: transitionedToPaid, transactionId }));
    return res.status(200).json({ received: true, paymentId, paid: transitionedToPaid });
  } catch (error) {
    if (error?.statusCode) return res.status(error.statusCode).json({ error: error.message });
    console.error('[XPay subscription webhook]', error);
    return res.status(500).json({ error: 'Could not update the store subscription.' });
  }
}

const webhookHandler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  let rawBody;
  try { rawBody = await readRawBody(req); }
  catch (_) { return res.status(400).json({ error: 'Invalid webhook body.' }); }
  if (!isValidSignature(req, rawBody)) return res.status(401).json({ error: 'Invalid webhook signature.' });

  let event;
  try { event = req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : JSON.parse(rawBody.toString('utf8')); }
  catch (_) { return res.status(400).json({ error: 'Invalid webhook JSON.' }); }
  const object = eventObject(event);
  const status = normalizeStatus(event, object);
  const metadata = event.metadata || object.metadata || event.data?.metadata || {};
  const subscriptionType = String(metadata.type || metadata.purchaseType || event.type || '').toLowerCase();
  const subscriptionPaymentId = String(metadata.paymentId || metadata.payment_id || object.paymentId || object.payment_id || event.paymentId || event.reference || '').trim();
  if (subscriptionType === 'store_subscription' || /^SUB-[A-F0-9]{24}$/.test(subscriptionPaymentId)) {
    return handleStoreSubscriptionEvent(event, res, status, subscriptionPaymentId);
  }
  const orderNumber = String(object.orderNumber || event.orderNumber || event.reference || metadata.orderNumber || '').trim();
  if (!/^LOV-[A-Z0-9]{5,40}$/.test(orderNumber)) return res.status(400).json({ error: 'Missing or invalid order reference.' });

  const paid = ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(status);
  const failed = ['failed', 'cancelled', 'canceled', 'declined', 'expired'].includes(status);
  if (!paid && !failed) return res.status(200).json({ received: true, ignored: true });
  const transactionId = String(object.transaction_id || object.transactionId || event.transaction_id || event.transactionId || event.id || '');
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
    const amounts = eventAmounts(event, object);
    const currency = String(object.currency || event.currency || event.data?.currency || '').toUpperCase();
    if (paid) {
      if (!Number.isFinite(expectedAmount) || expectedAmount <= 0 || !amountMatches(expectedAmount, amounts)) {
        return res.status(409).json({ error: 'Paid event is missing a verifiable payment amount.' });
      }
      if (currency && currency !== 'EGP') return res.status(409).json({ error: 'Payment currency does not match EGP.' });
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
      const alreadyPaid = baseData.payment?.paid === true
        || ['paid', 'succeeded', 'success', 'completed', 'approved'].includes(previousStatus);
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

module.exports = webhookHandler;
module.exports.config = { api: { bodyParser: false } };
