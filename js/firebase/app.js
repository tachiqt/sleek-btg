import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-storage.js';
import { firebaseConfig, isFirebaseConfigured } from './config.js';

let app;
let auth;
let db;
let storage;
let authReadyPromise;

export function getFirebase() {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase is not configured. Update js/firebase/config.js with your project keys.'
    );
  }
  if (!app) {
    // Reuse the default app if admin login (compat SDK) already initialized it.
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
  }
  return { app, auth, db, storage };
}

/**
 * Ensure the modular Auth instance has the signed-in admin user
 * (same app as the compat login session).
 */
export async function ensureAdminAuth() {
  const { auth: modularAuth } = getFirebase();

  if (modularAuth.currentUser) return modularAuth.currentUser;

  if (!authReadyPromise) {
    authReadyPromise = new Promise((resolve) => {
      const timeout = window.setTimeout(() => {
        unsub();
        resolve(modularAuth.currentUser);
      }, 5000);
      const unsub = onAuthStateChanged(modularAuth, (user) => {
        if (user) {
          window.clearTimeout(timeout);
          unsub();
          resolve(user);
        }
      });
    });
  }

  const user = await authReadyPromise;
  authReadyPromise = null;

  if (user || modularAuth.currentUser) {
    return user || modularAuth.currentUser;
  }

  throw new Error('Not signed in. Refresh the page and sign in again before saving.');
}

export { isFirebaseConfigured };
