(function () {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit');
  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');

  let busy = false;
  let leaving = false;

  function showError(message) {
    errorEl.textContent = message || '';
  }

  function resetButton() {
    if (leaving) return;
    busy = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }

  function friendlyAuthError(err) {
    const code = String(err?.code || '');
    const msg = String(err?.message || err || '');
    const combined = `${code} ${msg}`.toLowerCase();

    if (
      combined.includes('invalid-credential') ||
      combined.includes('wrong-password') ||
      combined.includes('user-not-found') ||
      combined.includes('invalid_login_credentials') ||
      combined.includes('invalid_password') ||
      combined.includes('user_not_found')
    ) {
      return 'Wrong email or password.';
    }
    if (combined.includes('unauthorized-domain')) {
      return `Add “${window.location.hostname}” in Firebase → Authentication → Settings → Authorized domains, then try again.`;
    }
    if (combined.includes('too-many-requests') || combined.includes('too_many_attempts')) {
      return 'Too many attempts. Wait a moment and try again.';
    }
    if (
      combined.includes('network-request-failed') ||
      combined.includes('failed to fetch') ||
      combined.includes('networkerror')
    ) {
      return 'Network error reaching Firebase. Check your connection.';
    }
    if (combined.includes('invalid-email')) {
      return 'Enter a valid email address.';
    }
    if (combined.includes('abort')) {
      return '';
    }
    if (code) return `Sign-in failed (${code.replace(/^auth\//, '')}).`;
    return 'Sign-in failed. Please try again.';
  }

  if (!window.SLEEK_FIREBASE_CONFIG?.apiKey) {
    showError('Firebase config missing.');
    return;
  }

  if (!window.firebase?.apps) {
    showError('Firebase SDK failed to load. Check your internet connection / firewall.');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.SLEEK_FIREBASE_CONFIG);
  }

  const auth = firebase.auth();

  // Only auto-redirect if a session already exists when the page first loads
  const unsubBoot = auth.onAuthStateChanged((user) => {
    unsubBoot();
    if (user && !busy) {
      leaving = true;
      window.location.replace('./index.html');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || leaving) return;

    showError('');
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showError('Enter email and password.');
      return;
    }

    busy = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    try {
      await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
      const cred = await auth.signInWithEmailAndPassword(email, password);
      if (!cred?.user) throw new Error('Sign-in failed.');

      // Ensure token/session is written before leaving this page
      await cred.user.getIdToken(true);

      leaving = true;
      window.location.assign('./index.html');
    } catch (err) {
      console.error(err);
      if (leaving) return;
      const message = friendlyAuthError(err);
      if (message) showError(message);
      resetButton();
    }
  });
})();
