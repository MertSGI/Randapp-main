# Demo Deployment Checklist

This document outlines the steps required to deploy the mock-mode demo of LARİ on platforms like Netlify or Vercel for sales outreach purposes.

## 1. Environment Requirements

Before deploying, ensure you have the correct variables set in your deployment platform's environment variables settings.

**Required Variables for Demo Mode:**
- `VITE_DATA_MODE=mock`
- `VITE_ROUTER_MODE=browser` (Only if you have configured redirects, otherwise stick to `hash` for simplicity).
- `VITE_SALES_WHATSAPP_NUMBER=905550000000` (Your actual WhatsApp number for lead capture).

Do **NOT** set Supabase variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) for a pure mock deployment to prevent unintended database connections.

## 2. Build Configuration

- **Build Command:** `npm run build`
- **Publish/Output Directory:** `dist`

## 3. Routing (Important for Vercel/Netlify)

Since this is an SPA (Single Page Application), direct visits to routes like `/admin` might result in a 404 error on the host.

- **Netlify:** Create a `public/_redirects` file with the following content:
  `/* /index.html 200`
  *(Note: Vite also supports generating this, but adding it manually to the public folder is safest).*
  
- **Vercel:** Create a `vercel.json` in the root:
  ```json
  {
    "rewrites": [
      { "source": "/(.*)", "destination":="/index.html" }
    ]
  }
  ```

Alternatively, keeping `VITE_ROUTER_MODE=hash` prevents 404s on all static hosts without configuration.

## 4. Verification

After deployment, verify the following:
- [ ] Landing page (`/`) loads correctly.
- [ ] The Demo Generator (`/demo`) works and logo upload previews locally without breaking.
- [ ] Clicking "WhatsApp'tan Demo Talep Et" on the `/demo` page pre-fills a message to your specified WhatsApp number.
- [ ] Logging in as `admin@randapp.com` / `admin` allows access to the `/admin` area.
- [ ] The new "Kurulum" tab works, and changes are reflected locally (mock state resets on hard refresh, which is expected for the demo).

## 5. Service Worker Status

Currently, the offline PWA service worker is **disabled** (`src/main.tsx`). Do not try to re-enable it during the demo phase to avoid white screen cache conflicts.
