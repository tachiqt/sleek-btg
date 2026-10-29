# Cloudflare R2 portfolio uploads

Admin portfolio images go to **Cloudflare R2** through a small Worker (keeps R2 keys off the browser). Firestore still stores the image URL + metadata for the public site.

## 1. Create the R2 bucket
In [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2** → Create bucket:

- Name: `sleek-btg-portfolio`

Enable public access (R2.dev subdomain) **or** attach a custom domain. Copy the public base URL, e.g.:

- `https://pub-xxxxxxxx.r2.dev`

## 2. Configure + deploy the Worker

```bash
cd cloudflare/r2-portfolio
npm install
```

Edit `wrangler.toml`:

```toml
PUBLIC_BASE_URL = "https://pub-xxxxxxxx.r2.dev"
```

Then:

```bash
npx wrangler login
npx wrangler secret put FIREBASE_API_KEY
# paste: AIzaSyAvCIsjJRDmWO3axwNbR_kcT8I_WHOUwlc

npx wrangler deploy
```

Copy the Worker URL from the deploy output, e.g. `https://sleek-btg-portfolio.<account>.workers.dev`

## 3. Point the admin app at the Worker

Edit `js/r2/config.js`:

```js
export const r2Config = {
  workerUrl: 'https://sleek-btg-portfolio.<account>.workers.dev',
  enabled: true,
};
```

## 4. Test
1. Sign in at `/admin/login.html`
2. Open **Portfolio**
3. Upload an image → it should land in R2 and show in the Live gallery
4. Refresh the public site gallery

## How it works
`Admin (Firebase Auth)` → `Worker` (verifies ID token) → `R2 put` → returns public URL → saved in Firestore `portfolio` docs → public site reads Firestore.
