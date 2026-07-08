-- 004_iyzico_provider_alignment.sql

-- Align subscriptions table
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS provider_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS provider_subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS provider_session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS current_period_start TIMESTAMP WITH TIME ZONE;

-- (current_period_end is already in 001_initial_schema.sql)

-- Align payments table
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS provider VARCHAR(50),
ADD COLUMN IF NOT EXISTS provider_payment_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS provider_event_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS metadata JSONB;
