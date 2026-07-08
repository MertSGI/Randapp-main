# Firebase vs Supabase Decision

## Recommendation
**Keep Supabase as the primary backend for LARİ.**

## Reasons
1. **Existing Architecture**: The current schema, migrations (SQL), and Row Level Security (RLS) policies are already developed for Supabase.
2. **Edge Functions**: The serverless webhook and iyzico integration logic is already designed around Supabase Edge Functions.
3. **Consistency**: Tenant isolation and relational data mapping (e.g., Tenants -> Services -> Staff -> Appointments) are easier to maintain in a SQL (Postgres) environment.
4. **Media Uploads**: Using Supabase Storage for media uploads (logos, gallery, cover images) avoids splitting auth/database/storage architecture, significantly reducing maintenance complexity.

## When to Re-evaluate
Firebase is highly capable, but migrating right now would require rebuilding the data models out of relational SQL into document structures (Firestore). We will re-evaluate Firebase only if:
- Supabase Storage or Database bandwidth/storage costs become prohibitive.
- Real-time requirements (e.g., live chat or instant multi-user collaborative calendars) become complex enough that they mandate Firebase's specialized real-time engine.
- A strategic business decision specifically mandates moving to Google Cloud / Firebase native infrastructure.

## Note
Always monitor Database and Storage read/write metrics to ensure cost-efficiency as the tenant base grows.
