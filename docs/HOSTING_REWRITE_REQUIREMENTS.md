# Hosting Rewrite and SPA Fallback Requirements

This document outlines the technical hosting instructions and reverse proxy configurations required to enable wildcard subdomain routing and single-page application (SPA) fallbacks for LARİ.

---

## 1. Subdomain Ingress & Host Routing

Since LARİ is built as a Single-Page Application (SPA) powered by React and Vite, **all subdomains on `*.randevulari.com` must route traffic to the exact same frontend asset container**. 

The app itself is client-side routed; once the bundle initializes, `domainResolverService.ts` parses the `window.location.hostname` in the client's browser to determine the tenant context dynamically and fetch their branding and services.

```
Request to salon-adi.randevulari.com
                │
                ▼
      DNS (*.randevulari.com)
                │
                ▼
 Hosting Ingress (Cloud Run / CDN / Nginx)
                │ (Header preservation check)
                ▼
Serves original built SPA (index.html bundle)
                │
                ▼
React bundle runs in client browser
                │
   [domainResolverService parses Host]
                ▼
Renders customized SalonWebsiteView for salon-adi
```

---

## 2. Ingress Router Rewrite and SPA Fallback Rules

To preserve client routing integrity and prevent `404 Not Found` errors when refreshing sub-pages (e.g. `salon-adi.randevulari.com/alsancak`), the hosting ingress must implement standard SPA rewrite rules.

### 2.1. Nginx Routing Rules (For Custom Nginx Contained Server/Proxy)
If deploying LARİ custom, the entry server block must rewrite all paths back to the index file:

```nginx
server {
    listen 80;
    server_name www.randevulari.com randevulari.com *.randevulari.com;

    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 2.2. Vercel Configuration (`vercel.json`)
If routed via static host, rewrites must guarantee SPA routes point back structure:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

---

## 3. Hostname Preservation Rule

**CRITICAL CRITERIA**: The hosting ingress or CDN must NOT rewrite the Host header or mask the referrer. 
*   **Proxy Rule**: Always preserve the original `Host` header (or supply it via standard `X-Forwarded-Host`).
*   If the Host header is rewritten down to `randevulari.com` before it reaches the client browser, `domainResolverService.ts` will fail to extract the tenant slug and will load the main platform landing page instead of the salon website.

---

## 4. Local Fallback Compatibility

To preserve local development ergonomics when testing without real DNS:
1.  **Hash Router Mode**: If `import.meta.env.VITE_ROUTER_MODE` is not `browser` or if the host is `localhost`, the application defaults to hash-mode parameters (e.g. `/#/book?tenant=slug`).
2.  **Fallback Route Checks**: The router configuration in `App.tsx` contains paths for `/:tenantSlug` and `/booking/:tenantSlug` to seamlessly support testing without subdomains.
3.  **Active Tenant Override**: Local state managers allow overriding the tenant ID using `localStorage.getItem('lari_active_tenant_id')` to ease local UI review.
