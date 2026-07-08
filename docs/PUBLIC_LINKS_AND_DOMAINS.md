# LARİ Public Links & Custom Domains

This document tracks the capabilities of the LARİ app generating shareable booking links, verifying slugs, and planning custom domain resolutions.

## 1. Slugs & Normalization

All tenants are required to have a `slug`. Slugs are automatically:
- Lowercased
- Stripped of special chars
- Replaced with hyphens instead of spaces
- Transliterated from Turkish characters (e.g. `ğ` -> `g`, `ş` -> `s`)

### Reserved Slugs
The platform prevents registration or renaming onto reserved keywords.
Examples: `admin, login, register, pricing, demo, pilot, book, api, super-admin, settings, checkout, payment, help, support, randevu, lari, app, www, mail, ftp`.

## 2. Public Link Architecture

`publicLinkService` orchestrates link generation:
- `getTenantPublicUrl`: The core canonical link (e.g., `https://lari.app/#/book?tenant=guzel-kuafor`)
- `getBranchBookingUrl`: For multi-branch tenants, adds the `&branch=<slug/id>` to preselect the step.
- `getAdminPreviewUrl`: Bypasses "Publish Check" using `&preview=true`, readable only by authenticated tenant owners.

## 3. Branch Mapping
Since Enterprise (Kurumsal) businesses carry multiple active branches, the system maps out an "All Branches" root URL (which triggers `Step 0.5 Branch Selection` in the Booking Page) and optionally presents localized links that silently pre-load `selectedBranch` to skip this step for users sent from the localized Instagram or Google Profile of that specific branch.

## 4. QR Configuration & Share Toolkit
Instead of bloating the frontend build with heavy QR libraries at this stage, LARİ uses standard reliable integration mapping `api.qrserver.com` passing the fully URI string.
This is heavily operationalized via the `shareToolkitService`, which adds attribution parameters (e.g. `source=qr`, `source=whatsapp`) and wraps links in highly converting share text to ensure maximum bookings. See `SHARE_TOOLKIT.md` for detail.

## 5. Custom Domain Readiness
A visual placeholder and service status check evaluates custom domain entitlements:
- **Free/Intro/Pro:** Warns the owner that custom domains are exclusive.
- **Enterprise (Kurumsal) & Premium:** Unlocks "Under Review" flags or "Active" rendering.

DNS automated provisioning will be handed over to infrastructure logic upon complete scale.

## 6. Subdomain Provisioning & Hostname Resolution
LARİ supports automatic subdomain provisioning via `domainResolverService.ts` and `siteProvisioningService.ts`.
- Subdomains use the format `https://{tenantSlug}.randevulari.com` (for TR market) or `https://{tenantSlug}.lari.app` (Global).
- The `domainResolverService` intercepts incoming requests, parses the hostname, and sets the tenant context accordingly.
- Multi-branch urls use `https://{tenantSlug}.randevulari.com/{branchSlug}`.

## 7. Operational Requirements for Live Routing
To enable automated subdomains across production environments:
1. **Wildcard DNS**: Map `*.randevulari.com` (or the equivalent market domain) to the app deployment (Cloud Run / CDN).
2. **Wildcard SSL**: Required to secure tenant subdomains correctly.
3. Fallback previewing safely uses hash-mode (`/#/book?tenant=slug`) until DNS changes propagate locally.
