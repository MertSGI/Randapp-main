-- LARİ Paymentless Production Core Tables Migration
-- Date: 2026-06-20
-- This migration provisions tables supporting self-service tokens, change requests,
-- outbox logs, support tickets, and legal consent tracking under a paymentless setup.

-- 1. Appointment Access Tokens (Self-Service)
CREATE TABLE IF NOT EXISTS appointment_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    appointment_id UUID NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    used_at TIMESTAMPTZ
);

ALTER TABLE appointment_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select by token hash" ON appointment_access_tokens
    FOR SELECT USING (true);

CREATE POLICY "Allow tenant owner management" ON appointment_access_tokens
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));


-- 2. Appointment Change Requests (Cancellations/Rescheduling)
CREATE TABLE IF NOT EXISTS appointment_change_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    appointment_id UUID NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('cancel', 'reschedule')),
    requested_by TEXT NOT NULL CHECK (requested_by IN ('customer', 'salon')),
    proposed_date DATE,
    proposed_time TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT
);

ALTER TABLE appointment_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow tenant owner reads and writes" ON appointment_change_requests
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));

CREATE POLICY "Allow public inserts" ON appointment_change_requests
    FOR INSERT WITH CHECK (true);


-- 3. Communication Outbox
CREATE TABLE IF NOT EXISTS communication_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    recipient TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('sms', 'whatsapp', 'email')),
    message TEXT NOT NULL,
    status TEXT DEFAULT 'queued' NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE communication_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owner can read outbox" ON communication_outbox
    FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id'));

CREATE POLICY "System/Admin can manage outbox" ON communication_outbox
    USING (true);


-- 4. Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT,
    actor_id TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    payload JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owner can read own audit logs" ON audit_events
    FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id'));


-- 5. Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open' NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    priority TEXT DEFAULT 'normal' NOT NULL CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owner can manage tickets" ON support_tickets
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));


-- 6. Policy Acceptances (Legal compliance logs)
CREATE TABLE IF NOT EXISTS policy_acceptances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT,
    user_id TEXT,
    policy_type TEXT NOT NULL CHECK (policy_type IN ('terms', 'privacy_policy', 'kvkk_consent', 'cookie_policy')),
    version TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    accepted_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE policy_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select acceptances for reporting" ON policy_acceptances
    FOR SELECT USING (tenant_id = (auth.jwt() ->> 'tenant_id') OR user_id = auth.uid()::text);

CREATE POLICY "Allow public insert acceptances" ON policy_acceptances
    FOR INSERT WITH CHECK (true);


-- 7. Consent Ledger
CREATE TABLE IF NOT EXISTS consent_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,
    consent_type TEXT NOT NULL,
    is_granted BOOLEAN NOT NULL,
    ip_address TEXT,
    digital_signature TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE consent_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owners can read/write ledger" ON consent_ledger
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));

CREATE POLICY "Allow public insertion during checkout" ON consent_ledger
    FOR INSERT WITH CHECK (true);


-- 8. Data Rights Requests (KVKK requests)
CREATE TABLE IF NOT EXISTS data_rights_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    requester_contact TEXT NOT NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('export', 'deletion', 'rectification')),
    details TEXT,
    status TEXT DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE data_rights_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant owners can manage data rights requests" ON data_rights_requests
    USING (tenant_id = (auth.jwt() ->> 'tenant_id'));
