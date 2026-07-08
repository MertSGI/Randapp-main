# Custom Domain Strategy

## Default Behavior
All newly onboarded tenants automatically get a LARİ subdomain (e.g., `https://[salons-slug].randapp.com` or via router isolation in MVP). 

## Annual Packages & Custom Domains
Certain premium tiers (e.g., Professional or Premium on an *Annual* billing cycle) may include eligibility for a custom `.com` domain (e.g., `www.gorgeous-salon.com`).

## Data Model (TenantDomain)
- `id`: string
- `tenantId`: string
- `domainType`: 'subdomain' | 'custom_domain'
- `subdomain`: string
- `customDomain`: string
- `status`: 'not_requested' | 'requested' | 'dns_pending' | 'verification_pending' | 'active' | 'failed'
- `includedByPlan`: boolean
- `requestedAt`: date
- `activatedAt`: date
- `notes`: string

## Phased Approach
**Phase 1 (Current): Request & Workflow Tracking**
- DNS routing and TLS certificate generation are **NOT** automated.
- If eligible, the tenant sees an "Özel alan adı talep et" button.
- Super Admins see the domain requests, manually configure DNS/Cloudflare, and mark the status as "active".
- The UI explicitly states: "Özel alan adı kurulumu Randapp ekibi tarafından yönlendirilir."

**Phase 2 (Future): Automated Provisioning**
- Integration with domain registrars (e.g., AWS Route53 or Cloudflare for SaaS).
- Automated certificate issuance.
