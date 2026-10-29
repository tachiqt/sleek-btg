# Sleek.btg Admin + Firebase setup

## 1. Create a Firebase project
1. Go to https://console.firebase.google.com
2. Create a project (e.g. `sleek-btg`)
3. Add a **Web** app and copy the config object

## 2. Paste config
Edit `js/firebase/config.js` and replace the `YOUR_*` placeholders.

## 3. Enable products
- **Authentication** → Sign-in method → Email/Password → Enable  
  Then add your admin user under Authentication → Users
- **Firestore Database** → Create database (start in production mode)  
  Paste rules from `firebase/firestore.rules`
- **Storage** → Get started  
  Paste rules from `firebase/storage.rules`

## 4. Open the admin
Serve the site locally (ES modules need a server):

```bash
python -m http.server 8765
```

- Public site: http://localhost:8765/
- Admin: http://localhost:8765/admin/

## Admin features
- **Overview** — pending bookings, open slots, inventory value, estimated profit
- **Inventory & profit** — supply stock (qty × unit cost) + service sell price vs material cost
- **Slots** — publish open appointment times
- **Bookings** — receive requests, confirm / decline / complete (+ WhatsApp)
- **Portfolio** — upload gallery images (live on the public site)
- **Reviews** — manage testimonials shown on the site
