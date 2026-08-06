// ============================================
// LOVARA - Auth System (Compat API) - FIXED v3
// ============================================

(function() {
  'use strict';

  function $(id) { return document.getElementById(id); }

  // FIXED: Create toast if missing
  function showToast(msg) {
    let toast = $('toast');
    let toastMsg = $('toastMsg');

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.className = 'toast';
      toast.innerHTML = '<i class="fas fa-check-circle"></i><span id="toastMsg"></span>';
      document.body.appendChild(toast);
      toastMsg = $('toastMsg');
    }

    if (toast && toastMsg) {
      toastMsg.textContent = msg;
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
  }

  function openModal(id) {
    const el = $(id);
    if (el) { 
      el.classList.add('active'); 
      el.classList.add('show');
      document.body.style.overflow = 'hidden'; 
    }
  }

  function closeModal(id) {
    const el = $(id);
    if (el) { 
      el.classList.remove('active'); 
      el.classList.remove('show');
      document.body.style.overflow = ''; 
    }
  }

  // --- Navbar UI ---
  function showAuthButtons() {
    const ab = $('authButtons'), ud = $('userDisplay'), lb = $('logoutBtn');
    if (ab) { ab.classList.remove('hidden'); ab.style.opacity = '1'; }
    if (ud) { ud.classList.remove('show'); }
    if (lb) { lb.classList.remove('show'); }
  }

  function showUserInfo(user) {
    const ab = $('authButtons'), ud = $('userDisplay'), lb = $('logoutBtn');
    const un = $('userName'), ue = $('userEmail');
    if (ab) { ab.classList.add('hidden'); }
    if (ud) {
      ud.classList.add('show');
      if (un) un.textContent = user.displayName || user.email.split('@')[0];
      if (ue) ue.textContent = user.email;
    }
    if (lb) { lb.classList.add('show'); }
  }

  // --- Modals ---
  function setupModals() {
    const openLogin = $('openLogin'), openSignup = $('openSignup');
    if (openLogin) openLogin.addEventListener('click', (e) => { e.preventDefault(); openModal('loginModal'); });
    if (openSignup) openSignup.addEventListener('click', (e) => { e.preventDefault(); openModal('signupModal'); });

    const closeLogin = $('closeLogin'), closeSignup = $('closeSignup'), closeForgot = $('closeForgot');
    if (closeLogin) closeLogin.addEventListener('click', () => closeModal('loginModal'));
    if (closeSignup) closeSignup.addEventListener('click', () => closeModal('signupModal'));
    if (closeForgot) closeForgot.addEventListener('click', () => closeModal('forgotModal'));

    const switchToSignup = $('switchToSignup'), switchToLogin = $('switchToLogin');
    const switchToLoginFromForgot = $('switchToLoginFromForgot');
    const forgotLink = $('forgotLink');

    if (switchToSignup) switchToSignup.addEventListener('click', () => {
      closeModal('loginModal'); setTimeout(() => openModal('signupModal'), 150);
    });
    if (switchToLogin) switchToLogin.addEventListener('click', () => {
      closeModal('signupModal'); setTimeout(() => openModal('loginModal'), 150);
    });
    if (switchToLoginFromForgot) switchToLoginFromForgot.addEventListener('click', () => {
      closeModal('forgotModal'); setTimeout(() => openModal('loginModal'), 150);
    });
    if (forgotLink) forgotLink.addEventListener('click', (e) => {
      e.preventDefault(); closeModal('loginModal'); setTimeout(() => openModal('forgotModal'), 150);
    });

    ['loginModal','signupModal','forgotModal'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('click', (e) => { if (e.target === el) closeModal(id); });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeModal('loginModal'); closeModal('signupModal'); closeModal('forgotModal');
      }
    });
  }

  // --- Forms ---
  function setupForms(auth) {
    const loginForm = $('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.querySelector('input[type="email"]').value.trim();
        const pw = $('loginPassword').value;
        try {
          await auth.signInWithEmailAndPassword(email, pw);
          closeModal('loginModal');
          loginForm.reset();
          showToast('Welcome back!');
        } catch (err) {
          showToast('Error: ' + (err.message || 'Login failed'));
        }
      });
    }

    const signupForm = $('signupForm');
    if (signupForm) {
      signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputs = signupForm.querySelectorAll('input');
        const firstName = inputs[0]?.value || '';
        const lastName = inputs[1]?.value || '';
        const email = signupForm.querySelector('input[type="email"]').value.trim();
        const pw = $('signupPassword').value;
        try {
          const cred = await auth.createUserWithEmailAndPassword(email, pw);
          await cred.user.updateProfile({ displayName: firstName + ' ' + lastName });
          await firebase.firestore().collection('users').doc(cred.user.uid).set({
            email: email, firstName: firstName, lastName: lastName,
            role: 'user', createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          closeModal('signupModal');
          signupForm.reset();
          showToast('Account created!');
        } catch (err) {
          showToast('Error: ' + (err.message || 'Signup failed'));
        }
      });
    }

    const forgotForm = $('forgotForm');
    if (forgotForm) {
      forgotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = $('forgotEmail').value.trim();
        auth.sendPasswordResetEmail(email)
          .then(() => { showToast('Reset link sent!'); closeModal('forgotModal'); })
          .catch(err => showToast('Error: ' + err.message));
      });
    }

    document.querySelectorAll('.google-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
          await auth.signInWithPopup(provider);
          closeModal('loginModal'); closeModal('signupModal');
          showToast('Welcome!');
        } catch (err) {
          showToast('Error: ' + err.message);
        }
      });
    });
  }

  // --- Logout ---
  function setupLogout(auth) {
    const btn = $('logoutBtn');
    if (btn) {
      btn.addEventListener('click', async () => {
        try {
          await auth.signOut();
          localStorage.removeItem('lovara_user');
          showAuthButtons();
          showToast('Logged out');
        } catch (err) {
          console.error(err);
        }
      });
    }
  }

  // Password toggle
  window.togglePassword = function(id) {
    const input = $(id);
    const icon = input?.parentElement?.querySelector('.toggle-pw i');
    if (!input) return;
    if (input.type === 'password') {
      input.type = 'text';
      if (icon) icon.className = 'fas fa-eye-slash';
    } else {
      input.type = 'password';
      if (icon) icon.className = 'fas fa-eye';
    }
  };

  // --- Wait for Firebase - FIXED: longer timeout, better detection ---
  function waitForFirebase(timeoutMs = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let checkCount = 0;

      const check = () => {
        checkCount++;

        // Check if firebase global exists and has auth + firestore
        if (typeof firebase !== 'undefined' && 
            typeof firebase.auth === 'function' && 
            typeof firebase.firestore === 'function') {

          // Check if Firebase is actually initialized (has apps)
          try {
            if (firebase.apps && firebase.apps.length > 0) {
              console.log('[Auth] Firebase ready (initialized, attempt ' + checkCount + ')');
              resolve(true);
              return;
            }
            // Firebase exists but not initialized yet - maybe firebase-config.js hasn't run
            if (checkCount > 50) {
              // Try to initialize ourselves as fallback
              console.warn('[Auth] Firebase not initialized by config, trying fallback...');
            }
          } catch (e) {
            // ignore
          }
        }

        if (Date.now() - startTime > timeoutMs) {
          console.warn('[Auth] Firebase not loaded after ' + timeoutMs + 'ms (attempts: ' + checkCount + ')');
          resolve(false);
          return;
        }

        setTimeout(check, 300);
      };

      check();
    });
  }

  // --- MAIN INIT ---
  const cached = localStorage.getItem('lovara_user');
  if (cached) {
    try {
      const user = JSON.parse(cached);
      showUserInfo(user);
    } catch (e) {
      showAuthButtons();
    }
  } else {
    showAuthButtons();
  }

  setupModals();

  async function initAuth() {
    console.log('[Auth] Waiting for Firebase...');
    const ready = await waitForFirebase(30000);

    if (!ready) {
      console.warn('[Auth] Firebase not ready. Will retry in 3 seconds...');
      showAuthButtons();

      // Retry once after 3 seconds
      setTimeout(async () => {
        console.log('[Auth] Retrying Firebase...');
        const retry = await waitForFirebase(15000);
        if (retry) {
          console.log('[Auth] Firebase ready on retry!');
          startAuth();
        } else {
          console.error('[Auth] Firebase failed to load. Auth features disabled.');
          showToast('Connection issue. Please refresh the page.');
        }
      }, 3000);
      return;
    }

    startAuth();
  }

  function startAuth() {
    console.log('[Auth] Starting auth setup...');

    try {
      const auth = firebase.auth();

      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

      setupForms(auth);
      setupLogout(auth);

      auth.onAuthStateChanged((user) => {
        if (user) {
          console.log('[Auth] User logged in:', user.email);
          localStorage.setItem('lovara_user', JSON.stringify({
            uid: user.uid, email: user.email,
            displayName: user.displayName || user.email.split('@')[0]
          }));
          showUserInfo(user);
        } else {
          console.log('[Auth] User logged out');
          localStorage.removeItem('lovara_user');
          showAuthButtons();
        }
      });

      console.log('[Auth] Auth system ready');
    } catch (err) {
      console.error('[Auth] Error setting up auth:', err);
      showAuthButtons();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }
})();