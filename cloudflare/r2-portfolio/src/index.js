/**
 * Cloudflare Worker — Sleek.btg portfolio uploads to R2
 *
 * Deploy:
 *   cd cloudflare/r2-portfolio
 *   npx wrangler login
 *   npx wrangler r2 bucket create sleek-btg-portfolio
 *   # Enable public access OR attach a custom domain, then set PUBLIC_BASE_URL
 *   npx wrangler secret put FIREBASE_API_KEY
 *   npx wrangler deploy
 *
 * Bindings / vars are in wrangler.toml
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Filename',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

async function requireAdmin(request, env) {
  const header = request.headers.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return { error: json({ error: 'Missing auth token' }, 401) };

  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_API_KEY)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    }
  );
  const data = await res.json();
  if (!res.ok || !data.users?.length) {
    return { error: json({ error: 'Invalid or expired admin session' }, 401) };
  }
  return { user: data.users[0] };
}

function publicUrl(env, key) {
  const base = String(env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base) {
    throw new Error('PUBLIC_BASE_URL is not set on the Worker');
  }
  return `${base}/${key}`;
}

function sanitizeName(name) {
  return String(name || 'image.jpg')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url = new URL(request.url);

    if (url.pathname === '/health') {
      return json({ ok: true, bucket: !!env.PORTFOLIO_BUCKET, publicBase: !!env.PUBLIC_BASE_URL });
    }

    // Public image delivery (avoids broken r2.dev hostnames)
    if (request.method === 'GET' && url.pathname.startsWith('/media/')) {
      const key = decodeURIComponent(url.pathname.slice('/media/'.length));
      if (!key || !key.startsWith('portfolio/') || key.includes('..')) {
        return json({ error: 'Invalid object key' }, 400);
      }
      const object = await env.PORTFOLIO_BUCKET.get(key);
      if (!object) return new Response('Not found', { status: 404, headers: CORS });
      const headers = new Headers(CORS);
      headers.set('Content-Type', object.httpMetadata?.contentType || 'image/jpeg');
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      if (object.httpEtag) headers.set('ETag', object.httpEtag);
      return new Response(object.body, { headers });
    }

    const auth = await requireAdmin(request, env);
    if (auth.error) return auth.error;

    try {
      if (request.method === 'PUT' && url.pathname === '/upload') {
        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
        if (!contentType.startsWith('image/')) {
          return json({ error: 'Only image uploads are allowed' }, 400);
        }

        const filename = sanitizeName(request.headers.get('X-Filename') || 'upload.jpg');
        const key = `portfolio/${Date.now()}-${filename}`;
        const body = await request.arrayBuffer();
        if (!body.byteLength) return json({ error: 'Empty file' }, 400);
        if (body.byteLength > 8 * 1024 * 1024) {
          return json({ error: 'Image must be under 8MB' }, 400);
        }

        await env.PORTFOLIO_BUCKET.put(key, body, {
          httpMetadata: { contentType },
          customMetadata: {
            uploadedBy: auth.user.email || auth.user.localId || 'admin',
          },
        });

        return json({
          key,
          url: publicUrl(env, key),
          contentType,
          size: body.byteLength,
        });
      }

      if (request.method === 'DELETE' && url.pathname === '/object') {
        const key = url.searchParams.get('key');
        if (!key || !key.startsWith('portfolio/')) {
          return json({ error: 'Invalid object key' }, 400);
        }
        await env.PORTFOLIO_BUCKET.delete(key);
        return json({ ok: true, key });
      }

      return json({ error: 'Not found' }, 404);
    } catch (err) {
      return json({ error: err.message || 'Upload failed' }, 500);
    }
  },
};
