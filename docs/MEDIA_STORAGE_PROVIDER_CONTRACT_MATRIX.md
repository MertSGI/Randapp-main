# LARİ Media Storage Provider Contract Matrix

This matrix charts the behavior, permissions, and export handling for each asset type across different environment runtimes.

| Asset Type | Local/Pre-Live Behavior | Supabase Storage Expectation | S3/R2 Expectation | Public? | Signed URL? | Used in Public Site? | Export Behavior | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`logo`** | FileReader reads as temporary URL or maps Unsplash placeholder. | Uploads to `lari-public-media` bucket at prefix `tenants/logo/`. | Stored in S3 public bucket. Read directly via base URL. | **Yes** | No | **Yes** | Metadata entry in snapshot. | Scaled to maximum 2 MB sizing limit. |
| **`cover image`** | Leverages local storage path or Unsplash visual seed. | Uploads to `lari-public-media` bucket at prefix `tenants/cover/`. | Stored on S3 public CDN path. | **Yes** | No | **Yes** | Metadata entry in list fields. | Scaled to maximum 5 MB sizing limits. |
| **`gallery image`** | Kept in local store array referend to standard preview image. | Uploads to `lari-public-media` bucket at prefix `tenants/gallery/`. | Public S3 store, cached on Edge CDNs. | **Yes** | No | **Yes** | Array of asset records exported. | Up to 10 photos supported per shop. |
| **`staff photo`** | Local list binding or team profile graphics URL. | Uploads to `lari-public-media` bucket at prefix `tenants/staff/`. | S3 public container. | **Yes** | No | **Yes** | Metadata link in staff catalog snapshot. | Requires explicit staff KVKK authorization. |
| **`service image`** | Static seed illustrative beauty card icons. | Uploads to `lari-public-media` bucket at prefix `tenants/services/`. | Public S3 store, mapped to category index. | **Yes** | No | **Yes** | Linked array index in snapshot catalog. | Helps client conversion rates on booking page. |
| **`branch image`** | Branch management panel reference previews keys. | Uploads to `lari-public-media` bucket at prefix `tenants/branches/`. | S3 public branch folders. | **Yes** | No | **Yes** | Exported inside branch structural nodes. | Key for merchants operating multiple layouts. |
| **`campaign image`** | Visual promo ads placeholders mapped in system state. | Uploads to `lari-public-media` bucket at prefix `tenants/campaigns/`. | S3 public campaign assets. | **Yes** | No | **Yes** | Exported inside customer campaign models. | Encourages social sharing & customer rewards. |
| **`internal support attachment`** | Logged strictly inside supervisor storage mock vectors. | Uploads to authenticated `lari-private-secure` bucket prefix `cases/` | Private S3 bucket, read-blocked. | **No** | **Yes** (15 mins duration) | **No** | Excluded or stripped from tenant exports. | Shared exclusively are between Super Admin & Operator. |
| **`legal/business document`** | Mocked or validated inside licensing upload wizard state. | Uploads to `lari-private-secure` bucket prefix `compliance/`. | Private S3 bucket, strict folder IAM rules. | **No** | **Yes** (15 mins duration) | **No** | Excluded or stripped from tenant exports. | Documents such as taxes boards, IYS rıza templates. |

---

## Operational Alignment Rules

1. **Strict Visibility Boundary**: Non-public assets (`internal support attachment`, `legal/business document`) must **never** be placed in a directory or bucket that resolves client-side without short-lived access signatures or backend authorization checks.
2. **Syncing Asset ID with Relational State**: Whenever a physical file gets written, its primary registered `id` on `MediaAsset` should match the relational fields of the business profiles, staff, or branch record.
3. **Storage Fallbacks**: If a remote S3/Supabase storage transaction fails, the app must fall back cleanly without bricking or locking up the booking checkout visual modules.
