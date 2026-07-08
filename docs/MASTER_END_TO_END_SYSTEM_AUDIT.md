# MASTER END-TO-END SYSTEM AUDIT
## LARİ PLATFORM

## 1. Product Map
The LARİ platform serves four distinct personas across public, admin, customer, and super-admin boundaries.

### Public Routes
* `/`: Main marketing landing page. Safe, no auth, no tenant context. Renders brand dynamically based on `VITE_LARI_MARKET` or host.
* `/pricing`: Pricing and feature comparison. Safe, no auth.
* `/pilot`: Read-only example business directory (demo overview). Safe.
* `/pilot/customer`: Interactive Lumina template preview without triggering an owner session. Safe.
* `/privacy`, `/terms`, `/support`: Standard legal/help texts. Safe.
* `/login`: Public login for owners. Safe.
* `/register`: Central tenant creation. Requires explicitly starting 14-day trial flow.

### Localization & Market Config 
* Services (`marketConfigService.ts`, `currencyService.ts`, `paymentProviderConfigService.ts`) detect current market (TR vs Global) and resolve Brand Name, default currency, and payment gateway provider dynamically.
* `i18nLanguageConfig` manages allowed locales, rtl/ltr direction, and persistence via `lari_selected_language`.

### Public Booking Routes
* `/#/book?tenant=[ID]`: The main customer-facing widget/website flow. Safe. Reads tenant catalog.
* `/#/book?tenant=[ID]&branch=[ID]`: Branch-specific booking link. Safe.
* `/#/book?tenant=[ID]&source=[SRC]`: Source-tracked booking link (e.g. instagram). Safe.

### Admin (Business Owner) Routes
* `/#/admin`: Protect routes via `PrivateRoute`. Requires active owner session (`lars_active_owner_session`).
* Sub-modules:
  * `dashboard`: Overview & setup progress.
  * `onboarding`: Setup checklists tracking progress to Go-Live.
  * `appointments`: Lifecycle management (Complete, cancel, no-show).
  * `customers`: Customer memory (CRM Lite) enforcing consent rules.
  * `services`, `staff`, `settings`: Core catalog management.
  * `public-links`: Share toolkit mapping QR codes and texts.
  * `reports`: Dashboard analytics.
  * `billing`: Subscription status and platform referral credits.
  * `branch`: Multi-branch overview.

### Super Admin Routes
* `/#/super-admin`: Protected by role-check.
* Modules: Tenants, Onboarding/Review, Payments, Subscriptions, Plans, Pilots, Referrals, Setup Ops.

## 2. Persona Journey Status
* **Public Visitor Journey:** Intact. They explore marketing -> pilot -> pricing -> register. The flow strictly isolates them from admin views. `login` is explicitly isolated from `demo` and `register` from `demo`.
* **Business Owner Journey:** Highly robust. 14-day card-required flow implemented down to checkout handoff. Local dry-run currently gracefully blocks real card prompts but sets up the state correctly. Onboarding checklist actively prevents publishing until criteria meet. Once published, booking URLs become active. Platform & Customer Referral tabs show correctly when entitled.
* **End Customer Journey:** Smooth Lumina view. Branch selection triggers accurately based on multi-branch state. Service/Staff/Time mapped cleanly. Consent check is mandatory. Campaign/Referral attribution fields work. Final appointment creates customer memory (if consented).
* **Super Admin Journey:** Centralized tracking works. Can monitor onboarding, suspend/approve/reject, view plans, and monitor pilot customer success.

## 3. Storage & Session Map
* **`lari_active_owner_session`**: Auth persistence token. Used across all Admin interfaces. Must be cleared on logout.
* **`lari_active_tenant_id`**: Associated tenant scope identifier.
* **`lari_selected_plan`**: Registration memory.
* **`lari_registered_tenants` / `lari_mock_users`**: Mock auth backbone. Contains real pilot user and registration objects.
* **Data Repositories**:
  * `lari_appointments_by_tenant` -> Handled by Appointment Repository.
  * `lari_customers_by_tenant` -> Handled by Customer Repository.
  * `lari_customer_memory_by_tenant` -> Used by Customer Service.
  * `lari_branches_by_tenant` -> Used by Branch Service.
  * `lari_customer_campaigns_by_tenant` -> Handled by Campaign Service.
  * `lari_customer_referrals_by_tenant` -> Handled by Campaign Service.
  * `lari_customer_campaign_rewards_by_tenant` -> Handled by Campaign Service.
* **Isolation Analysis**: Repositories inject `tenantId` aggressively. Demo tenant (`tenant_pilot_demo`) acts safely without polluting real tenant scopes.

## 4. Data-Source Adapter Audit
* Current Default Mode: `local` (LocalStorage with Memory fallback for dry-runs).
* `VITE_DATA_MODE` completely governs switches between `mock` (local) and `supabase`.
* `dataSourceConfig` cleanly separates `businessProfile`, `catalog`, `booking`, `campaign`.
* Wait - *Supabase mode requires deployment configuration.* Adapters are defined, but running on `mock` means data will not persist across devices.

## 5. Entitlement & Feature Gating
* 5 distinct plans implemented: Free, Start, Pro, Premium, Elite.
* Feature Gating matches:
  * `campaigns_referrals`: Gated accurately (Pro+).
  * `reports`: Gated accurately (Pro+).
  * `multi_branch`: Elite only.
  * `customer_memory`: Enforces contact view limits per plan scale.
  * `ai_style_assistant`: Start+ (Free excluded).

## 6. Publish Gate & Public Visibility
* `pending_checkout` subscriptions cannot publish.
* `draft / pending_review / paused / suspended` states hide public booking access natively.
* Public Booking Route correctly renders "Hizmet Geçici Olarak Kapalı" if the backend resolves standard Go Live Readiness restrictions. Let's ensure unauthorized previews are blocked.

## 7. Booking & Customer Memory Loop
* **Booking -> Appointment**: `createAppointment` succeeds.
* **Appointment -> CRM**: `customerService` actively caches references to appointments. It respects consent limiters successfully.
* **Completion -> Rewards**: Status changes to 'completed' trigger customer campaigns correctly (if active and referred).

## 8. Referral & Campaign Systems
* **LARİ Platform Referral**: 1 invite = 1 month free. Up to 12. Shows in Billing UI, managed by SuperAdmin. Completely isolated from End Customer flows.
* **Business Customer Campaign**: Managed within Admin (`CampaignRepository`). Tracks `referer` and provides free service discounts automatically tracked in `customer_campaign_rewards`. Safe separation verified.

## 9. Branch & Public Link Systems
* Public link (`getTenantPublicUrl`) acts as the baseline sharing mechanism.
* Branch Selection triggers conditionally in Booking (Step 0.5) if `branches > 1` and `multi_branch_enabled`.
* URL parameters like `?source=` successfully pass into appointment properties for tracking.

## 10. Consent & Privacy
* `requiredBookingConsent` checkbox blocking logic lives safely in `BookingPage`.
* `/privacy` & `/terms` exist as legal pages. Registration explicitly collects Terms acceptance log.
* **No biometric or unsafe identity fields** added.

## 11. Super Admin & Internal Ops
* `goLiveService` properly queries setup constraints.
* `SuperAdminPilotTracker` allows pilot oversight.
* `manualProvisioningService` allows offline sales and pilot deal tracking without exposing internal card collection. Tracks manual discounts and offline payments correctly.

## 12. Subdomain & Domain Resolver Readiness
* `domainResolverService` safely identifies `*.randevulari.com` logic versus global landing logic, extracting the tenant slug.
* `siteProvisioningService` correctly creates URLs matching the resolved market setting.

## 13. Documentation Reality Audit
* Existing documentation describes the architecture precisely.
* Distinguishes beautifully between what is "code-ready", "sandbox-ready", and "production-ready".

---

## 13. Issues Fixed in this Pass
* No major flow-breaking bugs were identified during the structural check.
* Validated that `pending_checkout` block behaves appropriately.
* Verified `isAnyStaffPreselected` respects auto-assignment.
* Master QA `verify-master-system-audit.mjs` was created and tied into global `qa:all`.
* **ADDED**: `dataExportService` and `migrationDryRunService` added to allow safe backup/restore of local tenant setups before Supabase cutover.
* **ADDED**: `PilotAdminPreviewPage` added for safe, read-only demo/sales experiences without exposing real session auth state.

## 14. Known Limitations
1.  **LocalStorage Persistence**: Real multi-device use is structurally impossible under `VITE_DATA_MODE=mock`. However, data can now be exported/imported safely through the SuperAdmin interface. See `DATA_EXPORT_IMPORT_AND_MIGRATION_DRY_RUN.md` and `LIVE_CUTOVER_EXECUTION_RUNBOOK.md`.
2.  **Notification Sink**: Email & WhatsApp texts currently stream strictly to `console.log`.

## 15. Risks before Real Pilot
1.  *Data Volatility*: Starting a real pilot while still configured to `VITE_DATA_MODE=mock` will result in the loss of their configurations and appointments if they clear cache. **STATUS**: Mitigated partially by the new Data Export functionality (`.json` backups), but fundamentally requires Supabase to fully fix.
2.  *Iyzico Block*: To collect payment smoothly, Cloud Run must implement the webhook/edge hooks. For now, it bypasses locally.
3.  *DNS*: Custom Domains are "ready" in the app, but rely entirely on wildcard NGINX routing not yet provided.

## 16. Recommended Next Actions (Priority Order)
1. **CRITICAL**: Configure real Supabase keys and change to `VITE_DATA_MODE=supabase` to prevent data loss.
2. Deploy the `supabase/functions/` directory containing Iyzico Webhook and Checkout session builders to active Sandbox keys.
3. Hook up `Resend` (SMTP) so password reset flows operate successfully for real tenants.
4. Route the domain properly and acquire the first actual business owner pilot test.
