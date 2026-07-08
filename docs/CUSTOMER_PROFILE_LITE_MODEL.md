# Customer Account Lite & Customer Profile Lite Model

## Philosophy
LARİ supports a distinct separation between customer-side booking preferences and salon-owner-side service memory.

1. **Customer Account Lite (Customer Side)**
   - Formally a purely local persistence model ("Save my info on this device").
   - No complex passwords or account silos for the end-user.
   - Saves basic details (Name, Phone, Email) to browser local storage.
   - Speeds up future bookings on the same device.
   - Guest booking ("Continue as Guest") remains fully functional and bypasses this entirely.

2. **Customer Memory / Customer Profile Lite (Salon Owner Side)**
   - Displayed exclusively in the Admin Dashboard -> "Customers" tab.
   - Aggregates appointments automatically by strictly matching normalized `email` or `phone` within a specific `tenant_id`.
   - Allows salon owners to privately record:
     - Internal notes (e.g., "Prefers natural blow-dry")
     - Style preferences (e.g., Color formula: 7.1 + 8.12)
     - Reference photos (limited to secure style references).
   - Core purpose: Answer the real-world operational question: *"What did this customer usually want?"*

## Privacy and Data Minimization (KVKK / GDPR / CCPA)
- Collection is strictly limited to data necessary for appointment operations and service continuity.
- **Reference photos are strictly for service history**. 
- **NO BIOMETRICS:** They are NOT processed for facial recognition, biometric identification, or automatic AI profiling constraints under any circumstance.
- Explicit visual notices remind owners that photos are strictly internal and not for public sharing.
- Customers booking online must accept terms/KVKK policies that indicate data is used purely for communication and service context.

## Mock / MVP Implementation
Currently, customer data on the admin side is aggregated in runtime from the mock `Appointment` array and maintained natively in `localStorage` under keys `mock_tenant_customers_{tenantId}`. Photos are restricted to local base64 strings under 3MB. No central data sync occurs.

## Production / Next Phase Architecture (Supabase)
Before switching to the production database, the following must be enacted:
1. **Explicit Consent Texts:** Bilgilendirme/Aydınlatma metni must visibly cover storing style preferences and reference photos for internal operational use.
2. **Data Deletion APIs:** A robust capability to completely wipe a customer record (notes, photos, and anonymize appointments) must be exposed to handle deletion requests securely.
3. **Storage Restrictions:** 
   - Bucket: `tenant-private-files`.
   - The bucket must **NOT** be public.
   - Postgres Row-Level Security (RLS) policies must mandate that the JWT `auth.uid()` corresponds exactly to the `tenant_id` linked to the customer entity.
4. **Data Retention Policy:** Implement cron jobs or edge functions to eventually rotate or archive aged reference photos exceeding required retention constraints.

## Strict AI Usage Boundaries
- **No Automatic AI Submission:** Customer Memory private notes and reference photos are **NOT** sent to the AI by default.
- **Explicit Processing Only:** Only photos/prompts explicitly submitted via the `/ai-visualizer` flow are sent to the AI backend proxy.
- **Volatile Processing:** Edge Functions process AI imagery directly in memory and delete references. No images are stored by AI providers for training purposes.
- **Storage Isolation:** Edge function operations isolate standard mock testing. Supabase storage boundaries segregate `tenant-public-media` and `customer-private-reference-photos`.
- **No Deep AI Photo Analysis:** Customer faces are NOT subjected to biometric identification, facial recognition routines, or emotional profiling. Features are strictly limited to hair/eyebrow/style and beauty domain advice.
