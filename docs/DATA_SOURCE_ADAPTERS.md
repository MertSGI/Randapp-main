# Data Source Adapters Architecture

To transition the LARİ application cleanly from local storage and mock data into a secure Supabase backend without breaking the current pilot flow or development, we have implemented a **Data Source Adapter Layer**.

## Active Environments
1. **Local Mode (`VITE_LARI_DATA_SOURCE=local`)**: Reads and writes from `localStorage` and maintains mock arrays. This is the fallback mode and is safe for pilot validation, visual demos (`/demo`), and unit testing.
2. **Supabase Mode (`VITE_LARI_DATA_SOURCE=supabase`)**: Interacts securely with the public Supabase REST endpoints using `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Safe Secrets
- **No `SUPABASE_SERVICE_ROLE_KEY` in frontend**.
- No real third-party keys are used directly from the frontend React app.
- Edge functions handle billing webhooks and subscription alignment.

## Repository Factory Pattern
The core services inside `/services/*` no longer fetch manually. They delegate reading and writing to `/services/repositories/index.ts`.

- **`local*Repository`**: Implementations mapping domain objects into JSON strings in `localStorage`.
- **`supabase*Repository`**: Implementations providing clean HTTP requests to the Supabase endpoint. These operate as *stubs* prior to full production cutover (failing gracefully when unprovisioned).

The `dataSourceConfig` inspects environment variables and returns the necessary factory instances.

## Cutover Plan
1. **First Milestone**: `BusinessProfileService` uses the factory.
2. **Second Milestone**: `CatalogRepository` (Services, Staff, and Availability mappings) uses the factory safely. [COMPLETED]
3. **Third Milestone (Current)**: `BookingRepository` (Appointments, Customers, Memory) mapped to factory safe adapters. [COMPLETED]

### Completed Repositories so far:
- **BusinessProfileRepository**: manages tenant identity.
- **CatalogRepository**: manages services/staff associations.
- **BookingRepository**: manages appointments, parses customer profiles on-the-fly to isolate memory tracking logic structurally safely.

## QA Validation
Using `npm run qa:data-source-adapters`, we guarantee that:
- Raw card components are not introduced.
- Service keys are omitted from the frontend.
- Pilot flow continues identically to its original design.
