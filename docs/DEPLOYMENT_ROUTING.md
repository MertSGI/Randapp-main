# Deployment Routing & Custom Domains

This document outlines how routing is managed in this Single Page Application (SPA), how deployment configurations support `BrowserRouter`, and how subdomain/tenant resolution functions on different providers.

## BrowserRouter & Redirects

We use React Router's `BrowserRouter` instead of `HashRouter`. This allows for clean, "real" URLs (like `randapp.com/admin` instead of `randapp.com/#/admin`).

Because this is a Client-Side Rendered (CSR) app built with Vite, the frontend handles all routing logic. If a user navigates directly to a subpage or hits refresh (e.g. `[domain.com]/admin`), the hosting provider will try to look for a physical `/admin/index.html` file by default and return a `404 Not Found` error.

To avoid this, we instruct our hosting providers to catch all incoming traffic and redirect/rewrite it back to `/index.html` where React Router can mount and determine the correct route to show based on the URL path.

### Netlify Deployment
For Netlify, we rely on the `/public/_redirects` file that is copied directly into the `dist` folder upon building:
```
/* /index.html 200
```
This single line tells Netlify to capture any request (`/*`) and serve the `/index.html` file with a `200 OK` status, preventing 404s.

### Vercel Deployment
For Vercel, we rely on `/vercel.json` in the project root:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```
This tells Vercel's edge network to rewrite any request dynamically into `/index.html` (the root application).

## Tenant Subdomain Resolution & Custom Domains

Our application is a multi-tenant SaaS. Its architecture uses `VITE_APP_BASE_DOMAIN` to detect whether a request is coming from a tenant subdomain or a custom domain.

### How it works:
When the domain resolves to the application, `tenantService.ts` parses `window.location.hostname`.

1. **Subdomains:** If `VITE_APP_BASE_DOMAIN` is set to `randapp.com`, and a user accesses `demo.randapp.com`, the service extracts `demo` and performs a database query looking for `slug = 'demo'`.
2. **Custom Domains:** If the user accesses `salon.com` and it doesn't end with `randapp.com`, the application natively searches for `custom_domain = 'salon.com'`.

### Testing Locally
During local development, the service falls back to returning the `DEMO_TENANT` if you navigate to `localhost` or `127.0.0.1`.

To manually test routing and refresh behaviors:
1. Open the dev server (`npm run dev`) or preview environment.
2. Navigate to `[preview-url]/login`.
3. Hit the browser's refresh button. It should correctly remount the login page.
4. If you hit `[preview-url]/admin` as a guest, the `<ProtectedRoute>` component will intercept and push you back to `/login`.
