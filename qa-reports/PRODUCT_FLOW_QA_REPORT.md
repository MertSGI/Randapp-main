
# Product Flow QA Report

## Run Metadata
- Timestamp: 2026-06-02T13:29:27.047Z
- Viewports: Mobile(390), Desktop(1440)
- Roles: guest, admin, superadmin
- Status: **FAIL**

## Route Matrix
- [x] `/#/` - Found expected text
- [x] `/#/features` - Found expected text
- [x] `/#/pricing` - Found expected text
- [x] `/#/register?planId=professional` - Found expected text
- [x] `/#/book` - Found expected text
- [ ] `/#/super-admin/go-live` - Missing typical terms
- [ ] `/#/tenant_pilot_demo` - Missing typical terms
- [ ] `/#/pilot/customer` - Missing typical terms

## Flow Matrix
- **Registration → tenant shell created → checkout handoff**: PASS
  - Evidence: Checkout handoff invoked. Current URL: http://localhost:4040/#/login
  - Risk: None
- **admin setup -> site preview consistency**: PASS
  - Evidence: TenantService resolves mock registration to active_tenant
  - Risk: Relies on local browser storage temporarily

## Mobile Matrix
- Viewport 390x844:
  - No Overflow: PASS
  - Hero Visible: PASS

## Security & Static Matrix
- [x] No raw card inputs 
- [x] No secrets exposed \n  []
- [x] No old brand in UI \n  []
- [ ] No forbidden wording in UI \n  ["/#/book: hesap askıda"]
    