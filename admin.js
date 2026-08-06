// ============================================
// LOVARA - Admin Auth System (FIXED)
// ============================================

document.addEventListener('DOMContentLoaded', function() {
  
  // ✅ استخدم Promise بدل setInterval
  function waitForFirebase() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds max
      
      const check = () => {
        attempts++;
        
        if (window.adminAuth && window.adminDb && window.adminStorage) {
          console.log('✅ Admin Firebase ready');
          resolve();
          return;
        }
        
        if (attempts >= maxAttempts) {
          reject(new Error('Firebase not loaded after 10s'));
          return;
        }
        
        // ✅ requestAnimationFrame أحسن من setInterval
        requestAnimationFrame(check);
      };
      
      check();
    });
  }

  waitForFirebase()
    .then(() => startAdminAuth())
    .catch(err => {
      console.error('❌', err);
      alert('Error: Admin system not loaded. Please refresh.');
    });

  function startAdminAuth() {
    const auth = window.adminAuth;
    const db = window.adminDb;
    
    // العناصر
    const loginScreen = document.getElementById('loginScreen');
    const adminDashboard = document.getElementById('adminDashboard');
    const adminLoginForm = document.getElementById('adminLoginForm');
    const adminEmail = document.getElementById('adminEmail');
    const adminPassword = document.getElementById('adminPassword');
    const loginError = document.getElementById('loginError');
    const adminUserName = document.getElementById('adminUserName');
    const adminUserEmail = document.getElementById('adminUserEmail');
    const logoutBtn = document.getElementById('logoutBtn');
    const loginBtnText = document.getElementById('loginBtnText');
    
    // الإيميلات المسموح بيها
    const ADMIN_EMAILS = ['admin@lovara.com', 'tomathnabil2000@gmail.com'];
    
    // ✅ استخدم onAuthStateChanged مرة واحدة
    const unsubscribe = auth.onAuthStateChanged(async function(user) {
      if (user) {
        console.log('User logged in:', user.email);
        
        const isAdmin = ADMIN_EMAILS.includes(user.email);
        
        if (isAdmin) {
          showDashboard(user);
        } else {
          await auth.signOut();
          showLoginScreen();
          showError('Access denied. Not an admin.');
        }
      } else {
        showLoginScreen();
      }
    });

    // ✅ Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      unsubscribe();
    });
    
    // لما تدوسي Login
    if (adminLoginForm) {
      adminLoginForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        const email = adminEmail.value.trim();
        const password = adminPassword.value;
        
        if (!email || !password) {
          showError('Enter email and password');
          return;
        }
        
        const submitBtn = adminLoginForm.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        loginBtnText.textContent = 'Signing in...';
        loginError.classList.remove('show');
        
        try {
          console.log('Logging in:', email);
          await auth.signInWithEmailAndPassword(email, password);
          // Dashboard هيفتح تلقائي من onAuthStateChanged
          
        } catch (error) {
          console.error('Login error:', error);
          
          let msg = 'Login failed';
          if (error.code === 'auth/user-not-found') msg = 'User not found';
          else if (error.code === 'auth/wrong-password') msg = 'Wrong password';
          else if (error.code === 'auth/invalid-email') msg = 'Invalid email';
          else if (error.code === 'auth/invalid-credential') msg = 'Wrong email or password';
          else if (error.code === 'auth/too-many-requests') msg = 'Too many attempts. Try later.';
          else if (error.code === 'auth/network-request-failed') msg = 'Network error. Check connection.';
          
          showError(msg);
          submitBtn.disabled = false;
          loginBtnText.textContent = 'Sign In';
        }
      });
    }
    
    // Logout
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function() {
        try {
          await auth.signOut();
          window.location.href = 'index.html'; // ← أحسن من reload
        } catch (err) {
          console.error('Logout error:', err);
        }
      });
    }
    
    // Toggle password
    window.toggleAdminPassword = function() {
      const pw = document.getElementById('adminPassword');
      const icon = document.getElementById('togglePwIcon');
      if (!pw || !icon) return;
      
      if (pw.type === 'password') {
        pw.type = 'text';
        icon.className = 'fas fa-eye-slash';
      } else {
        pw.type = 'password';
        icon.className = 'fas fa-eye';
      }
    };
    
    function showLoginScreen() {
      if (loginScreen) {
        loginScreen.style.display = 'flex';
      }
      if (adminDashboard) adminDashboard.style.display = 'none';
    }
    
    function showDashboard(user) {
      if (loginScreen) {
        loginScreen.style.display = 'none';
      }
      if (adminDashboard) adminDashboard.style.display = 'block';
      
      if (adminUserName) adminUserName.textContent = user.email.split('@')[0];
      if (adminUserEmail) adminUserEmail.textContent = user.email;
      
      // ✅ استخدم setTimeout بس لو الـ function موجودة
      setTimeout(function() {
        if (typeof window.loadProducts === 'function') {
          window.loadProducts();
        }
      }, 100);
    }
    
    function showError(message) {
      if (loginError) {
        const span = loginError.querySelector('span');
        if (span) span.textContent = message;
        loginError.classList.add('show');
      }
    }
  }
});