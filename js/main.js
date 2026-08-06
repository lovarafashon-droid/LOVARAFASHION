// ============================================
// LOVARA - main.js
// Core functionality
// ============================================

const App = {
  init() {
    this.setupNavbar();
    this.setupMobileMenu();
    this.setupSmoothScroll();
    this.setupBackToTop();
    this.setupScrollReveal();
    this.setupContactForm();
    this.setupNewsletterForm();
    this.setupPasswordToggle();
    this.setupForgotPassword();
  },

  // Navbar scroll effect
  setupNavbar() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  },

  // Mobile menu
  setupMobileMenu() {
    const hamburger = document.getElementById('hamburger');
    const navLinks = document.getElementById('navLinks');
    const mobileOverlay = document.getElementById('mobileOverlay');

    if (!hamburger || !navLinks) return;

    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      navLinks.classList.toggle('open');
      if (mobileOverlay) mobileOverlay.classList.toggle('show');
    });

    if (mobileOverlay) {
      mobileOverlay.addEventListener('click', () => {
        hamburger.classList.remove('open');
        navLinks.classList.remove('open');
        mobileOverlay.classList.remove('show');
      });
    }

    // Close menu when clicking a link
    navLinks.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        hamburger.classList.remove('open');
        navLinks.classList.remove('open');
        if (mobileOverlay) mobileOverlay.classList.remove('show');
      });
    });
  },

  // Smooth scroll for anchor links
  setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (href === '#') return;
        
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  },

  // Back to top button
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

  // Scroll reveal animation
  setupScrollReveal() {
    const reveals = document.querySelectorAll('.reveal');
    if (!reveals.length) return;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    }, { threshold: 0.1 });

    reveals.forEach(el => observer.observe(el));
  },

  // Contact form
  setupContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.showToast('Message sent successfully!');
      form.reset();
    });
  },

  // Newsletter form
  setupNewsletterForm() {
    const form = document.getElementById('newsletterForm');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const success = document.getElementById('newsletterSuccess');
      if (success) success.classList.add('show');
      form.reset();
      setTimeout(() => {
        if (success) success.classList.remove('show');
      }, 4000);
    });
  },

  // Password visibility toggle
  setupPasswordToggle() {
    window.togglePassword = function(inputId) {
      const input = document.getElementById(inputId);
      const btn = input?.nextElementSibling?.querySelector('i');
      if (!input) return;
      
      if (input.type === 'password') {
        input.type = 'text';
        if (btn) btn.className = 'fas fa-eye-slash';
      } else {
        input.type = 'password';
        if (btn) btn.className = 'fas fa-eye';
      }
    };
  },

  // Forgot password modal
  setupForgotPassword() {
    const forgotLink = document.getElementById('forgotLink');
    const forgotModal = document.getElementById('forgotModal');
    const closeForgot = document.getElementById('closeForgot');
    const switchToLoginFromForgot = document.getElementById('switchToLoginFromForgot');
    const forgotForm = document.getElementById('forgotForm');

    if (forgotLink && forgotModal) {
      forgotLink.addEventListener('click', (e) => {
        e.preventDefault();
        document.getElementById('loginModal')?.classList.remove('show');
        forgotModal.classList.add('show');
      });
    }

    if (closeForgot) {
      closeForgot.addEventListener('click', () => {
        forgotModal.classList.remove('show');
      });
    }

    if (switchToLoginFromForgot) {
      switchToLoginFromForgot.addEventListener('click', () => {
        forgotModal.classList.remove('show');
        document.getElementById('loginModal')?.classList.add('show');
      });
    }

    if (forgotForm) {
      forgotForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.showToast('Reset link sent to your email!');
        forgotModal.classList.remove('show');
      });
    }
  },

  // Toast notification
  showToast(message) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toastMsg');
    if (!toast || !toastMsg) return;
    
    toastMsg.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }
};

// Initialize app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.init());
} else {
  App.init();
}