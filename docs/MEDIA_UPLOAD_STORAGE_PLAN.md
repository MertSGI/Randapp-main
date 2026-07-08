# Media Upload & Storage Plan

LARİ's media storage is driven by tenant-level isolation and strict access models, primarily mapping to Supabase Storage Buckets.

## Supabase Storage Buckets
1. **tenant-public-media**
   - **Scope**: Cover images, staff profile pictures, service icons.
   - **Access**: Public `SELECT` allowed. Upload restricted to authenticated salon tenant owners.
   - **Retention**: Permanent until deleted by the salon instance.
2. **customer-private-reference-photos**
   - **Scope**: Sensitive Customer Memory images (past haircuts, styles).
   - **Access**: Strictly private. Only authenticated salon owners can read/write.
   - **AI Usage**: Never sent to AI tools by default. Never processed for biometrics.
3. **ai-temp-uploads (Optional Future)**
   - **Scope**: Customer images uploaded specifically from the `/ai-visualizer` flow.
   - **Access**: Directly requested by backend Edge Functions.
   - **Retention**: Immediately purged post-processing (e.g. 5 minutes). Ensure volatile bounds.

## Restrictions
- **MIME Types**: Images only (`image/png`, `image/jpeg`, `image/webp`).
- **File Limits**: Maximum 5 MB per image.
- **Tracking**: Uploads map to the user session, providing trails in `audit_logs` for GDPR/KVKK compliance. Export requests fetch all respective paths.

## Modes of Operation

### Mock Mode (`VITE_DATA_MODE=mock`)
- When running in Mock mode, uploads do NOT sync to an external bucket.
- Instead, files are immediately read via `FileReader` and converted to `Base64` or `Object URLs` for instantaneous client-side preview.
- These representations are persisted in `localStorage` alongside the business profile JSON. This is acceptable for local testing and sales demos, but comes with storage limits.

### Supabase Mode (`VITE_DATA_MODE=supabase`)
- Relies on **Supabase Storage** and explicit Edge Function processing.
