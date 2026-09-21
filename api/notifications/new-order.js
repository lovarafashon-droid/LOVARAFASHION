const { admin, findOrderByNumber } = require('../_lib/firestore');

function clean(value, fallback = '') {
  return String(value == null ? fallback : value).replace(/[<>]/g, '').trim();
}

function amountText(order) {
  const raw = order?.totals?.total || '';
  const amount = Number(String(raw).replace(/[^0-9.]/g, ''));
  return Number.isFinite(amount) ? `EGP ${amount.toFixed(2)}` : clean(raw, 'غير محدد');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const orderNumber = clean(req.body?.orderNumber);
  if (!orderNumber) return res.status(400).json({ error: 'Missing order number.' });

  try {
    const found = await findOrderByNumber(orderNumber);
    if (!found) return res.status(404).json({ error: 'Order not found.' });
    const order = found.data;
    const db = admin().firestore();
    const orderRef = found.ref;
    const currentNotification = order.notifications?.newOrder;
    if (currentNotification?.sentAt) {
      return res.status(200).json({ sent: false, duplicate: true });
    }

    const tokenSnapshot = await db.collection('notificationTokens').where('active', '==', true).limit(500).get();
    const tokenDocs = tokenSnapshot.docs.filter((doc) => doc.data()?.token);
    const tokens = tokenDocs.map((doc) => doc.data().token);
    if (!tokens.length) {
      await orderRef.set({ notifications: { ...(order.notifications || {}), newOrder: { sentAt: null, reason: 'no_registered_devices' } } }, { merge: true });
      return res.status(200).json({ sent: false, reason: 'no_registered_devices' });
    }

    const customer = order.customer || {};
    const customerName = clean(`${customer.firstName || ''} ${customer.lastName || ''}`, 'عميل جديد');
    const siteUrl = String(process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
    const message = {
      tokens,
      notification: {
        title: 'طلب جديد - LOVARA',
        body: `${customerName} • ${amountText(order)}`
      },
      data: {
        orderNumber,
        title: 'طلب جديد - LOVARA',
        body: `${customerName} • ${amountText(order)}`,
        url: '/orders.html'
      },
      webpush: {
        ...(siteUrl ? { fcmOptions: { link: `${siteUrl}/orders.html` } } : {}),
        notification: {
          icon: '/LOVARA.jpeg',
          badge: '/LOVARA.jpeg',
          tag: orderNumber,
          requireInteraction: true
        }
      }
    };

    const result = await admin().messaging().sendEachForMulticast(message);
    const invalidCodes = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);
    const cleanup = [];
    result.responses.forEach((response, index) => {
      if (!response.success && invalidCodes.has(response.error?.code)) cleanup.push(tokenDocs[index].ref);
    });
    await Promise.all(cleanup.map((ref) => ref.delete()));
    await orderRef.set({ notifications: { ...(order.notifications || {}), newOrder: { sentAt: admin().firestore.FieldValue.serverTimestamp(), successCount: result.successCount, failureCount: result.failureCount } } }, { merge: true });

    return res.status(200).json({ sent: result.successCount > 0, successCount: result.successCount, failureCount: result.failureCount });
  } catch (error) {
    console.error('[new-order notification]', error);
    return res.status(500).json({ error: 'Could not send notification.' });
  }
};
