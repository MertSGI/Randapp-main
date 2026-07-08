# Sandbox Readiness Report

## Backend Secrets Defined in .env.example
- ✅ IYZICO_API_KEY
- ✅ IYZICO_SECRET_KEY
- ✅ IYZICO_BASE_URL
- ✅ PUBLIC_APP_URL
- ✅ SUPABASE_URL
- ✅ SUPABASE_SERVICE_ROLE_KEY

## Plan Mapping Readiness
Plans should map to Iyzico Product and Pricing Plan reference codes in the Edge function or shared config.

## Trial Configuration Readiness
- ✅ Trial configured to 14 days.
- ✅ Starter plan reference mapping fields exist.
- ✅ Professional plan reference mapping fields exist.
- ✅ Premium plan reference mapping fields exist.

## URLs and Configuration
- ℹ️ Ensure PUBLIC_APP_URL is not localhost in production.
- ℹ️ Ensure Edge function URLs are registered in Iyzico Sandbox (Webhook / Callback).

## Summary
✅ Readiness check passed. See setup guides to continue.
