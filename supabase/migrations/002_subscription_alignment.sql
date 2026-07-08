-- 002_subscription_alignment.sql

-- Add provider_reference to subscriptions if not exists (for saving stripe customer id or iyzico token)
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS provider_reference VARCHAR(255);

-- Add subscription_id to payments
ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL;
