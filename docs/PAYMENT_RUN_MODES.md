# Payment Run Modes

The LARİ platform supports three distinct payment run modes. These modes are designed to enforce a safe, staged approach to integrating Iyzico logic without leaking test states to legitimate users.

Modes are strictly internal. A regular end user will **never** see terms like "sandbox", "dry run", or "mock" in the UI.

## 1. Local Dry Run (`local_dry_run`)
This is the default mode used for local development and product flow QA. 

- **Behavior**: Clicking "Pay" simulates a success or failure securely within the local client state.
- **External Network**: Zero. No calls are made to Supabase Edge Functions or Iyzico.
- **Secrets**: No secrets required.
- **Use Case**: Verifying UI flows (e.g. "Does clicking *Start Subscription* navigate to the billing tab properly?")

## 2. Sandbox Live (`sandbox_live`)
This mode triggers genuine test flows using Iyzico's Sandbox environment.

- **Behavior**: Initializes a real checkout session using sandbox pricing references.
- **External Network**: Calls `create-checkout-session` edge function. Needs Iyzico and Supabase APIs.
- **Secrets**: Requires configured Iyzico sandbox API credentials and reference mappings.
- **Use Case**: Developer staging. Verifying that Webhooks are delivered correctly.

**To unlock Sandbox Live**, the internal Readiness check must pass (no missing secrets or webhook URLs).

## 3. Production Live (`production_live`)
The final gate. Real transactions.

- **Behavior**: Uses live Iyzico product plan reference codes to process credit card provisions.
- **External Network**: Communicates directly through live Supabase endpoints and Iyzico Live APIs.
- **Secrets**: Requires production `IYZICO_API_KEY` and `IYZICO_SECRET_KEY` mapped in Edge Functions.
- **Use Case**: Real business operations.

## Managing the Mode

You can toggle the mode via the **Super Admin -> Sandbox ve Yayın Hazırlığı** console. 

* The mode changes apply to your local machine (using internal storage variables). We isolate testing to not degrade the production configuration interface.
* Production deployments automatically inject the correct runtime variables to enforce the exact environment.
