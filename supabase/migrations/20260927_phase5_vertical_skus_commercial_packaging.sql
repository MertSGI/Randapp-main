-- =========================================================================
-- MIGRATION: 20260927_phase5_vertical_skus_commercial_packaging.sql
-- Description: Phase 5 Node 1 — Explicit Vertical SKUs, Quotas & Commercial
--              Entitlement Foundation for LARİ Clinic & LARİ Health Tourism.
-- Author: AOS Primary Orchestrator
-- Authority: DECISION-020 / LARI-PROGRAM-V2-REAL-PRODUCT-20260908-01
-- Governance:
--   - Reuses canonical commercial catalog, plans, plan_versions, plan_entitlements.
--   - Zero duplicate commercial table creation.
--   - Zero provider activation / payment collection (paymentless invariants preserved).
--   - Production status remains NO_GO.
-- =========================================================================

-- =========================================================================
-- 1. REGISTER CANONICAL VERTICAL COMMERCIAL FEATURE DEFINITIONS
-- =========================================================================

INSERT INTO public.commercial_feature_definitions (
    feature_key,
    value_type,
    category,
    public_label,
    description,
    maturity,
    publicly_claimable,
    unit
)
VALUES
    -- Clinic Vertical Core & Limits
    ('clinic_workspace', 'boolean', 'core', 'Klinik Çalışma Alanı', 'Hasta profili, anamnez, klinik vizit ve protokol yönetimi', 'LIVE_ENFORCED', true, NULL),
    ('max_practitioners', 'integer', 'limits', 'Maksimum Aktif Hekim/Uygulayıcı', 'Klinik kapsamında yetkilendirilebilecek aktif uygulayıcı sayısı', 'LIVE_ENFORCED', true, 'uygulayıcı'),
    ('clinic_ai_transcribe', 'boolean', 'operations', 'Klinik AI Dikte ve Transkript', 'Konsültasyon esnasında hekim ses kaydını metne dönüştürme', 'CODE_PRESENT', false, NULL),
    ('clinic_ai_soap_draft', 'boolean', 'operations', 'Klinik AI SOAP Not Taslağı', 'Klinik not taslağı oluşturma ve hekim onay süreci', 'CODE_PRESENT', false, NULL),

    -- Health Tourism Vertical Core & Limits
    ('ht_lead_ops', 'boolean', 'core', 'Sağlık Turizmi Lead Operasyonları', 'Çok dilli lead havuzu, SLA takibi ve koordinatör yönetimi', 'LIVE_ENFORCED', true, NULL),
    ('ht_multilingual_funnel', 'boolean', 'channels', 'Çok Dilli Hasta Karşılama', 'TR, EN, DE, RU, AR dillerinde hasta kabul ve iletişim hunisi', 'LIVE_ENFORCED', true, NULL),
    ('max_active_journeys', 'integer', 'limits', 'Maksimum Aktif Tedavi Yolculuğu', 'Aynı anda yürütülebilecek aktif tedavi ve seyahat planı sayısı', 'LIVE_ENFORCED', true, 'yolculuk'),
    ('max_coordinators', 'integer', 'limits', 'Maksimum Hasta Koordinatörü', 'Sağlık turizmi lead ve hasta süreçlerini yürüten aktif personel sayısı', 'LIVE_ENFORCED', true, 'koordinatör'),
    ('ht_agency_network', 'boolean', 'operations', 'Acente & Referans Networkü', 'Yurt dışı yönlendirici acente komisyon ve hasta sevk takibi', 'CODE_PRESENT', true, NULL),
    ('ht_ai_chat', 'boolean', 'channels', 'Sağlık Turizmi AI Ön Karşılama Asistanı', 'Web ve mesaj kanallarında 5 dilde otomatik ön değerlendirme asistanı', 'CODE_PRESENT', false, NULL),
    ('ht_journey_quote', 'boolean', 'operations', 'Tedavi Yolculuğu, Fiyat Teklifi ve Seyahat Planı', 'Çok para birimli tedavi teklifleri ve konaklama/transfer seyahat planı', 'CODE_PRESENT', true, NULL)
ON CONFLICT (feature_key) DO UPDATE SET
    value_type = EXCLUDED.value_type,
    category = EXCLUDED.category,
    public_label = EXCLUDED.public_label,
    description = EXCLUDED.description,
    maturity = EXCLUDED.maturity,
    publicly_claimable = EXCLUDED.publicly_claimable,
    unit = EXCLUDED.unit,
    updated_at = now();


-- =========================================================================
-- 2. SEED CANONICAL VERTICAL PLANS
-- =========================================================================

INSERT INTO public.plans (
    code,
    public_name,
    internal_description,
    is_public,
    is_active,
    is_assignable,
    is_legacy,
    sort_order
)
VALUES
    -- Clinic Vertical SKUs
    ('clinic_starter', 'LARİ Klinik Başlangıç', 'Bağımsız hekimler ve küçük ölçekli muayenehaneler için klinik yönetim paketi', true, true, true, false, 10),
    ('clinic_pro', 'LARİ Klinik Profesyonel', 'Çok hekimli klinikler, tıp merkezleri ve konsültasyon ekipleri için gelişmiş paket', true, true, true, false, 11),

    -- Health Tourism Vertical SKUs
    ('ht_starter', 'LARİ Sağlık Turizmi Başlangıç', 'Uluslararası hasta kabulüne başlayan klinikler ve butik sağlık turizmi acenteleri', true, true, true, false, 20),
    ('ht_enterprise', 'LARİ Sağlık Turizmi Kurumsal', 'Yüksek hacimli sağlık turizmi hastaneleri, zincir klinikler ve global acente networkleri', false, true, true, false, 21)
ON CONFLICT (code) DO UPDATE SET
    public_name = EXCLUDED.public_name,
    internal_description = EXCLUDED.internal_description,
    is_public = EXCLUDED.is_public,
    is_active = EXCLUDED.is_active,
    is_assignable = EXCLUDED.is_assignable,
    is_legacy = EXCLUDED.is_legacy,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();


-- =========================================================================
-- 3. SEED PUBLISHED VERSION 1 FOR VERTICAL PLANS WITH CONCURRENCY SAFETY
-- =========================================================================

DO $$
DECLARE
    v_clinic_starter_id    UUID;
    v_clinic_pro_id        UUID;
    v_ht_starter_id        UUID;
    v_ht_enterprise_id     UUID;

    v_clinic_starter_ver_id UUID;
    v_clinic_pro_ver_id     UUID;
    v_ht_starter_ver_id     UUID;
    v_ht_enterprise_ver_id  UUID;
BEGIN
    SELECT id INTO v_clinic_starter_id FROM public.plans WHERE code = 'clinic_starter';
    SELECT id INTO v_clinic_pro_id FROM public.plans WHERE code = 'clinic_pro';
    SELECT id INTO v_ht_starter_id FROM public.plans WHERE code = 'ht_starter';
    SELECT id INTO v_ht_enterprise_id FROM public.plans WHERE code = 'ht_enterprise';

    -- A. Clinic Starter Version 1
    INSERT INTO public.plan_versions (
        plan_id, version_number, lifecycle_status, currency,
        monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days,
        effective_from, internal_note
    )
    VALUES (
        v_clinic_starter_id, 1, 'draft', 'TRY',
        1490.00, 14900.00, 16.67, 0.00, 14,
        now(), 'Phase 5 Clinic Starter Version 1 Initial Packaging'
    )
    ON CONFLICT (plan_id, version_number) DO UPDATE SET
        monthly_price = EXCLUDED.monthly_price,
        annual_price = EXCLUDED.annual_price
    RETURNING id INTO v_clinic_starter_ver_id;

    -- B. Clinic Pro Version 1
    INSERT INTO public.plan_versions (
        plan_id, version_number, lifecycle_status, currency,
        monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days,
        effective_from, internal_note
    )
    VALUES (
        v_clinic_pro_id, 1, 'draft', 'TRY',
        3490.00, 34900.00, 16.67, 0.00, 14,
        now(), 'Phase 5 Clinic Pro Version 1 Initial Packaging'
    )
    ON CONFLICT (plan_id, version_number) DO UPDATE SET
        monthly_price = EXCLUDED.monthly_price,
        annual_price = EXCLUDED.annual_price
    RETURNING id INTO v_clinic_pro_ver_id;

    -- C. Health Tourism Starter Version 1
    INSERT INTO public.plan_versions (
        plan_id, version_number, lifecycle_status, currency,
        monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days,
        effective_from, internal_note
    )
    VALUES (
        v_ht_starter_id, 1, 'draft', 'USD',
        199.00, 1990.00, 16.67, 0.00, 14,
        now(), 'Phase 5 Health Tourism Starter Version 1 Initial Packaging'
    )
    ON CONFLICT (plan_id, version_number) DO UPDATE SET
        monthly_price = EXCLUDED.monthly_price,
        annual_price = EXCLUDED.annual_price
    RETURNING id INTO v_ht_starter_ver_id;

    -- D. Health Tourism Enterprise Version 1
    INSERT INTO public.plan_versions (
        plan_id, version_number, lifecycle_status, currency,
        monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days,
        effective_from, internal_note
    )
    VALUES (
        v_ht_enterprise_id, 1, 'draft', 'USD',
        499.00, 4990.00, 16.67, 0.00, 30,
        now(), 'Phase 5 Health Tourism Enterprise Version 1 Initial Packaging'
    )
    ON CONFLICT (plan_id, version_number) DO UPDATE SET
        monthly_price = EXCLUDED.monthly_price,
        annual_price = EXCLUDED.annual_price
    RETURNING id INTO v_ht_enterprise_ver_id;


    -- =========================================================================
    -- 4. ATOMIC ENTITLEMENT ASSIGNMENT PER VERTICAL PLAN VERSION
    -- =========================================================================

    -- --- 4.1 CLINIC STARTER ENTITLEMENTS ---
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        -- Core platform capabilities
        (v_clinic_starter_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'dedicated_support', 'boolean', false, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'custom_domain_eligible', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_clinic_starter_ver_id, 'calendar_integration', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'advanced_reporting', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'data_export', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'public_api', 'boolean', false, NULL, NULL, false),

        -- Limits
        (v_clinic_starter_ver_id, 'max_staff', 'integer', NULL, 5, NULL, false),
        (v_clinic_starter_ver_id, 'max_services', 'integer', NULL, 50, NULL, false),
        (v_clinic_starter_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_clinic_starter_ver_id, 'max_monthly_appointments', 'integer', NULL, 300, NULL, false),
        (v_clinic_starter_ver_id, 'notification_allowance', 'integer', NULL, 200, NULL, false),
        (v_clinic_starter_ver_id, 'ai_allowance', 'integer', NULL, 100, NULL, false),

        -- Clinic Specific Features & Quotas
        (v_clinic_starter_ver_id, 'clinic_workspace', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'max_practitioners', 'integer', NULL, 2, NULL, false),
        (v_clinic_starter_ver_id, 'clinic_ai_transcribe', 'boolean', true, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'clinic_ai_soap_draft', 'boolean', true, NULL, NULL, false),

        -- Health Tourism Not Included in Clinic Starter
        (v_clinic_starter_ver_id, 'ht_lead_ops', 'boolean', false, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'ht_multilingual_funnel', 'boolean', false, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'max_active_journeys', 'integer', NULL, 0, NULL, false),
        (v_clinic_starter_ver_id, 'max_coordinators', 'integer', NULL, 0, NULL, false),
        (v_clinic_starter_ver_id, 'ht_agency_network', 'boolean', false, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'ht_ai_chat', 'boolean', false, NULL, NULL, false),
        (v_clinic_starter_ver_id, 'ht_journey_quote', 'boolean', false, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET
        boolean_value = EXCLUDED.boolean_value,
        integer_value = EXCLUDED.integer_value,
        text_value = EXCLUDED.text_value,
        is_unlimited = EXCLUDED.is_unlimited;

    -- --- 4.2 CLINIC PRO ENTITLEMENTS ---
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_clinic_pro_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'dedicated_support', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'custom_domain_eligible', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'custom_domain_included', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'multi_branch', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'white_label', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_clinic_pro_ver_id, 'calendar_integration', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'advanced_reporting', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'data_export', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'public_api', 'boolean', true, NULL, NULL, false),

        -- Limits
        (v_clinic_pro_ver_id, 'max_staff', 'integer', NULL, 15, NULL, false),
        (v_clinic_pro_ver_id, 'max_services', 'integer', NULL, 150, NULL, false),
        (v_clinic_pro_ver_id, 'max_branches', 'integer', NULL, 3, NULL, false),
        (v_clinic_pro_ver_id, 'max_monthly_appointments', 'integer', NULL, 1000, NULL, false),
        (v_clinic_pro_ver_id, 'notification_allowance', 'integer', NULL, 1000, NULL, false),
        (v_clinic_pro_ver_id, 'ai_allowance', 'integer', NULL, 500, NULL, false),

        -- Clinic Specific Features & Quotas
        (v_clinic_pro_ver_id, 'clinic_workspace', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'max_practitioners', 'integer', NULL, 8, NULL, false),
        (v_clinic_pro_ver_id, 'clinic_ai_transcribe', 'boolean', true, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'clinic_ai_soap_draft', 'boolean', true, NULL, NULL, false),

        -- Health Tourism Not Included in Clinic Pro
        (v_clinic_pro_ver_id, 'ht_lead_ops', 'boolean', false, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'ht_multilingual_funnel', 'boolean', false, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'max_active_journeys', 'integer', NULL, 0, NULL, false),
        (v_clinic_pro_ver_id, 'max_coordinators', 'integer', NULL, 0, NULL, false),
        (v_clinic_pro_ver_id, 'ht_agency_network', 'boolean', false, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'ht_ai_chat', 'boolean', false, NULL, NULL, false),
        (v_clinic_pro_ver_id, 'ht_journey_quote', 'boolean', false, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET
        boolean_value = EXCLUDED.boolean_value,
        integer_value = EXCLUDED.integer_value,
        text_value = EXCLUDED.text_value,
        is_unlimited = EXCLUDED.is_unlimited;

    -- --- 4.3 HEALTH TOURISM STARTER ENTITLEMENTS ---
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_ht_starter_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'dedicated_support', 'boolean', false, NULL, NULL, false),
        (v_ht_starter_ver_id, 'custom_domain_eligible', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_ht_starter_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_ht_starter_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_ht_starter_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_ht_starter_ver_id, 'calendar_integration', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'advanced_reporting', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'data_export', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'public_api', 'boolean', false, NULL, NULL, false),

        -- Limits
        (v_ht_starter_ver_id, 'max_staff', 'integer', NULL, 10, NULL, false),
        (v_ht_starter_ver_id, 'max_services', 'integer', NULL, 50, NULL, false),
        (v_ht_starter_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_ht_starter_ver_id, 'max_monthly_appointments', 'integer', NULL, 500, NULL, false),
        (v_ht_starter_ver_id, 'notification_allowance', 'integer', NULL, 500, NULL, false),
        (v_ht_starter_ver_id, 'ai_allowance', 'integer', NULL, 250, NULL, false),

        -- Clinic Workspace optional/disabled in HT Starter by default
        (v_ht_starter_ver_id, 'clinic_workspace', 'boolean', false, NULL, NULL, false),
        (v_ht_starter_ver_id, 'max_practitioners', 'integer', NULL, 0, NULL, false),
        (v_ht_starter_ver_id, 'clinic_ai_transcribe', 'boolean', false, NULL, NULL, false),
        (v_ht_starter_ver_id, 'clinic_ai_soap_draft', 'boolean', false, NULL, NULL, false),

        -- Health Tourism Specific Features & Quotas
        (v_ht_starter_ver_id, 'ht_lead_ops', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'ht_multilingual_funnel', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'max_active_journeys', 'integer', NULL, 50, NULL, false),
        (v_ht_starter_ver_id, 'max_coordinators', 'integer', NULL, 3, NULL, false),
        (v_ht_starter_ver_id, 'ht_agency_network', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'ht_ai_chat', 'boolean', true, NULL, NULL, false),
        (v_ht_starter_ver_id, 'ht_journey_quote', 'boolean', true, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET
        boolean_value = EXCLUDED.boolean_value,
        integer_value = EXCLUDED.integer_value,
        text_value = EXCLUDED.text_value,
        is_unlimited = EXCLUDED.is_unlimited;

    -- --- 4.4 HEALTH TOURISM ENTERPRISE ENTITLEMENTS ---
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_ht_enterprise_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'dedicated_support', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'custom_domain_eligible', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'custom_domain_included', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'multi_branch', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'white_label', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_ht_enterprise_ver_id, 'calendar_integration', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'advanced_reporting', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'data_export', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'public_api', 'boolean', true, NULL, NULL, false),

        -- Limits (Unlimited or High Ceiling)
        (v_ht_enterprise_ver_id, 'max_staff', 'integer', NULL, NULL, NULL, true),
        (v_ht_enterprise_ver_id, 'max_services', 'integer', NULL, NULL, NULL, true),
        (v_ht_enterprise_ver_id, 'max_branches', 'integer', NULL, NULL, NULL, true),
        (v_ht_enterprise_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_ht_enterprise_ver_id, 'notification_allowance', 'integer', NULL, 5000, NULL, false),
        (v_ht_enterprise_ver_id, 'ai_allowance', 'integer', NULL, 2000, NULL, false),

        -- Dual-vertical enabled in HT Enterprise (Hospital/Clinic & Medical Tourism Integrated)
        (v_ht_enterprise_ver_id, 'clinic_workspace', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'max_practitioners', 'integer', NULL, 25, NULL, false),
        (v_ht_enterprise_ver_id, 'clinic_ai_transcribe', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'clinic_ai_soap_draft', 'boolean', true, NULL, NULL, false),

        -- Health Tourism Specific Features & Quotas
        (v_ht_enterprise_ver_id, 'ht_lead_ops', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'ht_multilingual_funnel', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'max_active_journeys', 'integer', NULL, NULL, NULL, true),
        (v_ht_enterprise_ver_id, 'max_coordinators', 'integer', NULL, 15, NULL, false),
        (v_ht_enterprise_ver_id, 'ht_agency_network', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'ht_ai_chat', 'boolean', true, NULL, NULL, false),
        (v_ht_enterprise_ver_id, 'ht_journey_quote', 'boolean', true, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO UPDATE SET
        boolean_value = EXCLUDED.boolean_value,
        integer_value = EXCLUDED.integer_value,
        text_value = EXCLUDED.text_value,
        is_unlimited = EXCLUDED.is_unlimited;

    -- Atomic Transition from Draft to Published for Vertical Versions
    UPDATE public.plan_versions
    SET lifecycle_status = 'published',
        published_at = now()
    WHERE id IN (v_clinic_starter_ver_id, v_clinic_pro_ver_id, v_ht_starter_ver_id, v_ht_enterprise_ver_id)
      AND lifecycle_status = 'draft';

    RAISE NOTICE 'Vertical plan versions published: clinic_starter, clinic_pro, ht_starter, ht_enterprise';
END $$;


-- =========================================================================
-- 5. SERVER-AUTHORITATIVE VERTICAL COMMERCIAL ENFORCEMENT RPCS
-- =========================================================================

-- 5A. RPC: Resolve tenant vertical package context
CREATE OR REPLACE FUNCTION public.resolve_tenant_vertical_context(
    p_tenant_id UUID,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_eligible_res   JSONB;
    v_is_eligible    BOOLEAN;
    v_sub_status     TEXT;
    v_plan_code      TEXT;
    v_plan_name      TEXT;
    v_is_clinic      BOOLEAN := false;
    v_is_ht          BOOLEAN := false;
    v_max_pract      BIGINT := 0;
    v_pract_unlim    BOOLEAN := false;
    v_max_coord      BIGINT := 0;
    v_coord_unlim    BOOLEAN := false;
    v_max_journeys   BIGINT := 0;
    v_journeys_unlim BOOLEAN := false;
    v_ai_allowance   BIGINT := 0;
    v_ai_unlim       BOOLEAN := false;
    v_active_pract_count BIGINT := 0;
    v_active_coord_count BIGINT := 0;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'INVALID_TENANT_ID');
    END IF;

    -- Check commercial eligibility
    v_eligible_res := public.resolve_tenant_commercial_eligibility(p_tenant_id, p_at);
    v_is_eligible  := COALESCE((v_eligible_res->>'eligible')::boolean, false);
    v_sub_status   := v_eligible_res->>'status';

    IF NOT v_is_eligible THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', COALESCE(v_eligible_res->>'reason_code', 'COMMERCIAL_NOT_ELIGIBLE'),
            'eligible', false,
            'status', v_sub_status
        );
    END IF;

    -- Determine assigned plan code and name
    SELECT p.code, p.public_name
    INTO v_plan_code, v_plan_name
    FROM public.subscriptions s
    JOIN public.plan_versions pv ON pv.id = s.plan_version_id
    JOIN public.plans p ON p.id = pv.plan_id
    WHERE s.tenant_id = p_tenant_id
      AND (
          s.status IN ('active', 'manual_active', 'comped')
          OR (s.status = 'trialing' AND (s.trial_end IS NULL OR s.trial_end > p_at))
          OR (s.status = 'past_due' AND (s.grace_until IS NULL OR s.grace_until > p_at))
      )
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- Resolve effective entitlements
    SELECT COALESCE(boolean_value, false) INTO v_is_clinic
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id, p_at)
    WHERE feature_key = 'clinic_workspace';

    SELECT COALESCE(boolean_value, false) INTO v_is_ht
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id, p_at)
    WHERE feature_key = 'ht_lead_ops';

    SELECT COALESCE(integer_value, 0), COALESCE(is_unlimited, false)
    INTO v_max_pract, v_pract_unlim
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id, p_at)
    WHERE feature_key = 'max_practitioners';

    SELECT COALESCE(integer_value, 0), COALESCE(is_unlimited, false)
    INTO v_max_coord, v_coord_unlim
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id, p_at)
    WHERE feature_key = 'max_coordinators';

    SELECT COALESCE(integer_value, 0), COALESCE(is_unlimited, false)
    INTO v_max_journeys, v_journeys_unlim
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id, p_at)
    WHERE feature_key = 'max_active_journeys';

    SELECT COALESCE(integer_value, 0), COALESCE(is_unlimited, false)
    INTO v_ai_allowance, v_ai_unlim
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id, p_at)
    WHERE feature_key = 'ai_allowance';

    -- Count active practitioners in tenant
    SELECT count(*) INTO v_active_pract_count
    FROM public.clinic_staff_profiles csp
    JOIN public.staff s ON s.id = csp.staff_id AND s.tenant_id = csp.tenant_id
    WHERE csp.tenant_id = p_tenant_id
      AND s.active = true
      AND (csp.can_write_clinical_notes = true OR csp.can_view_clinical_records = true);

    -- Count active coordinators in tenant
    SELECT count(*) INTO v_active_coord_count
    FROM public.ht_staff_profiles hsp
    JOIN public.staff s ON s.id = hsp.staff_id AND s.tenant_id = hsp.tenant_id
    WHERE hsp.tenant_id = p_tenant_id
      AND s.active = true
      AND (hsp.can_manage_ht_leads = true OR hsp.can_view_ht_leads = true);

    RETURN jsonb_build_object(
        'success', true,
        'tenant_id', p_tenant_id,
        'eligible', true,
        'subscription_status', v_sub_status,
        'plan_code', v_plan_code,
        'plan_name', v_plan_name,
        'verticals', jsonb_build_object(
            'clinic_enabled', COALESCE(v_is_clinic, false),
            'health_tourism_enabled', COALESCE(v_is_ht, false)
        ),
        'quotas', jsonb_build_object(
            'max_practitioners', jsonb_build_object('limit', v_max_pract, 'is_unlimited', v_pract_unlim, 'active', v_active_pract_count),
            'max_coordinators', jsonb_build_object('limit', v_max_coord, 'is_unlimited', v_coord_unlim, 'active', v_active_coord_count),
            'max_active_journeys', jsonb_build_object('limit', v_max_journeys, 'is_unlimited', v_journeys_unlim),
            'ai_allowance', jsonb_build_object('limit', v_ai_allowance, 'is_unlimited', v_ai_unlim)
        )
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_tenant_vertical_context(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_tenant_vertical_context(UUID, TIMESTAMPTZ) TO authenticated, service_role;


-- 5B. Enforcement Trigger: Practitioner quota check when creating or activating clinic staff profile
CREATE OR REPLACE FUNCTION public.enforce_practitioner_quota_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_max_pract      BIGINT := 0;
    v_is_unlimited   BOOLEAN := false;
    v_current_active BIGINT := 0;
    v_clinic_enabled BOOLEAN := false;
BEGIN
    -- Check if tenant is eligible for clinic_workspace
    SELECT COALESCE(boolean_value, false) INTO v_clinic_enabled
    FROM public.resolve_effective_tenant_entitlements(NEW.tenant_id, now())
    WHERE feature_key = 'clinic_workspace';

    IF NOT v_clinic_enabled THEN
        RAISE EXCEPTION 'CLINIC_VERTICAL_NOT_ENTITLED: Tenant does not possess an active clinic_workspace package entitlement.' USING ERRCODE = 'P0001';
    END IF;

    -- If this profile grants clinical practitioner rights, check quota
    IF (NEW.can_write_clinical_notes = true OR NEW.can_view_clinical_records = true) THEN
        SELECT COALESCE(integer_value, 0), COALESCE(is_unlimited, false)
        INTO v_max_pract, v_is_unlimited
        FROM public.resolve_effective_tenant_entitlements(NEW.tenant_id, now())
        WHERE feature_key = 'max_practitioners';

        IF NOT v_is_unlimited THEN
            SELECT count(*) INTO v_current_active
            FROM public.clinic_staff_profiles csp
            JOIN public.staff s ON s.id = csp.staff_id AND s.tenant_id = csp.tenant_id
            WHERE csp.tenant_id = NEW.tenant_id
              AND csp.staff_id <> NEW.staff_id
              AND s.active = true
              AND (csp.can_write_clinical_notes = true OR csp.can_view_clinical_records = true);

            IF (v_current_active + 1) > v_max_pract THEN
                RAISE EXCEPTION 'PRACTITIONER_QUOTA_EXCEEDED: Active practitioner count (%) would exceed plan limit (%).', (v_current_active + 1), v_max_pract USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_practitioner_quota_limit ON public.clinic_staff_profiles;
CREATE TRIGGER trg_enforce_practitioner_quota_limit
    BEFORE INSERT OR UPDATE ON public.clinic_staff_profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_practitioner_quota_limit();


-- 5C. Enforcement Trigger: Coordinator quota check when creating or activating HT staff profile
CREATE OR REPLACE FUNCTION public.enforce_ht_coordinator_quota_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_max_coord      BIGINT := 0;
    v_is_unlimited   BOOLEAN := false;
    v_current_active BIGINT := 0;
    v_ht_enabled     BOOLEAN := false;
BEGIN
    -- Check if tenant is eligible for ht_lead_ops
    SELECT COALESCE(boolean_value, false) INTO v_ht_enabled
    FROM public.resolve_effective_tenant_entitlements(NEW.tenant_id, now())
    WHERE feature_key = 'ht_lead_ops';

    IF NOT v_ht_enabled THEN
        RAISE EXCEPTION 'HT_VERTICAL_NOT_ENTITLED: Tenant does not possess an active ht_lead_ops package entitlement.' USING ERRCODE = 'P0001';
    END IF;

    -- If this profile grants coordinator rights, check quota
    IF (NEW.can_manage_ht_leads = true OR NEW.can_view_ht_leads = true) THEN
        SELECT COALESCE(integer_value, 0), COALESCE(is_unlimited, false)
        INTO v_max_coord, v_is_unlimited
        FROM public.resolve_effective_tenant_entitlements(NEW.tenant_id, now())
        WHERE feature_key = 'max_coordinators';

        IF NOT v_is_unlimited THEN
            SELECT count(*) INTO v_current_active
            FROM public.ht_staff_profiles hsp
            JOIN public.staff s ON s.id = hsp.staff_id AND s.tenant_id = hsp.tenant_id
            WHERE hsp.tenant_id = NEW.tenant_id
              AND hsp.staff_id <> NEW.staff_id
              AND s.active = true
              AND (hsp.can_manage_ht_leads = true OR hsp.can_view_ht_leads = true);

            IF (v_current_active + 1) > v_max_coord THEN
                RAISE EXCEPTION 'COORDINATOR_QUOTA_EXCEEDED: Active HT coordinator count (%) would exceed plan limit (%).', (v_current_active + 1), v_max_coord USING ERRCODE = 'P0001';
            END IF;
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_ht_coordinator_quota_limit ON public.ht_staff_profiles;
CREATE TRIGGER trg_enforce_ht_coordinator_quota_limit
    BEFORE INSERT OR UPDATE ON public.ht_staff_profiles
    FOR EACH ROW EXECUTE FUNCTION public.enforce_ht_coordinator_quota_limit();

-- =========================================================================
-- END MIGRATION: 20260927_phase5_vertical_skus_commercial_packaging.sql
-- =========================================================================
