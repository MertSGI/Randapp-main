# LARİ Media Storage & Asset Operations Guide

This document describes the architectural specifications, privacy divisions, local simulation capabilities, and future migration protocols for LARİ's media and asset handling systems.

---

## 1. Core Media Asset Model

To support scalable and robust visual rendering for salon pages, staff roster rosters, and appointment receipts, LARİ utilizes a centralized **`MediaAsset`** model. This record structure decouples files from physical database column entries and tracks status, visibility flags, owner bindings, and metadata.

### Model Definitions (`types.ts` representation)
* **`MediaAssetType`**: Categorizes the storage use case (`logo`, `cover`, `gallery`, `staff_photo`, `service_image`, `branch_image`, `campaign_image`, `document`, `internal_attachment`).
* **`MediaVisibility`**: Demarcates resource isolation level:
  * `public`: Fully accessible over the web (e.g. salon branding, cover picture).
  * `tenant_private`: Limited to authorized staff and owners inside the shop's tenant panel (e.g. business licenses, inventory reports).
  * `super_admin_only`: Reserved strictly for application operations (e.g. flagged reports, compliance files).
* **`MediaStorageProvider`**: Declares active engine (`local_preview`, `supabase_storage`, `s3_compatible`, `external_url`).
* **`MediaAssetStatus`**: Tracks lifecycle state (`draft`, `active`, `archived`, `rejected`, `deleted`).

---

## 2. Local Simulation & Safe Pre-Live Mode

During LARİ's pre-launch validation phase, we enforce a secure **Local Pre-Live Mode** that avoids committing secrets or triggering cloud charges.

### Pre-Live Safety Measures:
1. **Zero External Requests**: No real binary assets are sent to cloud buckets. Only resource keys, local base64/object URLs, or safe CDN placeholders are saved.
2. **Database Cleanness**: Stores list of registered media logs under the `lari_media_assets` local cache. This prevents database size bloat.
3. **No Key Leakage**: Front-end builds require no Amazon AWS or Supabase Storage private service-role tokens.

---

## 3. Storage Architecture Mapping (Public vs. Private)

When transitioning LARİ to production cloud buckets, assets are stored across two strictly isolated configurations:

```
+---------------------------------------------------------------------------------+
|                               LARİ Media Gate                                   |
+---------------------------------------+-----------------------------------------+
                                        |
                 +----------------------+----------------------+
                 |                                             |
                 v                                             v
+--------------------------------+            +---------------------------------+
|        Public Bucket           |            |         Private Bucket          |
+--------------------------------+            +---------------------------------+
| • Cache: Public Cache-Control  |            | • Cache: Private Cache-Control  |
| • Access: Direct CDN URLs      |            | • Access: Signed Token Only     |
|   (Unauthenticated)            |            |   (Short-lived token: 15 mins)  |
|                                |            |                                 |
| • Used for:                    |            | • Used for:                     |
|   - Salon Logo & Covers        |            |   - Tenant Legal Invoices       |
|   - Service Catalog Cards      |            |   - Staff Identification Docs   |
|   - Staff Avatars (marketing)  |            |   - Internal Support Logs       |
+--------------------------------+            +---------------------------------+
```

### Bucket Structures

#### 1. Public Bucket (`lari-public-media`)
* **Purpose**: General marketing assets that render on public websites and reservation pages.
* **RLS Policies**:
  * Root access: Read-only for anonymous users (`public.read`).
  * Creation: Authorized tenant users can write files only matching their assigned namespace `tenants/${tenantId}/*`.
* **Caching**: Configured with strict downstream caching headers:
  `Cache-Control: public, max-age=31536000, immutable`

#### 2. Private Bucket (`lari-private-secure`)
* **Purpose**: High-responsibility assets that contain merchant records, customer ID files, or contract forms.
* **RLS Policies**:
  * Root access: All direct anonymous readings are blocked (`403 Forbidden`).
  * Creation/Reading: Verified tenant owners and designated managers can retrieve read/write capabilities via short-lived signed URLs.
* **Signed Links Duration**: Recommended token lifetime is **15 minutes** (`expiresIn: 900`).

---

## 4. Alternate Provider Strategy: S3-Compatible Protocol

If LARİ's platform needs to operate outside of Supabase environments (e.g. AWS S3, Cloudflare R2, MinIO, or DigitalOcean Spaces), we wrap our methods using S3 client libraries.

### Configuration Reference (`.env` fields)
```env
# Future AWS S3 / Cloudflare R2 Config (Server-side ONLY)
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_ACCESS_KEY_ID=sec_access_key
S3_SECRET_ACCESS_KEY=sec_secret_key
S3_PUBLIC_BUCKET_NAME=lari-public-media
S3_PRIVATE_BUCKET_NAME=lari-private-secure
S3_REGIONAL_ZONE=eu-west-1
```
*(Warning: These keys must never be referenced or bundled inside standard React UI views. S3 interactions should occur behind backend proxy endpoints inside the safe `server.ts` layer).*

---

## 5. Security & File Verification Constraints

To defend against malicious payloads, Trojan uploads, or XSS execution logs, our media service enforces the following defenses:

1. **Strict File Extension Blocks**:
   * Forbidden extensions: `.js`, `.jsx`, `.ts`, `.tsx`, `.exe`, `.sh`, `.bat`, `.cmd`, `.html`, `.htm`, `.php`, `.py`, `.svg`.
   * *Why block SVG?* SVG graphics are essentially XML docs and can carry embedded executable `<script>` blocks that lead to severe Cross-Site Scripting (XSS) compromises on the brand subdomain.
2. **Acceptable Formats**: Only `image/jpeg`, `image/png`, and `image/webp` sizes are permitted on interactive public pages.
3. **Hard Size Boundaries**:
   * Tenant Branding Logos: max **2 MB**.
   * Covers, Gallery Slates, staff photos: max **5 MB**.
4. **Alt Text Recommendations**: For active public gallery items, the system generates fallback strings based on clean file titles to guarantee proper SEO indexing and high accessibility compliance.

---

## 6. Tenant Portability: Export, Backup, and Migration Protocol

To maintain our core promise of **merchant portability** and high compliance, backups and transfers include visual resources.

### Safe Package Export Protocol:
* When a merchant generates a full dataset snapshot (`dataExportService`), physical base64 strings are ignored to prevent file size crashes.
* In place of binary content, the export manifests compile paths, descriptions, altText, and remote bucket keys.
* This leaves files cleanly downloadable as accompanying zip resource indexes, while maintaining metadata consistency inside our JSON schema.

### Dry-Run Migration Verification:
* The pre-migration test suite (`migrationDryRunService`) checks media asset linkages.
* Trigger alerts/warnings if public active categories include pointers to missing local images, or have invalid types.

---

## 7. Legal and Privacy Compliances (KVKK & GDPR)

As a beauty and salon appointment scheduler operating in Turkey, LARİ coordinates sensitive personal graphics (e.g. staff portraits, salon profiles, or client before/after portfolios).

* **Explicit consent models**: Salon merchants are legally mandated to retrieve signed consent before uploading public photos of staff personnel.
* **Right To Be Forgotten**: Clicking **"Kaldır"** or deleting a salon store profile triggers automatic cleanup loops, removing local indices and scheduling a physical file deletion thread from the remote S3/Supabase storage buckets.
* **No Impersonation Rules**: Fraudulent profile updates (using stock model pictures with copyright boundaries) are routed to manual review under the Super Admin compliance workspace.
