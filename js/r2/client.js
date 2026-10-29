import { isR2Configured, r2Config } from './config.js';

/**
 * Rewrite broken r2.dev public URLs to the Worker /media/ path.
 * Also builds a Worker URL from a storage key when needed.
 */
export function portfolioPublicUrl(imageOrKey) {
  if (!imageOrKey) return '';
  const value = String(imageOrKey);
  const base = `${workerBase()}/media`;

  if (value.startsWith('portfolio/')) {
    return `${base}/${value}`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.hostname.endsWith('.r2.dev')) {
      const key = parsed.pathname.replace(/^\/+/, '');
      if (key.startsWith('portfolio/')) return `${base}/${key}`;
    }
    // Already a Worker media URL or other absolute URL
    if (parsed.pathname.includes('/media/portfolio/')) return value;
  } catch {
    /* ignore invalid URL */
  }

  return value;
}

async function adminIdToken() {
  // Compat auth used by admin gate/login
  if (window.__sleekAuth?.currentUser) {
    return window.__sleekAuth.currentUser.getIdToken();
  }
  // Modular auth fallback
  const { getFirebase } = await import('../firebase/app.js');
  const { auth } = getFirebase();
  if (!auth.currentUser) throw new Error('Sign in to upload portfolio images.');
  return auth.currentUser.getIdToken();
}

function workerBase() {
  return String(r2Config.workerUrl || '').replace(/\/$/, '');
}

/**
 * Upload an image file to Cloudflare R2 through the Worker.
 * @returns {{ url: string, key: string }}
 */
export async function uploadPortfolioToR2(file) {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 is not configured. Set js/r2/config.js workerUrl.');
  }
  if (!file) throw new Error('No file selected.');

  const token = await adminIdToken();
  const response = await fetch(`${workerBase()}/upload`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.type || 'application/octet-stream',
      'X-Filename': file.name || 'upload.jpg',
    },
    body: file,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `R2 upload failed (${response.status})`);
  }
  if (!data.url || !data.key) {
    throw new Error('R2 Worker did not return url/key.');
  }
  return { url: data.url, key: data.key };
}

export async function deletePortfolioFromR2(key) {
  if (!isR2Configured() || !key || !String(key).startsWith('portfolio/')) return;
  const token = await adminIdToken();
  const response = await fetch(`${workerBase()}/object?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `R2 delete failed (${response.status})`);
  }
}

export { isR2Configured };
