# Site Routing and Domain Model

## 1. MVP Routing Strategy (Current)
Currently, LARİ manages multiple tenants strictly through path-based routing in the MVP application.
- **Tenant Links:** `/#/book?tenantId=[id]`
- **Super Admin Previews:** `/#/super-admin/tenant-preview/[id]`
- **Admin Previews:** `/#/admin/site-preview`

### Customer Facing
For the MVP pilot, the URL shared to customers is based on the hosting platform, using the query-based or path-based route for the specific tenant ID.

## 2. Next Phase: Subdomain Strategy
Eventually, the platform will utilize a primary Wildcard DNS architecture:
- `https://[salon-name].randapp.com`

This approach avoids manual TLS provisioning for every salon and maintains brand presence while delivering a clean URL.

## 3. Premium Future Phase: Custom Domains (`.com`)
Custom domain setups (`www.mysalon.com`) will be a manual/premium concierge process rather than fully automated DNS provisioning.

### Customer Wording
- **DO NOT** promise instant automated .com domain connections in marketing copy.
- **USE:** "Özel alan adı (website adresi) kurulumu Randapp ekibi tarafından yönlendirilir."

## 4. Current App Readiness
- Admin views show a basic "Site Önizlemesi" without exposing complex DNS configuration tools.
- Users are not prompted to enter A records or CNAME records.
- Marketing site safely promotes the "Professional Website" outcome without over-promising technical domain automation.
