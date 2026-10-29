import { firebaseConfig, isFirebaseConfigured } from '../../js/firebase/config.js';

function friendlyAuthError(err) {
  const code = String(err?.code || err?.message || '');
  if (
    code.includes('USER_NOT_FOUND') ||
    code.includes('INVALID_PASSWORD') ||
    code.includes('INVALID_LOGIN_CREDENTIALS') ||
    code.includes('user-not-found') ||
    code.includes('invalid-credential') ||
    code.includes('wrong-password')
  ) {
    return 'Wrong email or password.';
  }
  if (code.includes('TOO_MANY_ATTEMPTS') || code.includes('too-many-requests')) {
    return 'Too many attempts. Wait a moment and try again.';
  }
  if (code.includes('network') || code.includes('Failed to fetch')) {
    return 'Network error reaching Firebase. Check your internet connection.';
  }
  return err?.message || 'Sign-in failed.';
}

async function signInWithPasswordRest(email, password) {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    }
  );
  const data = await response.json();
  if (data.error) {
    const error = new Error(data.error.message || 'Sign-in failed');
    error.code = data.error.message;
    throw error;
  }
  return data;
}

async function loadAuthSdk() {
  const { initializeApp, getApps } = await import(
    'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js'
  );
  const { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } = await import(
    'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js'
  );

  const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  const auth = getAuth(app);
  return { auth, signInWithEmailAndPassword, onAuthStateChanged, signOut };
}

export function initAuth({ onReady, onSignedOut }) {
  const loginScreen = document.getElementById('login-screen');
  const appShell = document.getElementById('app');
  const form = document.getElementById('login-form');
  const error = document.getElementById('login-error');
  const hint = document.getElementById('config-hint');
  const logoutBtn = document.getElementById('logout-btn');

  if (!isFirebaseConfigured()) {
    hint.hidden = false;
    hint.textContent = 'Firebase config missing in js/firebase/config.js';
    error.textContent = 'Firebase is not configured.';
    return;
  }

  const authReady = loadAuthSdk()
    .then((mod) => {
      mod.onAuthStateChanged(mod.auth, (user) => {
        if (user) {
          loginScreen.hidden = true;
          appShell.hidden = false;
          onReady?.(user);
        } else {
          appShell.hidden = true;
          loginScreen.hidden = false;
          onSignedOut?.();
        }
      });
      return mod;
    })
    .catch((err) => {
      console.error(err);
      error.textContent =
        'Could not load Firebase Auth SDK from Google CDN. Check your network/firewall.';
      throw err;
    });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.textContent = '';
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    try {
      await signInWithPasswordRest(email, password);
      const mod = await authReady;
      await mod.signInWithEmailAndPassword(mod.auth, email, password);
    } catch (err) {
      console.error(err);
      error.textContent = friendlyAuthError(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }
  });

  logoutBtn.addEventListener('click', async () => {
    try {
      const mod = await authReady;
      await mod.signOut(mod.auth);
    } catch (err) {
      console.error(err);
    }
  });
}
