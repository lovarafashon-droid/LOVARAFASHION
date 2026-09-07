// LOVARA account data sync: cart and wishlist across devices.
(function () {
  const CART_KEY = 'lovara_cart';
  const WISHLIST_KEY = 'lovara_wishlist';
  let syncTimer = null;

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch (_) { return []; }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
  }

  function getUser() {
    return typeof firebase !== 'undefined' && firebase.auth && firebase.auth().currentUser;
  }

  function wishlistObjects(items) {
    return items.map(item => typeof item === 'string' ? { id: item } : item).filter(item => item && item.id);
  }

  function mergeById(local, remote) {
    const result = [];
    const add = item => {
      if (!item || !item.id || result.some(existing => existing.id === item.id)) return;
      result.push(item);
    };
    (remote || []).forEach(add);
    (local || []).forEach(add);
    return result;
  }

  async function save() {
    const user = getUser();
    if (!user || typeof db === 'undefined') return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
      try {
        await db.collection('users').doc(user.uid).set({
          cart: read(CART_KEY),
          wishlist: wishlistObjects(read(WISHLIST_KEY)),
          dataUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.warn('[LOVARA] Account data sync failed:', error.code || error.message);
      }
    }, 250);
  }

  async function load() {
    const user = getUser();
    if (!user || typeof db === 'undefined') return;
    try {
      const snapshot = await db.collection('users').doc(user.uid).get();
      const remote = snapshot.exists ? snapshot.data() : {};
      const cart = mergeById(read(CART_KEY), Array.isArray(remote.cart) ? remote.cart : []);
      const wishlist = mergeById(wishlistObjects(read(WISHLIST_KEY)), Array.isArray(remote.wishlist) ? remote.wishlist : []);
      write(CART_KEY, cart);
      write(WISHLIST_KEY, wishlist);
      document.dispatchEvent(new CustomEvent('lovara-account-data-ready'));
      await save();
    } catch (error) {
      console.warn('[LOVARA] Could not load account data:', error.code || error.message);
    }
  }

  window.LovaraData = {
    read,
    write,
    save,
    load,
    getCart: () => read(CART_KEY),
    getWishlist: () => wishlistObjects(read(WISHLIST_KEY)),
    saveCart: save,
    saveWishlist: save
  };

  function start() {
    if (typeof firebase === 'undefined' || !firebase.auth) return;
    firebase.auth().onAuthStateChanged(user => { if (user) load(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
