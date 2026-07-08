# Data Mode and Service Boundaries

LARİ is designed with an explicit abstraction layer separating mock data behavior (local testing MVP) and the production Edge-Function/Supabase backend.

## Environment Resolution
The data layer boundary is defined by `VITE_DATA_MODE`:
*   `VITE_DATA_MODE=mock`: Application uses local storage, dummy delays, and offline-safe memory responses.
*   `VITE_DATA_MODE=supabase`: Application leverages the Supabase Client and invokes Edge Functions for secure executions.

## Boundaries Explained

### Frontend Security Boundary
*   **No API Keys**: Supabase Service Role, Iyzico Secrets, and Gemini API keys are completely banned from the frontend bundle.
*   **Auth Mediation**: Customers use a lightweight "Customer Account Lite" mode (localStorage autofill) natively, which upgrades to strict Supabase Auth (OTP/Magic Links) solely for secure portal fetching.

### Service Interactions
1.  **AI Services (Gemini)**:
    *   `geminiService.ts` contains API interface contracts but **must not initialize the SDK**.
    *   It triggers `supabase.functions.invoke('ai-recommendation')` in production modes instead of calling Google APIs directly.
2.  **Payment Services (Iyzico)**:
    *   No card details touch `paymentProvider.ts`.
    *   In mock mode: `initiateSubscription` instantly routes to success mock page.
    *   In supabase mode: `initiateSubscription` requests an Iyzico checkout session from Edge Functions and redirects to the payment page.
3.  **Data Entities (Tenants, Appointments)**:
    *   Standard CRUD goes through `dataProvider.ts`, dynamically routed to `supabaseDataProvider` or `mockDataProvider`.

## Future Transition Steps
*   Currently, services use mock resolution primarily. To pivot to Supabase:
    *   Ensure migrations are applied.
    *   Deploy all Edge Functions.
    *   Flip `.env` flags.
    *   No major component rewrite is needed because logic wraps `dataProvider`.
