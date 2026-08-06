// ============================================
// LOVARA - Categories Shared JavaScript (IMPROVED v2)
// Auth, Cart, Wishlist, i18n, Products for ALL category pages
// ============================================

const CategoryApp = {
  // ==================== STATE ====================
  currentLang: localStorage.getItem('lovara_lang') || 'en',
  cart: JSON.parse(localStorage.getItem('lovara_cart') || '[]'),
  wishlist: JSON.parse(localStorage.getItem('lovara_wishlist') || '[]'),
  currentUser: null,
  products: [],
  firebaseReady: false,
  authInitialized: false,

  // ==================== TRANSLATIONS ====================
  translations: {
    en: {
      pageTitleDresses: "LOVARA – Dresses",
      pageTitleTops: "LOVARA – Tops",
      pageTitlePants: "LOVARA – Pants",
      pageTitleAccessories: "LOVARA – Accessories",
      pageTitleSets: "LOVARA – Sets",
      pageTitleLingerie: "LOVARA – Lingerie",
      navHome: "Home", navShop: "Shop", navCategories: "Categories", navAbout: "About", navContact: "Contact",
      navLogin: "Login", navSignup: "Sign Up",
      catDresses: "Dresses", catTops: "Tops", catPants: "Pants", catAccessories: "Accessories", catSets: "Sets", catLingerie: "Lingerie",
      shopEyebrow: "Our Collection",
      loadingProducts: "Loading products...",
      emptyTitle: "Products Coming Soon",
      emptyDesc: "We are adding beautiful new items to this category.<br />Check back shortly!",
      supportTitle: "Need Help?",
      supportDesc: "Have an issue with a product? Contact us directly and we will help you resolve it.",
      phoneSupport: "Phone Support", phoneSupportDesc: "Call us at +20128845212",
      whatsappSupport: "WhatsApp Support", whatsappSupportDesc: "Chat with us on WhatsApp",
      emailSupport: "Email Support",
      quickForm: "Quick Contact Form",
      formName: "Your Name", formEmail: "Email Address", formSubject: "Subject", formMessage: "Describe your issue",
      formSubmit: "Send Message",
      subjectSelect: "Select a topic", subjectOrder: "Order Issue", subjectProduct: "Product Problem", subjectSizing: "Sizing Question", subjectOther: "Other",
      footerBrand: "Luxury women's fashion, curated with love. Wear your story.",
      footerShop: "Shop", footerHelp: "Help", footerNewsletter: "Newsletter",
      footerNewsletterDesc: "Get exclusive deals and style inspiration.",
      footerNewArrivals: "New Arrivals", footerDresses: "Dresses", footerTops: "Tops",
      footerPants: "Pants", footerAccessories: "Accessories", footerLingerie: "Lingerie", footerSets: "Sets",
      footerSizing: "Sizing Guide", footerShipping: "Shipping Info", footerReturns: "Returns",
      footerTrack: "Track Order", footerContact: "Contact",
      footerCopyright: "© 2027 LOVARA. All rights reserved. | Women's Luxury Fashion",
      footerPrivacy: "Privacy Policy", footerTerms: "Terms of Service", footerCookies: "Cookie Policy",
      toastDefault: "Action completed!",
      cartTitle: "Your Cart", cartEmpty: "Your cart is empty", cartContinue: "Continue Shopping",
      cartTotal: "Total:", cartCheckout: "Checkout", cartClear: "Clear Cart",
      wishlistTitle: "Your Wishlist", wishlistEmpty: "Your wishlist is empty", wishlistContinue: "Continue Shopping",
      addToCart: "Add to Cart", buyNow: "Buy Now", share: "Share",
      loginTitle: "Welcome Back", loginSub: "Sign in to your account",
      signupTitle: "Join LOVARA", signupSub: "Create your account — it's free",
      labelEmail: "Email", labelPassword: "Password",
      placeholderEmail: "emma@example.com", placeholderPassword: "••••••••",
      btnSignIn: "Sign In", btnCreateAccount: "Create Account",
      noAccount: "Don't have an account?", haveAccount: "Already have an account?",
      btnSignUpLink: "Sign Up", btnSignInLink: "Sign In",
      forgotPassword: "Forgot password?",
      rememberMe: "Remember me",
      googleSignIn: "Continue with Google",
      orSignIn: "or sign in with email",
      orCreate: "or create with email",
      agreeTerms: "I agree to the", termsLink: "Terms of Service", and: "and", privacyLink: "Privacy Policy",
      subscribeNews: "Subscribe to our newsletter for exclusive offers",
      forgotTitle: "Reset Password", forgotSub: "Enter your email to receive a reset link",
      btnSendReset: "Send Reset Link", rememberPassword: "Remember your password?",
      logout: "Logout",
      welcome: "Welcome",
      size: "Size", color: "Color", selectSize: "Select size", selectColor: "Select color"
    },
    ar: {
      pageTitleDresses: "LOVARA – فساتين",
      pageTitleTops: "LOVARA – بلوزات",
      pageTitlePants: "LOVARA – بناطيل",
      pageTitleAccessories: "LOVARA – إكسسوارات",
      pageTitleSets: "LOVARA – اطقم",
      pageTitleLingerie: "LOVARA – ملابس داخلية",
      navHome: "الرئيسية", navShop: "المتجر", navCategories: "التصنيفات", navAbout: "من نحن", navContact: "تواصل معنا",
      navLogin: "تسجيل الدخول", navSignup: "إنشاء حساب",
      catDresses: "فساتين", catTops: "بلوزات", catPants: "بناطيل", catAccessories: "إكسسوارات", catSets: "اطقم", catLingerie: "ملابس داخلية",
      shopEyebrow: "مجموعتنا",
      loadingProducts: "جاري تحميل المنتجات...",
      emptyTitle: "المنتجات قريباً",
      emptyDesc: "نضيف قطعاً جديدة رائعة إلى هذا التصنيف.<br />تفقدي قريباً!",
      supportTitle: "تحتاجين مساعدة؟",
      supportDesc: "عندكِ مشكلة في منتج؟ تواصلي معانا مباشرة وهنساعدكِ تحلها.",
      phoneSupport: "دعم هاتفي", phoneSupportDesc: "اتصلي بنا على +20128845212",
      whatsappSupport: "دعم واتساب", whatsappSupportDesc: "تواصلي معانا على واتساب",
      emailSupport: "دعم البريد الإلكتروني",
      quickForm: "نموذج تواصل سريع",
      formName: "الاسم", formEmail: "البريد الإلكتروني", formSubject: "الموضوع", formMessage: "صفّي المشكلة",
      formSubmit: "إرسال الرسالة",
      subjectSelect: "اختيار موضوع", subjectOrder: "مشكلة طلب", subjectProduct: "مشكلة منتج", subjectSizing: "سؤال مقاس", subjectOther: "أخرى",
      footerBrand: "أزياء نسائية فاخرة، مختارة بعناية. ارتدي قصتكِ.",
      footerShop: "المتجر", footerHelp: "المساعدة", footerNewsletter: "النشرة البريدية",
      footerNewsletterDesc: "احصلي على عروض حصرية وإلهام للأناقة.",
      footerNewArrivals: "وصل حديثاً", footerDresses: "فساتين", footerTops: "بلوزات",
      footerPants: "بناطيل", footerAccessories: "إكسسوارات", footerLingerie: "ملابس داخلية", footerSets: "اطقم",
      footerSizing: "دليل المقاسات", footerShipping: "معلومات الشحن", footerReturns: "الإرجاع",
      footerTrack: "تتبع الطلب", footerContact: "تواصل معنا",
      footerCopyright: "© 2027 لوڤارا. جميع الحقوق محفوظة. | أزياء نسائية فاخرة",
      footerPrivacy: "سياسة الخصوصية", footerTerms: "شروط الخدمة", footerCookies: "سياسة الكوكيز",
      toastDefault: "تم بنجاح!",
      cartTitle: "سلة التسوق", cartEmpty: "سلة التسوق فارغة", cartContinue: "مواصلة التسوق",
      cartTotal: "الإجمالي:", cartCheckout: "إتمام الشراء", cartClear: "إفراغ السلة",
      wishlistTitle: "المفضلة", wishlistEmpty: "المفضلة فارغة", wishlistContinue: "مواصلة التسوق",
      addToCart: "أضيفي للسلة", buyNow: "اشتري الآن", share: "مشاركة",
      loginTitle: "أهلاً بعودتكِ", loginSub: "سجلي دخولكِ إلى حسابكِ",
      signupTitle: "انضمي إلى لوڤارا", signupSub: "أنشئي حسابكِ — مجاناً",
      labelEmail: "البريد الإلكتروني", labelPassword: "كلمة المرور",
      placeholderEmail: "example@email.com", placeholderPassword: "••••••••",
      btnSignIn: "تسجيل الدخول", btnCreateAccount: "إنشاء الحساب",
      noAccount: "ليس لديكِ حساب؟", haveAccount: "لديكِ حساب بالفعل؟",
      btnSignUpLink: "إنشاء حساب", btnSignInLink: "تسجيل الدخول",
      forgotPassword: "نسيتِ كلمة المرور؟",
      rememberMe: "تذكرني",
      googleSignIn: "المتابعة مع Google",
      orSignIn: "أو سجلي الدخول بالبريد",
      orCreate: "أو أنشئي بالبريد",
      agreeTerms: "أوافق على", termsLink: "شروط الخدمة", and: "و", privacyLink: "سياسة الخصوصية",
      subscribeNews: "اشتركي في نشرتنا البريدية للحصول على عروض حصرية",
      forgotTitle: "إعادة تعيين كلمة المرور", forgotSub: "أدخلي بريدكِ الإلكتروني لاستلام رابط إعادة التعيين",
      btnSendReset: "إرسال رابط إعادة التعيين", rememberPassword: "تذكرتِ كلمة المرور؟",
      logout: "تسجيل الخروج",
      welcome: "أهلاً",
      size: "المقاس", color: "اللون", selectSize: "اختيار المقاس", selectColor: "اختيار اللون"
    }
  },

  // ==================== PER-USER CART / WISHLIST ====================
  _getCartKey(uid) { return `lovara_cart_${uid}`; },
  _getWishlistKey(uid) { return `lovara_wishlist_${uid}`; },
  _getOwner() { return localStorage.getItem('lovara_cart_owner') || 'guest'; },
  _setOwner(owner) { localStorage.setItem('lovara_cart_owner', owner); },

  _onUserLogin(uid) {
    const currentOwner = this._getOwner();
    if (currentOwner === uid) {
      this.cart = JSON.parse(localStorage.getItem('lovara_cart') || '[]');
      this.wishlist = JSON.parse(localStorage.getItem('lovara_wishlist') || '[]');
      return;
    }
    const cartKey = this._getCartKey(uid);
    const wishlistKey = this._getWishlistKey(uid);
    const currentCart = localStorage.getItem('lovara_cart') || '[]';
    const currentWishlist = localStorage.getItem('lovara_wishlist') || '[]';
    if (currentOwner && currentOwner !== 'guest') {
      localStorage.setItem(this._getCartKey(currentOwner), currentCart);
      localStorage.setItem(this._getWishlistKey(currentOwner), currentWishlist);
    } else {
      localStorage.setItem('lovara_cart_guest', currentCart);
      localStorage.setItem('lovara_wishlist_guest', currentWishlist);
    }
    const userCart = localStorage.getItem(cartKey) || '[]';
    const userWishlist = localStorage.getItem(wishlistKey) || '[]';
    localStorage.setItem('lovara_cart', userCart);
    localStorage.setItem('lovara_wishlist', userWishlist);
    this.cart = JSON.parse(userCart);
    this.wishlist = JSON.parse(userWishlist);
    this._setOwner(uid);
  },

  _onUserLogout(uid) {
    const currentOwner = this._getOwner();
    if (currentOwner !== uid) { this._setOwner('guest'); return; }
    const cartKey = this._getCartKey(uid);
    const wishlistKey = this._getWishlistKey(uid);
    const currentCart = localStorage.getItem('lovara_cart') || '[]';
    const currentWishlist = localStorage.getItem('lovara_wishlist') || '[]';
    localStorage.setItem(cartKey, currentCart);
    localStorage.setItem(wishlistKey, currentWishlist);
    const guestCart = localStorage.getItem('lovara_cart_guest') || '[]';
    const guestWishlist = localStorage.getItem('lovara_wishlist_guest') || '[]';
    localStorage.setItem('lovara_cart', guestCart);
    localStorage.setItem('lovara_wishlist', guestWishlist);
    this.cart = JSON.parse(guestCart);
    this.wishlist = JSON.parse(guestWishlist);
    this._setOwner('guest');
  },

  // ==================== INIT ====================
  init() {
    if (this._initialized) {
      console.log('[LOVARA] CategoryApp.init() skipped — already initialized');
      return;
    }
    this._initialized = true;
    console.log('[LOVARA] CategoryApp.init() started');
    this.setupI18n();
    this.setupAuth();
    this.setupCart();
    this.setupWishlist();
    this.setupMobileMenu();
    this.setupBackToTop();
    this.setupSupportForm();
    this.setupNewsletterForm();
    this.setupProductCardDelegation();
    this.setupCartDelegation();
    this.loadProducts();
    this.cart = JSON.parse(localStorage.getItem('lovara_cart') || '[]');
    this.wishlist = JSON.parse(localStorage.getItem('lovara_wishlist') || '[]');
    this.updateCartCount();
    this.updateWishlistCount();
    this.updateAuthRequiredDots();
    console.log('[LOVARA] CategoryApp.init() completed');
  },

  // ==================== AUTH ====================
  setupAuth() {
    console.log('[LOVARA] Setting up auth...');

    // Step 1: Check localStorage first for immediate UI update (no flicker)
    const savedUser = localStorage.getItem('lovara_user');
    if (savedUser) {
      try {
        const userData = JSON.parse(savedUser);
        this.currentUser = userData;
        this.updateAuthUI(userData);
        this.updateAuthRequiredDots();
        console.log('[LOVARA] User loaded from localStorage:', userData.email);
      } catch (e) {
        console.error('[LOVARA] Failed to parse saved user:', e);
        localStorage.removeItem('lovara_user');
      }
    }

    // Step 2: Wait for Firebase to be ready, then setup auth state listener
    this.waitForFirebaseAuth();

    // Step 3: Setup modal events
    this.setupAuthModalEvents();
  },

  waitForFirebaseAuth() {
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds total

    const checkAuth = () => {
      attempts++;
      console.log(`[LOVARA] Firebase check attempt ${attempts}/${maxAttempts}`);

      try {
        // Check if firebase object exists and has apps initialized
        if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length > 0 && firebase.auth) {
          this.firebaseReady = true;
          console.log('[LOVARA] ✅ Firebase is ready!');

          // Setup auth state listener
          firebase.auth().onAuthStateChanged((user) => {
            if (user) {
              console.log('[LOVARA] Auth state: LOGGED IN', user.email);
              const userData = {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || user.email.split('@')[0],
                photoURL: user.photoURL
              };
              this.currentUser = userData;
              localStorage.setItem('lovara_user', JSON.stringify(userData));
              this.updateAuthUI(userData);
              this.updateAuthRequiredDots();
              this._onUserLogin(user.uid);
              this.updateCartCount();
              this.updateWishlistCount();
            } else {
              console.log('[LOVARA] Auth state: LOGGED OUT');
              this.currentUser = null;
              localStorage.removeItem('lovara_user');
              this.updateAuthUI(null);
              this.updateAuthRequiredDots();
            }
          });

          this.authInitialized = true;
        } else {
          if (attempts < maxAttempts) {
            console.log('[LOVARA] ⏳ Firebase not ready yet, retrying in 500ms...');
            setTimeout(checkAuth, 500);
          } else {
            console.error('[LOVARA] ❌ Firebase failed to initialize after 10 seconds');
            this.showToast('Authentication service unavailable. Please refresh.', 'error');
          }
        }
      } catch (e) {
        console.error('[LOVARA] Auth setup error:', e);
        if (attempts < maxAttempts) {
          setTimeout(checkAuth, 500);
        }
      }
    };

    // Start checking after a small delay to let scripts load
    setTimeout(checkAuth, 100);
  },

  updateAuthUI(user) {
    const authButtons = document.getElementById('authButtons');
    const userDisplay = document.getElementById('userDisplay');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');
    const logoutBtn = document.getElementById('logoutBtn');

    if (user) {
      console.log('[LOVARA] Updating UI for logged-in user:', user.email);
      if (authButtons) authButtons.style.display = 'none';
      if (userDisplay) {
        userDisplay.style.display = 'flex';
        if (userName) userName.textContent = user.displayName || user.email.split('@')[0];
        if (userEmail) userEmail.textContent = user.email;
      }
      if (logoutBtn) logoutBtn.style.display = 'inline-flex';
    } else {
      console.log('[LOVARA] Updating UI for logged-out user');
      if (authButtons) authButtons.style.display = 'flex';
      if (userDisplay) userDisplay.style.display = 'none';
      if (logoutBtn) logoutBtn.style.display = 'none';
    }
    this.updateAuthRequiredDots();
  },

  updateAuthRequiredDots() {
    const cartDot = document.getElementById('cartAuthDot');
    const wishlistDot = document.getElementById('wishlistAuthDot');
    const show = !this.currentUser;
    if (cartDot) cartDot.classList.toggle('show', show);
    if (wishlistDot) wishlistDot.classList.toggle('show', show);
  },

  setupAuthModalEvents() {
    console.log('[LOVARA] Setting up auth modal events...');

    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      console.log('[LOVARA] Login form found');
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    } else {
      console.warn('[LOVARA] Login form NOT found');
    }

    // Signup form
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
      console.log('[LOVARA] Signup form found');
      signupForm.addEventListener('submit', (e) => this.handleSignup(e));
    } else {
      console.warn('[LOVARA] Signup form NOT found');
    }

    // Forgot password form
    const forgotForm = document.getElementById('forgotForm');
    if (forgotForm) {
      console.log('[LOVARA] Forgot form found');
      forgotForm.addEventListener('submit', (e) => this.handleForgot(e));
    }

    // Switch between modals
    const switchToSignup = document.getElementById('switchToSignup');
    const switchToLogin = document.getElementById('switchToLogin');
    const switchToLoginFromForgot = document.getElementById('switchToLoginFromForgot');
    const forgotLink = document.getElementById('forgotLink');

    if (switchToSignup) {
      switchToSignup.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeModal('loginModal');
        this.openModal('signupModal');
      });
    }
    if (switchToLogin) {
      switchToLogin.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeModal('signupModal');
        this.openModal('loginModal');
      });
    }
    if (switchToLoginFromForgot) {
      switchToLoginFromForgot.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeModal('forgotModal');
        this.openModal('loginModal');
      });
    }
    if (forgotLink) {
      forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.closeModal('loginModal');
        this.openModal('forgotModal');
      });
    }

    // Close buttons
    const closeLogin = document.getElementById('closeLogin');
    const closeSignup = document.getElementById('closeSignup');
    const closeForgot = document.getElementById('closeForgot');

    if (closeLogin) closeLogin.addEventListener('click', () => this.closeModal('loginModal'));
    if (closeSignup) closeSignup.addEventListener('click', () => this.closeModal('signupModal'));
    if (closeForgot) closeForgot.addEventListener('click', () => this.closeModal('forgotModal'));

    // Close on overlay click
    ['loginModal', 'signupModal', 'forgotModal'].forEach(id => {
      const modal = document.getElementById(id);
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) this.closeModal(id);
        });
      }
    });
  },

  openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.add('show');
      modal.classList.add('active');
      console.log('[LOVARA] Modal opened:', modalId);
    } else {
      console.warn('[LOVARA] Modal NOT found:', modalId);
    }
    document.body.style.overflow = 'hidden';
  },

  closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.classList.remove('show');
      modal.classList.remove('active');
    }
    document.body.style.overflow = '';
    // Sync with auth-check.js if loaded
    if (typeof window.closeModal === 'function') { window.closeModal(modalId); }
  },

  async handleLogin(e) {
    e.preventDefault();
    console.log('[LOVARA] Login form submitted');

    const form = e.target;

    // Get inputs specifically from the login form
    const emailInput = form.querySelector('input[type="email"]');
    const passwordInput = form.querySelector('input[type="password"]');

    if (!emailInput || !passwordInput) {
      console.error('[LOVARA] Login form inputs not found');
      this.showToast('Form error: missing fields', 'error');
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    console.log('[LOVARA] Login attempt for:', email);

    if (!email || !password) {
      this.showToast('Please fill in all fields', 'error');
      return;
    }

    // Check if Firebase is ready
    if (!this.firebaseReady || typeof firebase === 'undefined' || !firebase.auth) {
      console.error('[LOVARA] Firebase not ready for login');
      this.showToast('Authentication service not ready. Please wait a moment and try again.', 'error');
      return;
    }

    try {
      // Set persistence to LOCAL
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      console.log('[LOVARA] Persistence set to LOCAL');

      const result = await firebase.auth().signInWithEmailAndPassword(email, password);
      const user = result.user;
      console.log('[LOVARA] Login successful:', user.email);

      // Save to localStorage
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email.split('@')[0],
        photoURL: user.photoURL
      };
      localStorage.setItem('lovara_user', JSON.stringify(userData));
      this.currentUser = userData;
      this.updateAuthUI(userData);

      // Check if admin
      try {
        const userDoc = await firebase.firestore().collection('users').doc(user.uid).get();
        const userData_db = userDoc.data();
        if (userData_db && userData_db.role === 'admin') {
          window.location.href = 'admin.html';
          return;
        }
      } catch (adminErr) {
        console.log('[LOVARA] Admin check skipped:', adminErr.message);
      }

      this.closeModal('loginModal');
      this.showToast(this.t('welcome') + '!');
      form.reset();

    } catch (error) {
      console.error('[LOVARA] Login error:', error.code, error.message);
      let msg = error.message;

      // User-friendly error messages
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
        msg = 'Invalid email or password. Please try again.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        msg = 'Too many failed attempts. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        msg = 'Network error. Please check your internet connection.';
      } else if (error.code === 'auth/invalid-api-key') {
        msg = 'Authentication configuration error. Please contact support.';
      }

      this.showToast(msg, 'error');
    }
  },

  async handleSignup(e) {
    e.preventDefault();
    console.log('[LOVARA] Signup form submitted');

    const form = e.target;

    // Get all inputs from the signup form
    const textInputs = form.querySelectorAll('input[type="text"]');
    const firstName = textInputs[0]?.value || '';
    const lastName = textInputs[1]?.value || '';
    const emailInput = form.querySelector('input[type="email"]');
    const passwordInput = form.querySelector('input[type="password"]');

    if (!emailInput || !passwordInput) {
      console.error('[LOVARA] Signup form inputs not found');
      this.showToast('Form error: missing fields', 'error');
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    console.log('[LOVARA] Signup attempt for:', email);

    if (!email || !password) {
      this.showToast('Please fill in all fields', 'error');
      return;
    }

    // Check if Firebase is ready
    if (!this.firebaseReady || typeof firebase === 'undefined' || !firebase.auth) {
      console.error('[LOVARA] Firebase not ready for signup');
      this.showToast('Authentication service not ready. Please wait a moment and try again.', 'error');
      return;
    }

    try {
      await firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const result = await firebase.auth().createUserWithEmailAndPassword(email, password);
      const user = result.user;
      console.log('[LOVARA] Signup successful:', user.email);

      // Save to localStorage
      const userData = {
        uid: user.uid,
        email: user.email,
        displayName: (firstName + ' ' + lastName).trim() || user.email.split('@')[0],
        photoURL: user.photoURL
      };
      localStorage.setItem('lovara_user', JSON.stringify(userData));
      this.currentUser = userData;
      this.updateAuthUI(userData);

      // Save to Firestore
      try {
        await firebase.firestore().collection('users').doc(user.uid).set({
          email: email,
          firstName: firstName,
          lastName: lastName,
          role: 'user',
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (dbErr) {
        console.log('[LOVARA] Firestore save skipped:', dbErr.message);
      }

      this.closeModal('signupModal');
      this.showToast(this.t('toastDefault'));
      form.reset();

    } catch (error) {
      console.error('[LOVARA] Signup error:', error.code, error.message);
      let msg = error.message;

      if (error.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Please login instead.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (error.code === 'auth/weak-password') {
        msg = 'Password is too weak. Use at least 6 characters.';
      } else if (error.code === 'auth/network-request-failed') {
        msg = 'Network error. Please check your internet connection.';
      }

      this.showToast(msg, 'error');
    }
  },

  async handleForgot(e) {
    e.preventDefault();
    console.log('[LOVARA] Forgot password form submitted');

    const emailInput = document.getElementById('forgotEmail');

    if (!emailInput) {
      this.showToast('Form error', 'error');
      return;
    }

    const email = emailInput.value.trim();

    if (!email) {
      this.showToast('Please enter your email address', 'error');
      return;
    }

    if (!this.firebaseReady || typeof firebase === 'undefined' || !firebase.auth) {
      this.showToast('Authentication service not ready. Please wait a moment and try again.', 'error');
      return;
    }

    try {
      await firebase.auth().sendPasswordResetEmail(email);
      this.closeModal('forgotModal');
      this.showToast('Reset link sent to your email!');
      emailInput.value = '';
    } catch (error) {
      console.error('[LOVARA] Forgot password error:', error.code, error.message);
      let msg = error.message;

      if (error.code === 'auth/user-not-found') {
        msg = 'No account found with this email.';
      } else if (error.code === 'auth/invalid-email') {
        msg = 'Please enter a valid email address.';
      } else if (error.code === 'auth/network-request-failed') {
        msg = 'Network error. Please check your internet connection.';
      }

      this.showToast(msg, 'error');
    }
  },

  logout() {
    console.log('[LOVARA] Logout called');
    const uid = this.currentUser ? this.currentUser.uid : null;
    if (uid) this._onUserLogout(uid);
    localStorage.removeItem('lovara_user');
    this.currentUser = null;
    this.updateAuthUI(null);
    this.updateCartCount();
    this.updateWishlistCount();

    // Then try Firebase signout
    try {
      if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().signOut().then(() => {
          console.log('[LOVARA] Firebase signout successful');
          this.showToast('Logged out successfully');
        }).catch((error) => {
          console.error('[LOVARA] Firebase signout error:', error);
          this.showToast('Logged out successfully');
        });
      } else {
        this.showToast('Logged out successfully');
      }
    } catch (e) {
      console.error('[LOVARA] Logout error:', e);
      this.showToast('Logged out successfully');
    }
  },

  openLoginModal() {
    console.log('[LOVARA] Opening login modal');
    this.openModal('loginModal');
  },

  openSignupModal() {
    console.log('[LOVARA] Opening signup modal');
    this.openModal('signupModal');
  },

  // ==================== I18n ====================
  setupI18n() {
    // Skip on non-category pages (index.html has its own i18n system)
    if (!document.body.getAttribute('data-category')) {
      console.log('[LOVARA] Skipping CategoryApp i18n on non-category page');
      return;
    }

    const langBtn = document.getElementById('langBtn');
    const langDropdown = document.getElementById('langDropdown');

    if (langBtn) {
      langBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        langDropdown.classList.toggle('show');
      });
    }

    document.querySelectorAll('.lang-option').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setLang(btn.dataset.lang);
        langDropdown.classList.remove('show');
      });
    });

    document.addEventListener('click', () => {
      if (langDropdown) langDropdown.classList.remove('show');
    });

    this.applyLang(this.currentLang);
  },

  setLang(lang) {
    this.currentLang = lang;
    localStorage.setItem('lovara_lang', lang);
    this.applyLang(lang);
  },

  applyLang(lang) {
    const t = this.translations[lang];
    const html = document.getElementById('htmlRoot');
    const body = document.body;
    const langLabel = document.getElementById('langLabel');

    if (html) {
      html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      html.setAttribute('lang', lang);
    }
    if (langLabel) langLabel.textContent = lang === 'ar' ? 'AR' : 'EN';

    if (lang === 'ar') {
      body.classList.add('lang-ar');
      body.classList.remove('lang-en');
    } else {
      body.classList.add('lang-en');
      body.classList.remove('lang-ar');
    }

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (t[key]) {
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          if (el.getAttribute('type') !== 'email' && el.getAttribute('type') !== 'password') {
            el.value = t[key];
          }
        } else if (el.tagName === 'OPTION') {
          el.textContent = t[key];
        } else {
          el.innerHTML = t[key];
        }
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (t[key]) el.placeholder = t[key];
    });

    const category = document.body.getAttribute('data-category');
    const titleMap = {
      dresses: 'pageTitleDresses', tops: 'pageTitleTops', pants: 'pageTitlePants',
      accessories: 'pageTitleAccessories', sets: 'pageTitleSets', lingerie: 'pageTitleLingerie'
    };
    const titleKey = titleMap[category];
    if (titleKey && t[titleKey]) {
      document.title = t[titleKey];
    }
  },

  t(key) {
    return this.translations[this.currentLang][key] || key;
  },

  // ==================== CART ====================
  setupCart() {
    // Listen for storage changes from other pages
    window.addEventListener('storage', (e) => {
      if (e.key === 'lovara_cart') {
        this.loadCart();
        this.updateCartCount();
        if (document.getElementById('cartModal')?.classList.contains('show')) {
          this.renderCart();
        }
      }
      if (e.key === 'lovara_wishlist') {
        this.loadWishlist();
        this.updateWishlistCount();
      }
    });
  },

  addToCart(product, size, color) {
    const existing = this.cart.find(item => 
      item.id === product.id && item.size === size && item.color === color
    );

    if (existing) {
      existing.quantity = ((existing.quantity || existing.qty) || 1) + 1;
      existing.qty = existing.quantity;
    } else {
      this.cart.push({
        id: product.id,
        name: product.name,
        price: parseFloat(product.price) || 0,
        imageUrl: product.imageUrl || product.image || '',
        image: product.image || product.imageUrl || '',
        size: size,
        color: color,
        quantity: 1,
        qty: 1
      });
    }

    this.saveCart();
    this.updateCartCount();
    this.showToast(this.t('addToCart') + ' ✓');
  },

  removeFromCart(index) {
    console.log('[LOVARA] removeFromCart called:', index);
    if (index < 0 || index >= this.cart.length) {
      console.warn('[LOVARA] Invalid cart index:', index);
      return;
    }
    this.cart.splice(index, 1);
    this.saveCart();
    this.updateCartCount();
    this.renderCart();
    console.log('[LOVARA] Item removed, cart now has', this.cart.length, 'items');
  },

  updateQty(index, delta) {
    console.log('[LOVARA] updateQty called:', index, delta);
    if (!this.cart[index]) {
      console.warn('[LOVARA] Cart item not found at index', index);
      return;
    }
    const currentQty = (this.cart[index].quantity || this.cart[index].qty) || 1;
    const newQty = currentQty + delta;
    if (newQty <= 0) {
      this.removeFromCart(index);
      return;
    }
    this.cart[index].quantity = newQty;
    this.cart[index].qty = newQty;
    this.saveCart();
    this.updateCartCount();
    this.renderCart();
    console.log('[LOVARA] Qty updated from', currentQty, 'to', newQty);
  },

  clearCart() {
    this.cart = [];
    this.saveCart();
    this.updateCartCount();
    this.renderCart();
  },

  saveCart() {
    localStorage.setItem('lovara_cart', JSON.stringify(this.cart));
  },

  updateCartCount() {
    const count = this.cart.reduce((sum, item) => sum + ((item.quantity || item.qty) || 1), 0);
    const cartCount = document.getElementById('cartCount');
    if (cartCount) cartCount.textContent = count;
  },

  renderCart() {
    const cartItems = document.getElementById('cartItems');
    const cartEmpty = document.getElementById('cartEmpty');
    const cartTotal = document.getElementById('cartTotal');
    const cartFooter = document.querySelector('.cart-modal-footer');

    if (!cartItems) {
      console.warn('[LOVARA] cartItems element not found');
      return;
    }

    if (this.cart.length === 0) {
      cartItems.innerHTML = '';
      cartItems.style.display = 'none';
      if (cartEmpty) cartEmpty.style.display = 'flex';
      if (cartTotal) cartTotal.textContent = '0.00';
      if (cartFooter) cartFooter.style.display = 'none';
      return;
    }

    cartItems.style.display = 'block';
    if (cartEmpty) cartEmpty.style.display = 'none';
    if (cartFooter) cartFooter.style.display = 'block';

    cartItems.innerHTML = this.cart.map((item, index) => {
      const price = parseFloat(item.price) || 0;
      const qty = (item.quantity || item.qty) || 1;
      const image = item.imageUrl || item.image || 'https://via.placeholder.com/80x100?text=LOVARA';
      const name = item.name || 'Unknown Product';
      const size = item.size;
      const color = item.color;
      const variantHtml = (size || color)
        ? `<p class="cart-item-variant">${size ? '<span class="v-label">Size:</span> <span class="v-val">' + size + '</span>' : ''}${size && color ? '<span class="v-sep">|</span>' : ''}${color ? '<span class="v-label">Color:</span> <span class="v-val">' + color + '</span>' : ''}</p>`
        : '';
      return `
      <div class="cart-item" data-cart-index="${index}">
        <img src="${image}" alt="${name}" class="cart-item-img" onerror="this.src='https://via.placeholder.com/80x100?text=LOVARA'">
        <div class="cart-item-info">
          <p class="cart-item-name">${name}</p>
          ${variantHtml}
          <p class="cart-item-price">EGP ${price.toFixed(2)}</p>
          <div class="cart-item-qty">
            <button class="qty-btn" data-action="minus" data-index="${index}" type="button">-</button>
            <span>${qty}</span>
            <button class="qty-btn" data-action="plus" data-index="${index}" type="button">+</button>
          </div>
        </div>
        <button class="cart-item-remove" data-action="remove" data-index="${index}" type="button">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `}).join('');

    const total = this.cart.reduce((sum, item) => sum + (item.price * ((item.quantity || item.qty) || 1)), 0);
    if (cartTotal) cartTotal.textContent = total.toFixed(2);
  },

  openCartModal() {
    const isLoggedIn = this.currentUser || localStorage.getItem('lovara_user');
    if (!isLoggedIn) {
      this.showToast(this.currentLang === 'ar' ? 'يرجى تسجيل الدخول أولاً لعرض السلة' : 'Please login first to view your cart');
      console.log('[LOVARA] Cart blocked — opening login modal');
      this.openLoginModal();
      return;
    }
    this.renderCart();
    const modal = document.getElementById('cartModal');
    const overlay = document.getElementById('cartOverlay');
    if (modal) { modal.classList.add('show'); modal.classList.add('active'); }
    if (overlay) { overlay.classList.add('show'); overlay.classList.add('active'); }
    document.body.style.overflow = 'hidden';
  },

  closeCartModal() {
    const modal = document.getElementById('cartModal');
    const overlay = document.getElementById('cartOverlay');
    if (modal) { modal.classList.remove('show'); modal.classList.remove('active'); }
    if (overlay) { overlay.classList.remove('show'); overlay.classList.remove('active'); }
    document.body.style.overflow = '';
  },

  checkout() {
    if (this.cart.length === 0) {
      this.showToast(this.currentLang === 'ar' ? 'السلة فارغة!' : 'Your cart is empty!');
      return;
    }
    // Redirect to checkout page
    window.location.href = 'checkout.html';
  },

  // ==================== WISHLIST ====================
  setupWishlist() {
    // Clean up invalid wishlist items (from other pages or corrupted data)
    this.cleanupWishlist();
  },

  cleanupWishlist() {
    const originalLength = this.wishlist.length;
    // Remove items without required fields
    this.wishlist = this.wishlist.filter(item => {
      return item && item.id && item.name && item.price !== undefined && item.price !== null;
    });
    // Ensure all prices are numbers
    this.wishlist.forEach(item => {
      item.price = parseFloat(item.price) || 0;
    });
    if (this.wishlist.length !== originalLength) {
      console.log('[LOVARA] Cleaned up wishlist:', originalLength - this.wishlist.length, 'invalid items removed');
      this.saveWishlist();
      this.updateWishlistCount();
    }
  },

  toggleWishlist(product) {
    if (!product || !product.id) {
      console.error('[LOVARA] Invalid product for wishlist:', product);
      return;
    }
    const index = this.wishlist.findIndex(item => item.id === product.id);
    if (index > -1) {
      this.wishlist.splice(index, 1);
      this.showToast('Removed from wishlist');
    } else {
      // Ensure product has all required fields
      const wishlistItem = {
        id: product.id,
        name: product.name || 'Unknown Product',
        price: parseFloat(product.price) || 0,
        imageUrl: product.imageUrl || product.image || '',
        image: product.image || product.imageUrl || '',
        size: product.size || null,
        color: product.color || null
      };
      this.wishlist.push(wishlistItem);
      this.showToast('Added to wishlist ♥');
    }
    this.saveWishlist();
    this.updateWishlistCount();
  },

  isInWishlist(productId) {
    return this.wishlist.some(item => item && item.id === productId);
  },

  removeFromWishlist(index) {
    this.wishlist.splice(index, 1);
    this.saveWishlist();
    this.updateWishlistCount();
    this.renderWishlist();
  },

  moveToCart(index) {
    const item = this.wishlist[index];
    this.addToCart(item, item.size, item.color);
    this.removeFromWishlist(index);
  },

  buyNowFromWishlist(index) {
    const item = this.wishlist[index];
    this.addToCart(item, item.size, item.color);
    window.location.href = 'checkout.html';
  },

  saveWishlist() {
    localStorage.setItem('lovara_wishlist', JSON.stringify(this.wishlist));
  },

  updateWishlistCount() {
    const count = this.wishlist.length;
    const wishlistCount = document.getElementById('wishlistCount');
    if (wishlistCount) {
      wishlistCount.textContent = count;
      wishlistCount.style.display = count > 0 ? 'flex' : 'none';
    }
  },

  renderWishlist() {
    const wishlistItems = document.getElementById('wishlistItems');
    const wishlistEmpty = document.getElementById('wishlistEmpty');

    if (!wishlistItems) return;

    if (this.wishlist.length === 0) {
      wishlistItems.innerHTML = '';
      if (wishlistEmpty) wishlistEmpty.style.display = 'flex';
      return;
    }

    if (wishlistEmpty) wishlistEmpty.style.display = 'none';

    wishlistItems.innerHTML = this.wishlist.map((item, index) => {
      const price = parseFloat(item.price) || 0;
      const image = item.imageUrl || item.image || 'https://via.placeholder.com/80x100?text=LOVARA';
      const name = item.name || 'Unknown Product';
      const size = item.size;
      const color = item.color;
      const variantHtml = (size || color) ? `<p class="wishlist-item-variant">${size ? 'Size: ' + size : ''}${size && color ? ' · ' : ''}${color ? 'Color: ' + color : ''}</p>` : '';
      return `
      <div class="wishlist-item">
        <img src="${image}" alt="${name}" class="wishlist-item-img" onerror="this.src='https://via.placeholder.com/80x100?text=LOVARA'">
        <div class="wishlist-item-info">
          <p class="wishlist-item-name">${name}</p>
          ${variantHtml}
          <p class="wishlist-item-price">EGP ${price.toFixed(2)}</p>
          <div class="wishlist-item-actions">
            <button class="wishlist-add-cart" onclick="CategoryApp.moveToCart(${index})">
              <i class="fas fa-shopping-bag"></i> ${this.t('addToCart')}
            </button>
            <button class="wishlist-buy-now" onclick="CategoryApp.buyNowFromWishlist(${index})">
              <i class="fas fa-bolt"></i> ${this.t('buyNow')}
            </button>
          </div>
        </div>
        <button class="wishlist-item-remove" onclick="CategoryApp.removeFromWishlist(${index})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    `}).join('');
  },

  openWishlistModal() {
    const isLoggedIn = this.currentUser || localStorage.getItem('lovara_user');
    if (!isLoggedIn) {
      this.showToast(this.currentLang === 'ar' ? 'يرجى تسجيل الدخول أولاً لعرض المفضلة' : 'Please login first to view your wishlist');
      console.log('[LOVARA] Wishlist blocked — opening login modal');
      this.openLoginModal();
      return;
    }
    console.log('[LOVARA] Opening wishlist modal. Items:', this.wishlist.length);
    try {
      this.cleanupWishlist();
      this.renderWishlist();
      const modal = document.getElementById('wishlistModal');
      const overlay = document.getElementById('wishlistOverlay');
      if (modal) modal.classList.add('show');
      if (overlay) overlay.classList.add('show');
      document.body.style.overflow = 'hidden';
    } catch (e) {
      console.error('[LOVARA] Error opening wishlist:', e);
      this.showToast('Error opening wishlist. Please refresh.', 'error');
    }
  },

  closeWishlistModal() {
    const modal = document.getElementById('wishlistModal');
    const overlay = document.getElementById('wishlistOverlay');
    if (modal) modal.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
    document.body.style.overflow = '';
  },

  // ==================== PRODUCTS ====================
  async loadProducts() {
    const grid = document.getElementById('productsGrid');
    const loading = document.getElementById('productsLoading');
    const emptyState = document.getElementById('emptyState');
    const category = document.body.getAttribute('data-category');

    if (!grid) return;

    // If another script (e.g., products-loader.js) already rendered cards, collect from DOM and skip
    const existingCards = grid.querySelectorAll('.product-card');
    if (existingCards.length > 0) {
      console.log('[LOVARA] Products already rendered (' + existingCards.length + ' cards), collecting from DOM');
      this.collectProductsFromDOM();
      if (loading) loading.style.display = 'none';
      if (emptyState) emptyState.style.display = 'none';
      return;
    }

    if (loading) loading.style.display = 'flex';
    if (emptyState) emptyState.style.display = 'none';

    try {
      if (typeof firebase !== 'undefined' && firebase.firestore) {
        const db = firebase.firestore();
        let query = category 
          ? db.collection('products').where('category', '==', category)
          : db.collection('products');
        const snapshot = await query.get();
        this.products = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      } else {
        this.products = [];
      }

      if (loading) loading.style.display = 'none';

      if (this.products.length === 0) {
        if (emptyState) emptyState.style.display = 'flex';
      } else {
        if (emptyState) emptyState.style.display = 'none';
        this.products.forEach(product => {
          const card = this.createProductCard(product);
          if (loading && loading.parentNode === grid) {
            grid.insertBefore(card, loading);
          } else {
            grid.appendChild(card);
          }
        });
      }
    } catch (error) {
      console.error('Error loading products:', error);
      if (loading) loading.style.display = 'none';
      if (emptyState) emptyState.style.display = 'flex';
    }
  },

  collectProductsFromDOM() {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    const cards = grid.querySelectorAll('.product-card');
    this.products = Array.from(cards).map(card => {
      const id = card.getAttribute('data-product-id');
      const nameEl = card.querySelector('.product-name, .product-title, h3, h4');
      const priceEl = card.querySelector('.product-price');
      const imgEl = card.querySelector('.product-img, img');
      const badgeEl = card.querySelector('.product-badge');
      let price = 0;
      if (priceEl) {
        const text = priceEl.textContent.replace(/[^0-9.]/g, '');
        price = parseFloat(text) || 0;
      }
      return {
        id: id,
        name: nameEl ? nameEl.textContent.trim() : 'Unknown',
        price: price,
        imageUrl: imgEl ? imgEl.src : '',
        image: imgEl ? imgEl.src : '',
        badge: badgeEl ? badgeEl.textContent.trim() : ''
      };
    }).filter(p => p.id);
    console.log('[LOVARA] Collected', this.products.length, 'products from DOM');
  },

  setupProductCardDelegation() {
    document.addEventListener('click', (e) => {
      const card = e.target.closest('.product-card');
      if (!card) return;
      const productId = card.getAttribute('data-product-id');
      if (!productId) return;

      let product = this.products.find(p => p.id === productId);
      if (!product && window.carouselState && window.carouselState.products) {
        product = window.carouselState.products.find(p => p.id === productId);
      }
      // DOM fallback
      if (!product) {
        const card = document.querySelector(`[data-product-id="${productId}"]`);
        if (card) {
          const nameEl = card.querySelector('.product-name, .product-title, h3, h4');
          const priceEl = card.querySelector('.product-price');
          const imgEl = card.querySelector('.product-img, img');
          let price = 0;
          if (priceEl) {
            const m = priceEl.textContent.match(/[0-9]+(?:\.[0-9]+)?/);
            if (m) price = parseFloat(m[0]) || 0;
          }
          product = {
            id: productId,
            name: nameEl ? nameEl.textContent.trim() : 'Unknown',
            price: price,
            imageUrl: imgEl ? imgEl.getAttribute('src') || imgEl.src : '',
            image: imgEl ? imgEl.getAttribute('src') || imgEl.src : ''
          };
        }
      }
      if (!product) {
        console.warn('[LOVARA] Product not found for delegation:', productId);
        return;
      }

      // Add to Cart
      if (e.target.closest('.add-to-cart, .btn-add-cart')) {
        e.preventDefault();
        e.stopPropagation();
        if ((product.sizes && product.sizes.length > 0) || (product.colors && product.colors.length > 0)) {
          this.openBuyNowModal(product, false);
        } else {
          this.addToCart(product, null, null);
        }
        return;
      }

      // Buy Now
      if (e.target.closest('.btn-buy-now')) {
        e.preventDefault();
        e.stopPropagation();
        this.openBuyNowModal(product, true);
        return;
      }

      // Wishlist
      if (e.target.closest('.product-wishlist, .wishlist-btn')) {
        e.preventDefault();
        e.stopPropagation();
        this.toggleWishlist(product);
        const btn = card.querySelector('.product-wishlist, .wishlist-btn');
        if (btn) btn.classList.toggle('active');
        return;
      }

      // Share
      if (e.target.closest('.btn-share, .share-btn')) {
        e.preventDefault();
        e.stopPropagation();
        this.shareProduct(productId);
        return;
      }
    });
    console.log('[LOVARA] Product card delegation setup complete');
  },

  createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    card.setAttribute('data-category', product.category || '');
    card.setAttribute('data-product-id', product.id || '');

    const badgeHtml = product.badge ? `<div class="product-badge">${product.badge}</div>` : '';
    const oldPriceHtml = product.oldPrice ? `<span class="old-price">EGP ${product.oldPrice.toFixed(2)}</span>` : '';
    const sizesHtml = product.sizes ? product.sizes.map(s => `<span class="product-size-tag">${s}</span>`).join('') : '';
    const colorsHtml = product.colors ? product.colors.map(c => `<span class="product-color-tag" style="background:${c};color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.3)">${c}</span>`).join('') : '';
    const isWished = this.isInWishlist(product.id);

    card.innerHTML = `
      <div class="product-img-wrap">
        <img src="${product.imageUrl || 'https://via.placeholder.com/300x400?text=LOVARA'}" alt="${product.name}" class="product-img" loading="lazy" onerror="this.src='https://via.placeholder.com/300x400?text=LOVARA'">
        ${badgeHtml}
        <button class="product-wishlist ${isWished ? 'active' : ''}" aria-label="Add to wishlist" onclick="CategoryApp.handleWishlistClick('${product.id}')">
          <i class="fas fa-heart"></i>
        </button>
      </div>
      <div class="product-info">
        <h4 class="product-name">${product.name}</h4>
        <p class="product-price">EGP ${product.price ? (parseFloat(product.price) || 0).toFixed(2) : '0.00'} ${oldPriceHtml}</p>
        ${sizesHtml ? `<div class="product-sizes"><span class="product-meta-label">${this.t('size')}:</span>${sizesHtml}</div>` : ''}
        ${colorsHtml ? `<div class="product-colors"><span class="product-meta-label">${this.t('color')}:</span>${colorsHtml}</div>` : ''}
        <div class="product-actions">
          <button class="add-to-cart" onclick="CategoryApp.handleAddToCart('${product.id}')">
            <i class="fas fa-bag-shopping"></i> ${this.t('addToCart')}
          </button>
          <button class="btn-buy-now" onclick="CategoryApp.handleBuyNow('${product.id}')">
            <i class="fas fa-bolt"></i> ${this.t('buyNow')}
          </button>
          <button class="btn-share" onclick="CategoryApp.shareProduct('${product.id}')" aria-label="Share">
            <i class="fas fa-share-nodes"></i>
          </button>
        </div>
      </div>
    `;

    return card;
  },

  handleWishlistClick(productId) {
    let product = this.products.find(p => p.id === productId);
    if (!product && window.carouselState && window.carouselState.products) {
      product = window.carouselState.products.find(p => p.id === productId);
    }
    if (product) {
      this.toggleWishlist(product);
    } else {
      console.warn('[LOVARA] Product not found for wishlist:', productId);
    }
    const btn = document.querySelector(`[data-product-id="${productId}"] .product-wishlist`);
    if (btn) btn.classList.toggle('active');
  },

  handleAddToCart(productId) {
    let product = this.products.find(p => p.id === productId);
    // Fallback: try carouselState (index.html products-loader.js)
    if (!product && window.carouselState && window.carouselState.products) {
      product = window.carouselState.products.find(p => p.id === productId);
    }
    if (!product) return;
    if ((product.sizes && product.sizes.length > 0) || (product.colors && product.colors.length > 0)) {
      this.openBuyNowModal(product);
    } else {
      this.addToCart(product, null, null);
    }
  },

  handleBuyNow(productId) {
    let product = this.products.find(p => p.id === productId);
    if (!product && window.carouselState && window.carouselState.products) {
      product = window.carouselState.products.find(p => p.id === productId);
    }
    if (!product) return;
    this.openBuyNowModal(product, true);
  },

  openBuyNowModal(product, isDirectBuy = false) {
    const existing = document.getElementById('buyNowModal');
    if (existing) existing.remove();

    const sizesHtml = product.sizes ? product.sizes.map((s, i) => `
      <label class="buy-now-option">
        <input type="radio" name="buySize" value="${s}" ${i === 0 ? 'checked' : ''}>
        <span>${s}</span>
      </label>
    `).join('') : '';

    const colorsHtml = product.colors ? product.colors.map((c, i) => `
      <label class="buy-now-option">
        <input type="radio" name="buyColor" value="${c}" ${i === 0 ? 'checked' : ''}>
        <span style="background:${c};color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.3)">${c}</span>
      </label>
    `).join('') : '';

    const modal = document.createElement('div');
    modal.id = 'buyNowModal';
    modal.className = 'buy-now-modal';
    modal.innerHTML = `
      <div class="buy-now-overlay" onclick="CategoryApp.closeBuyNowModal()"></div>
      <div class="buy-now-content">
        <button class="buy-now-close" onclick="CategoryApp.closeBuyNowModal()">
          <i class="fas fa-times"></i>
        </button>
        <div class="buy-now-product">
          <img src="${product.imageUrl || 'https://via.placeholder.com/80x100?text=LOVARA'}" alt="${product.name}" onerror="this.src='https://via.placeholder.com/80x100?text=LOVARA'">
          <div class="buy-now-product-info">
            <h3>${product.name}</h3>
            <p class="buy-now-price">EGP ${product.price ? (parseFloat(product.price) || 0).toFixed(2) : '0.00'}</p>
          </div>
        </div>
        ${sizesHtml ? `
          <div class="buy-now-section">
            <label class="buy-now-label">${this.t('selectSize')}</label>
            <div class="buy-now-options">${sizesHtml}</div>
          </div>
        ` : ''}
        ${colorsHtml ? `
          <div class="buy-now-section">
            <label class="buy-now-label">${this.t('selectColor')}</label>
            <div class="buy-now-options">${colorsHtml}</div>
          </div>
        ` : ''}
        <button class="buy-now-btn" onclick="CategoryApp.confirmBuyNow('${product.id}', ${isDirectBuy})">
          <i class="fas fa-${isDirectBuy ? 'bolt' : 'bag-shopping'}"></i>
          ${isDirectBuy ? this.t('buyNow') : this.t('addToCart')}
        </button>
      </div>
    `;

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add('show'));
  },

  closeBuyNowModal() {
    const modal = document.getElementById('buyNowModal');
    if (modal) {
      modal.classList.remove('show');
      setTimeout(() => modal.remove(), 300);
    }
  },

  confirmBuyNow(productId, isDirectBuy) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    const sizeEl = document.querySelector('input[name="buySize"]:checked');
    const colorEl = document.querySelector('input[name="buyColor"]:checked');
    const size = sizeEl ? sizeEl.value : null;
    const color = colorEl ? colorEl.value : null;

    this.closeBuyNowModal();

    if (isDirectBuy) {
      this.addToCart(product, size, color);
      window.location.href = 'checkout.html';
    } else {
      this.addToCart(product, size, color);
    }
  },

  shareProduct(productId) {
    let product = this.products.find(p => p.id === productId);
    if (!product && window.carouselState && window.carouselState.products) {
      product = window.carouselState.products.find(p => p.id === productId);
    }
    if (!product) return;

    const shareData = {
      title: product.name,
      text: `Check out ${product.name} on LOVARA!`,
      url: window.location.href
    };

    if (navigator.share) {
      navigator.share(shareData);
    } else {
      navigator.clipboard.writeText(window.location.href);
      this.showToast('Link copied to clipboard!');
    }
  },

  // ==================== UI HELPERS ====================
  setupCartDelegation() {
    const cartModal = document.getElementById('cartModal');
    if (!cartModal) {
      console.warn('[LOVARA] cartModal not found for delegation');
      return;
    }
    if (cartModal._cartDelegationSet) {
      console.log('[LOVARA] Cart delegation already set, skipping');
      return;
    }
    cartModal._cartDelegationSet = true;
    cartModal.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const index = parseInt(btn.getAttribute('data-index'), 10);
      if (isNaN(index)) return;

      console.log('[LOVARA] Cart delegation:', action, index);

      if (action === 'minus') {
        e.preventDefault();
        e.stopPropagation();
        this.updateQty(index, -1);
      } else if (action === 'plus') {
        e.preventDefault();
        e.stopPropagation();
        this.updateQty(index, 1);
      } else if (action === 'remove') {
        e.preventDefault();
        e.stopPropagation();
        this.removeFromCart(index);
      }
    });
    console.log('[LOVARA] Cart delegation setup complete');
  },

  setupMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const mobileOverlay = document.getElementById('mobileOverlay');

    if (hamburger) {
      hamburger.addEventListener('click', () => {
        navLinks.classList.toggle('show');
        mobileOverlay.classList.toggle('show');
      });
    }

    if (mobileOverlay) {
      mobileOverlay.addEventListener('click', () => {
        navLinks.classList.remove('show');
        mobileOverlay.classList.remove('show');
      });
    }

    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        navLinks.classList.remove('show');
        mobileOverlay.classList.remove('show');
      });
    });
  },

  setupBackToTop() {
    const btn = document.getElementById('backToTop');
    if (!btn) return;

    window.addEventListener('scroll', () => {
      if (window.scrollY > 500) {
        btn.classList.add('show');
      } else {
        btn.classList.remove('show');
      }
    });

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  },

  setupSupportForm() {
    const form = document.getElementById('supportForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (this.currentLang === 'ar' ? 'جاري الإرسال...' : 'Sending...');
      btn.disabled = true;
      try {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data._subject = '🆘 New Support Request from LOVARA Website';
        data._template = 'table';
        data._replyto = data.email || 'no-reply@lovara.com';
        const response = await fetch('https://formsubmit.co/ajax/lovarafashon@gmail.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
          this.showToast(this.t('formSubmit') + ' ✓');
          form.reset();
        } else {
          this.showToast(result.message || (this.currentLang === 'ar' ? 'فشل الإرسال. حاولي مرة أخرى.' : 'Failed to send. Please try again.'), 'error');
        }
      } catch (err) {
        this.showToast(this.currentLang === 'ar' ? 'خطأ في الاتصال. حاولي مرة أخرى.' : 'Network error. Please try again.', 'error');
      }
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    });
  },

  setupNewsletterForm() {
    const form = document.getElementById('newsletterForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type="submit"]');
      const originalHTML = btn.innerHTML;
      btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      btn.disabled = true;
      try {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        data._subject = '📰 New Newsletter Subscription - LOVARA';
        data._template = 'table';
        data._replyto = data.email || 'no-reply@lovara.com';
        const response = await fetch('https://formsubmit.co/ajax/lovarafashon@gmail.com', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await response.json();
        if (response.ok) {
          this.showToast('Subscribed successfully!');
          form.reset();
        } else {
          this.showToast(result.message || 'Failed to subscribe. Please try again.', 'error');
        }
      } catch (err) {
        this.showToast('Network error. Please try again.', 'error');
      }
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    });
  },

  showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = message;

    const icon = toast.querySelector('i');
    if (icon) {
      if (type === 'error') {
        icon.className = 'fas fa-exclamation-circle';
        icon.style.color = '#e74c3c';
      } else {
        icon.className = 'fas fa-check-circle';
        icon.style.color = '#4CAF50';
      }
    }

    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }
};

// ==================== PASSWORD TOGGLE ====================
function togglePassword(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

// ==================== INITIALIZE ====================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => CategoryApp.init());
} else {
  CategoryApp.init();
}

// Ensure global access
window.CategoryApp = CategoryApp;