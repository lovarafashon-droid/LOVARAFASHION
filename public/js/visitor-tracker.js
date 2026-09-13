/* LOVARA visitor analytics: anonymous, privacy-light session tracking. */
(function () {
  const sessionKey = 'lovara_visitor_session';
  const sessionId = sessionStorage.getItem(sessionKey) || ('v_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8));
  sessionStorage.setItem(sessionKey, sessionId);
  const save = () => {
    if (typeof firebase === 'undefined' || !firebase.firestore || !firebase.apps || !firebase.apps.length) return;
    const db = firebase.firestore();
    const ref = db.collection('visitors').doc(sessionId);
    ref.set({
      sessionId, page: location.pathname.split('/').pop() || 'index.html',
      path: location.pathname, title: document.title || 'LOVARA',
      referrer: document.referrer || '', userAgent: navigator.userAgent.slice(0, 240),
      language: navigator.language || '', lastSeenAt: firebase.firestore.FieldValue.serverTimestamp(),
      firstSeenAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
  };
  let tries = 0;
  const wait = () => { tries++; save(); if (tries < 20) setTimeout(wait, 500); };
  wait();
  window.addEventListener('pagehide', save);
})();
