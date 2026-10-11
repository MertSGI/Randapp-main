
# Product Flow QA Report

## Run Metadata
- Timestamp: 2026-10-11T19:06:41.802Z
- Viewports: Mobile(390), Desktop(1440)
- Roles: guest, admin, superadmin
- Status: **PASS**

## Route Matrix
- [x] `/#/` - Found expected text
- [x] `/#/features` - Found expected text
- [x] `/#/pricing` - Found expected text
- [x] `/#/register?planId=professional` - Found expected text
- [x] `/#/book` - Found expected text
- [x] `/#/super-admin/go-live` - Found expected text
- [x] `/#/pilot` - Found expected text

## Flow Matrix
- **Registration → tenant shell created → onboarding**: PASS
  - Evidence: Payment-disabled onboarding route reached. Current URL: http://localhost:4040/#/admin?tab=kurulum&registration=success
  - Risk: None
- **admin setup -> site preview consistency**: PASS
  - Evidence: TenantService resolves mock registration to active_tenant
  - Risk: Relies on local browser storage temporarily

## Marketing Accessibility Matrix
- [x] Marketing navigation has an accessible name
- [x] Marketing page exposes one visible primary heading
- [x] Marketing page exposes a main landmark
- [x] Marketing navigation link has a visible focus indicator

## Mobile Matrix
- Viewport 390x844:
  - No Overflow: PASS
  - Hero Visible: PASS

## Security & Static Matrix
- [x] No raw card inputs 
- [x] No secrets exposed \n  []
- [x] No old brand in UI \n  []
- [x] No forbidden wording in UI \n  []
    