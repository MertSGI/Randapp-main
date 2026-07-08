# Service Contracts

To facilitate the backend migration, our service layer must act through standard interfaces regardless of the persistence layer (LocalStorage vs. Supabase). 

## Expected Service Operations

### TenantRegistrationService
- `createTenantShell(payload: TenantConfig): Promise<Tenant>`
- `setActiveTenant(tenantId: string): void`
- `getActiveTenantContext(): Promise<Tenant | null>`

### BusinessProfileService
- `getProfile(tenantId: string): Promise<BusinessProfile>`
- `updateProfile(tenantId: string, payload: Partial<BusinessProfile>): Promise<void>`
- `submitForReview(tenantId: string): Promise<void>`
- `publishStatus(tenantId: string): Promise<PublishStatusRecord>`

### BranchService
- `getStoredBranches(tenantId: string): BusinessBranch[]`
- `ensurePrimaryBranchForTenant(tenantId: string): Promise<BusinessBranch>`
- `listBranches(tenantId: string): Promise<BusinessBranch[]>`
- `createBranch(tenantId: string, input: Partial<BusinessBranch>): Promise<BusinessBranch>`
- `updateBranch(tenantId: string, branchId: string, patch: Partial<BusinessBranch>): Promise<BusinessBranch | null>`
- `deactivateBranch(tenantId: string, branchId: string): Promise<void>`

### BookingService
- `listPublicServices(tenantId: string): Promise<Service[]>`
- `listAvailability(tenantId: string, staffId?: string, date?: string): Promise<TimeSlot[]>`
- `createAppointment(payload: AppointmentRequest): Promise<Appointment>`

### CustomerMemoryService
- `getCustomer(customerId: string): Promise<CustomerProfile>`
- `updatePreferences(customerId: string, prefs: any): Promise<void>`
- `addNote(customerId: string, note: string): Promise<void>`

### PublicLinkService
- `normalizeSlug(input: string): string`
- `validateSlug(slug: string, currentTenantId?: string): Promise<{ isValid: boolean; error?: string }>`
- `getTenantBookingUrl(tenant: Tenant): string`
- `getBranchBookingUrl(tenant: Tenant, branchSlugOrId: string): string`
- `getShareText(tenant: Tenant, context: string, branchSlugOrId?: string): string`
- `getQrPayload(url: string): string`
- `canUseCustomDomain(tenant: Tenant): boolean`

### SubscriptionService
- `createPendingCheckout(tenantId: string, planId: string): Promise<CheckoutSession>`
- `markTrialing(tenantId: string): Promise<void>`
- `markActive(tenantId: string): Promise<void>`
- `markPastDue(tenantId: string): Promise<void>`
- `cancelSubscription(tenantId: string): Promise<void>`

### NotificationTemplateService
- `getTemplate(templateId: string): Promise<NotificationTemplate>`
- `renderTemplate(templateId: string, variables: any): Promise<string>`
- `logNotification(log: NotificationLogRequest): Promise<void>`

### SuperAdminService
- `listTenants(): Promise<Tenant[]>`
- `approveTenant(tenantId: string): Promise<void>`
- `rejectTenant(tenantId: string, reasons: string): Promise<void>`
- `suspendTenant(tenantId: string): Promise<void>`
- `syncSubscription(tenantId: string): Promise<void>`
