(function () {
  const loading = document.getElementById('auth-loading');
  const app = document.getElementById('app');

  if (!window.SLEEK_FIREBASE_CONFIG?.apiKey || !window.firebase?.apps) {
    window.location.replace('./login.html');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.SLEEK_FIREBASE_CONFIG);
  }

  const auth = firebase.auth();
  window.__sleekAuth = auth;

  let settled = false;

  // Wait for Firebase to finish reading the persisted session before deciding
  auth.onAuthStateChanged((user) => {
    if (!user) {
      // Avoid bounce loops right after login: give persistence a moment once
      if (!settled) {
        settled = true;
        window.setTimeout(() => {
          if (!auth.currentUser) {
            window.location.replace('./login.html');
          }
        }, 250);
        return;
      }
      window.location.replace('./login.html');
      return;
    }

    settled = true;
    if (loading) loading.hidden = true;
    if (app) app.hidden = false;
    window.dispatchEvent(new CustomEvent('sleek:admin-ready', { detail: { user } }));
  });

  document.getElementById('logout-btn')?.addEventListener('click', async () => {
    await auth.signOut();
    window.location.replace('./login.html');
  });
})();
