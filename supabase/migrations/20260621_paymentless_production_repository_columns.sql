-- LARİ Paymentless Production Repository Columns Migration
-- Date: 2026-06-21
-- Adds missing manual/offline billing columns to the subscriptions table to support the paymentless_limited_production launch.

ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS billing_source TEXT,
ADD COLUMN IF NOT EXISTS paid_through_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS payment_reference_note TEXT,
ADD COLUMN IF NOT EXISTS next_manual_review_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS manual_activation_reason TEXT;
