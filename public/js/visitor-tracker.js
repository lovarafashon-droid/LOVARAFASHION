/* LOVARA visitor analytics: group registered users by email and exclude admin/order dashboards. */
(function () {
  const page = location.pathname.split('/').pop() || 'index';
  const excluded = new Set(['admin', 'orders', 'other', 'checkout']);
  if (excluded.has(page)) return;

  const sessionKey = 'lovara_visitor_session';
  const sessionId = sessionStorage.getItem(sessionKey) || ('v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
  sessionStorage.setItem(sessionKey, sessionId);
  let activeIdentity = null;

  function visitorKey(email) {
    if (!email) return sessionId;
    let hash = 2166136261;
    for (const ch of email) { hash ^= ch.charCodeAt(0); hash = Math.imul(hash, 16777619); }
    return 'email_' + (hash >>> 0).toString(36);
  }

  function save() {
    if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.apps || !firebase.apps.length) return;
    const authUser = firebase.auth && firebase.auth().currentUser;
    const email = (authUser?.email || '').trim().toLowerCase();
    const displayName = authUser?.displayName || '';
    const identity = email || activeIdentity || '';
    const key = visitorKey(identity);
    const db = firebase.firestore();
    const ref = db.collection('visitors').doc(key);
    ref.set({
      visitorKey: key,
      sessionId,
      email: email || 'غير معروف',
      displayName,
      pages: firebase.firestore.FieldValue.arrayUnion(page),
      lastPage: page,
      path: location.pathname,
      title: document.title || 'LOVARA',
      referrer: document.referrer || '',
      userAgent: navigator.userAgent.slice(0, 240),
      language: navigator.language || '',
      visitCount: firebase.firestore.FieldValue.increment(1),
      lastSeenAt: firebase.firestore.FieldValue.serverTimestamp(),
      firstSeenAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
    activeIdentity = identity;
  }

  let tries = 0;
  const wait = () => { tries++; save(); if (tries < 20) setTimeout(wait, 500); };
  wait();
  if (typeof firebase !== 'undefined' && firebase.auth) firebase.auth().onAuthStateChanged(() => save());
  window.addEventListener('pagehide', save);
})();
