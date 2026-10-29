/**
 * Auto-filled from Firebase project sleek-btg-studio-92028
 */
export const firebaseConfig = {
  apiKey: 'AIzaSyAvCIsjJRDmWO3axwNbR_kcT8I_WHOUwlc',
  authDomain: 'sleek-btg-studio-92028.firebaseapp.com',
  projectId: 'sleek-btg-studio-92028',
  storageBucket: 'sleek-btg-studio-92028.firebasestorage.app',
  messagingSenderId: '440399708249',
  appId: '1:440399708249:web:3580ccbf5d7d37b88a3148',
};

export function isFirebaseConfigured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
}