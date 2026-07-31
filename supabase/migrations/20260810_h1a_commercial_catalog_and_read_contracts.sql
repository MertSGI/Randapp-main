-- 20260810_h1a_commercial_catalog_and_read_contracts.sql
-- Stage H1A — Canonical Commercial Schema, Immutable Catalog Versioning, and Read Contracts (Hardened & Concurrency-Safe)
-- Description:
-- Provisions:
--   1. public.commercial_feature_definitions (registered keys, types, categories, maturity, immutable value_type trigger)
--   2. public.plans & public.plan_versions (canonical plans, immutable plan codes, concurrency-safe single published version enforcement, immutable versioning)
--   3. public.plan_entitlements & type consistency triggers
--   4. public.subscriptions schema alignment (plan_version_id, billing_mode, grace_until, commercial_version)
--   5. public.tenant_entitlement_overrides & type consistency triggers
--   6. public.platform_system_restrictions (Level 1 platform restriction foundation)
--   7. public.subscription_events & public.billing_transactions (append-only ledgers, financial integrity constraints)
--   8. public.usage_counters (schema foundation)
--   9. Internal helper: public.resolve_effective_tenant_entitlements (4-level precedence: platform_restriction -> tenant_override -> plan_version -> default_deny)
--  10. Public RPC: public.get_public_commercial_plan_catalog
--  11. Authenticated RPC: public.get_my_commercial_subscription_snapshot
--  12. Super Admin RPCs: public.super_admin_get_commercial_catalog & public.super_admin_get_tenant_commercial_snapshot
--  13. Fail-closed RLS policies and execution grants.

-- =========================================================================
-- 1. COMMERCIAL FEATURE DEFINITIONS TABLE & VALUE TYPE IMMUTABILITY TRIGGER
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.commercial_feature_definitions (
    feature_key TEXT PRIMARY KEY,
    value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'text', 'json')),
    category TEXT NOT NULL CHECK (category IN ('core', 'operations', 'limits', 'channels', 'customization', 'integrations', 'support')),
    public_label TEXT NOT NULL,
    description TEXT,
    maturity TEXT NOT NULL CHECK (maturity IN ('LIVE_ENFORCED', 'LIVE_NOT_PACKAGE_ENFORCED', 'CODE_PRESENT', 'SCHEMA_PRESENT', 'MOCK_ONLY', 'DOCUMENTED_ONLY', 'ROADMAP', 'ABSENT')),
    publicly_claimable BOOLEAN NOT NULL DEFAULT false,
    unit TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_commercial_feature_definitions_modtime
    BEFORE UPDATE ON public.commercial_feature_definitions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enforce value_type Immutability Trigger
CREATE OR REPLACE FUNCTION public.enforce_feature_definition_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.value_type IS DISTINCT FROM OLD.value_type THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_FEATURE_VALUE_TYPE: Changing feature value_type is prohibited as it invalidates existing entitlements and restrictions.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_feature_definition_immutability ON public.commercial_feature_definitions;
CREATE TRIGGER trg_enforce_feature_definition_immutability
    BEFORE UPDATE ON public.commercial_feature_definitions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_definition_immutability();

ALTER TABLE public.commercial_feature_definitions ENABLE ROW LEVEL SECURITY;

-- Seed Feature Definitions
INSERT INTO public.commercial_feature_definitions (feature_key, value_type, category, public_label, description, maturity, publicly_claimable, unit)
VALUES
    ('core_booking', 'boolean', 'core', 'Online Randevu Sistemi', 'Müşterilerin online randevu alabilmesi', 'LIVE_ENFORCED', true, NULL),
    ('customer_self_service', 'boolean', 'core', 'Müşteri Self-Servis Portalı', 'Müşterilerin randevularını yönetebilmesi', 'LIVE_ENFORCED', true, NULL),
    ('customer_cancellation', 'boolean', 'core', 'Randevu İptal Hakkı', 'Müşterilerin online randevu iptali yapabilmesi', 'LIVE_ENFORCED', true, NULL),
    ('customer_reschedule_request', 'boolean', 'core', 'Randevu Değişiklik Talebi', 'Müşterilerin onaylı randevu değişiklik talebi gönderebilmesi', 'LIVE_ENFORCED', true, NULL),
    ('admin_appointment_operations', 'boolean', 'operations', 'İşletme Randevu Yönetimi', 'Admin panelinden randevu takibi ve takvim yönetimi', 'LIVE_ENFORCED', true, NULL),
    ('staff_management', 'boolean', 'operations', 'Personel Yönetimi', 'Personel profilleri ve çalışma saatleri yönetimi', 'LIVE_ENFORCED', true, NULL),
    ('service_management', 'boolean', 'operations', 'Hizmet Kataloğu Yönetimi', 'Hizmet, süre ve fiyat yönetimi', 'LIVE_ENFORCED', true, NULL),
    ('max_staff', 'integer', 'limits', 'Maksimum Aktif Personel', 'Paket kapsamında eklenebilecek aktif personel sayısı', 'LIVE_NOT_PACKAGE_ENFORCED', true, 'personel'),
    ('max_services', 'integer', 'limits', 'Maksimum Aktif Hizmet', 'Paket kapsamında eklenebilecek aktif hizmet sayısı', 'LIVE_NOT_PACKAGE_ENFORCED', true, 'hizmet'),
    ('max_branches', 'integer', 'limits', 'Maksimum Şube Sayısı', 'Paket kapsamında açılabilecek şube sayısı', 'LIVE_NOT_PACKAGE_ENFORCED', true, 'şube'),
    ('max_monthly_appointments', 'integer', 'limits', 'Aylık Randevu Limiti', 'Aylık alınabilecek maksimum randevu sayısı', 'LIVE_NOT_PACKAGE_ENFORCED', true, 'randevu'),
    ('multi_branch', 'boolean', 'operations', 'Çoklu Şube Desteği', 'Birden fazla şube ve lokasyon yönetimi', 'CODE_PRESENT', false, NULL),
    ('notification_allowance', 'integer', 'channels', 'Dış Bildirim Kotası', 'Aylık SMS/WhatsApp dış bildirim kotası', 'CODE_PRESENT', false, 'bildirim'),
    ('ai_allowance', 'integer', 'operations', 'Yapay Zeka Kullanım Kotası', 'Aylık AI stil asistanı kullanım hakkı', 'CODE_PRESENT', false, 'kullanım'),
    ('lari_minisite', 'boolean', 'customization', 'LARİ Mini-Site ve Profili', 'İşletmeye özel açılan online randevu ve tanıtım sayfası', 'LIVE_ENFORCED', true, NULL),
    ('custom_domain_eligible', 'boolean', 'customization', 'Özel Alan Adı Desteği', 'Kendi özel alan adını bağlama', 'MOCK_ONLY', false, NULL),
    ('custom_domain_included', 'boolean', 'customization', 'Dahili Özel Alan Adı', 'Pakete dahil ücretsiz özel alan adı kurulumu', 'MOCK_ONLY', false, NULL),
    ('white_label', 'boolean', 'customization', 'Beyaz Etiket (White-Label)', 'LARİ markasını kaldırıp tamamen işletme markasını öne çıkarma', 'MOCK_ONLY', false, NULL),
    ('calendar_integration', 'boolean', 'integrations', 'Google Takvim Entegrasyonu', 'Dış takvimlerle iki yönlü randevu senkronizasyonu', 'CODE_PRESENT', false, NULL),
    ('advanced_reporting', 'boolean', 'operations', 'Gelişmiş Raporlama', 'Gelir, personel performansı ve doluluk raporları', 'CODE_PRESENT', false, NULL),
    ('crm_level', 'text', 'operations', 'Müşteri Hafızası (CRM)', 'Müşteri geçmişi ve tercih takibi seviyesi (lite/full)', 'CODE_PRESENT', false, NULL),
    ('data_export', 'boolean', 'operations', 'Veri Dışa Aktarma', 'Müşteri ve randevu verilerini Excel/CSV alma', 'CODE_PRESENT', false, NULL),
    ('public_api', 'boolean', 'integrations', 'Geliştirici API Erişimi', 'Özel yazılımlarla entegrasyon için API erişimi', 'ABSENT', false, NULL),
    ('priority_support', 'boolean', 'support', 'Öncelikli Destek', '7/24 öncelikli müşteri ve teknik destek hattı', 'LIVE_ENFORCED', true, NULL),
    ('dedicated_support', 'boolean', 'support', 'Özel Müşteri Temsilcisi', 'Birebir özel müşteri başarı temsilcisi ve yerinde eğitim', 'LIVE_ENFORCED', true, NULL)
ON CONFLICT (feature_key) DO UPDATE SET
    value_type = EXCLUDED.value_type,
    category = EXCLUDED.category,
    public_label = EXCLUDED.public_label,
    description = EXCLUDED.description,
    maturity = EXCLUDED.maturity,
    publicly_claimable = EXCLUDED.publicly_claimable,
    unit = EXCLUDED.unit;


-- =========================================================================
-- 2. PLANS TABLE & PLAN CODE IMMUTABILITY TRIGGER
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL CHECK (trim(code) != ''),
    public_name TEXT NOT NULL,
    internal_description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT true,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_assignable BOOLEAN NOT NULL DEFAULT true,
    is_legacy BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_plans_modtime
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Plan Code Immutability Trigger
CREATE OR REPLACE FUNCTION public.enforce_plan_code_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF NEW.code IS DISTINCT FROM OLD.code THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_PLAN_CODE: Plan codes are immutable identifiers.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_code_immutability ON public.plans;
CREATE TRIGGER trg_enforce_plan_code_immutability
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_code_immutability();

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

-- Seed Canonical Plans
INSERT INTO public.plans (code, public_name, internal_description, is_public, is_active, is_assignable, is_legacy, sort_order)
VALUES
    ('baslangic', 'Başlangıç', 'Tek kişilik salon ve bağımsız uzmanlar için temel paket', true, true, true, false, 1),
    ('professional', 'Profesyonel', 'Büyüyen salonlar ve 5 personele kadar ekipler için ideal paket', true, true, true, false, 2),
    ('premium', 'Premium', 'Geniş kadrolu salonlar ve yüksek hacimli işletmeler için tam paket', true, true, true, false, 3),
    ('kurumsal', 'Kurumsal', 'Çoklu şubeli zincir salonlar ve özel gereksinimleri olan kurumsal işletmeler', false, true, true, false, 4),
    ('standart', 'Standart (Miras)', 'Eski Standart paket aboneleri için korunan miras plan snapshot', false, true, false, true, 99)
ON CONFLICT (code) DO UPDATE SET
    public_name = EXCLUDED.public_name,
    internal_description = EXCLUDED.internal_description,
    is_public = EXCLUDED.is_public,
    is_active = EXCLUDED.is_active,
    is_assignable = EXCLUDED.is_assignable,
    is_legacy = EXCLUDED.is_legacy,
    sort_order = EXCLUDED.sort_order;


-- =========================================================================
-- 3. PLAN VERSIONS TABLE, IMMUTABILITY & CONCURRENCY-SAFE OVERLAP TRIGGERS
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.plan_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id UUID NOT NULL REFERENCES public.plans(id) ON DELETE RESTRICT,
    version_number INTEGER NOT NULL CHECK (version_number > 0),
    lifecycle_status TEXT NOT NULL CHECK (lifecycle_status IN ('draft', 'published', 'retired')),
    currency TEXT CHECK (currency IS NULL OR (length(currency) = 3 AND currency = upper(currency))),
    monthly_price NUMERIC(10,2) CHECK (monthly_price IS NULL OR monthly_price >= 0),
    annual_price NUMERIC(10,2) CHECK (annual_price IS NULL OR annual_price >= 0),
    annual_discount_percent NUMERIC(5,2) CHECK (annual_discount_percent IS NULL OR (annual_discount_percent >= 0 AND annual_discount_percent <= 100)),
    setup_fee NUMERIC(10,2) CHECK (setup_fee IS NULL OR setup_fee >= 0),
    trial_days INTEGER CHECK (trial_days IS NULL OR trial_days >= 0),
    effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_to TIMESTAMPTZ CHECK (effective_to IS NULL OR effective_to > effective_from),
    published_at TIMESTAMPTZ,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    internal_note TEXT,
    CONSTRAINT uq_plan_versions_plan_version UNIQUE (plan_id, version_number)
);

ALTER TABLE public.plan_versions ENABLE ROW LEVEL SECURITY;

-- 3A. Concurrency-Safe Single Effective Published Version Overlap Prevention Trigger
CREATE OR REPLACE FUNCTION public.enforce_single_published_plan_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_overlap_count INTEGER;
BEGIN
    IF NEW.lifecycle_status = 'published' THEN
        -- Acquire plan-scoped advisory lock to serialize concurrent published version checks for this plan_id
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.plan_id::text, 0));

        SELECT COUNT(*) INTO v_overlap_count
        FROM public.plan_versions pv
        WHERE pv.plan_id = NEW.plan_id
          AND pv.id IS DISTINCT FROM NEW.id
          AND pv.lifecycle_status = 'published'
          AND (
            (NEW.effective_from, COALESCE(NEW.effective_to, '9999-12-31 23:59:59+00'::timestamptz)) OVERLAPS
            (pv.effective_from, COALESCE(pv.effective_to, '9999-12-31 23:59:59+00'::timestamptz))
          );

        IF v_overlap_count > 0 THEN
            RAISE EXCEPTION 'OVERLAPPING_PUBLISHED_PLAN_VERSION: A plan cannot have two simultaneously effective published versions.' USING ERRCODE = 'P0001';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_single_published_plan_version ON public.plan_versions;
CREATE TRIGGER trg_enforce_single_published_plan_version
    BEFORE INSERT OR UPDATE ON public.plan_versions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_single_published_plan_version();

-- 3B. Published Plan Version Immutability & Retirement Integrity Trigger
CREATE OR REPLACE FUNCTION public.enforce_plan_version_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.lifecycle_status = 'published' THEN
            RAISE EXCEPTION 'CANNOT_DELETE_PUBLISHED_PLAN_VERSION: Published plan versions are immutable financial records.' USING ERRCODE = 'P0001';
        END IF;
        RETURN OLD;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.lifecycle_status = 'published' THEN
            -- Verify that if transitioning to retired, NO commercial content field was mutated
            IF NEW.lifecycle_status = 'retired' THEN
                IF NEW.plan_id IS DISTINCT FROM OLD.plan_id OR
                   NEW.version_number IS DISTINCT FROM OLD.version_number OR
                   NEW.currency IS DISTINCT FROM OLD.currency OR
                   NEW.monthly_price IS DISTINCT FROM OLD.monthly_price OR
                   NEW.annual_price IS DISTINCT FROM OLD.annual_price OR
                   NEW.annual_discount_percent IS DISTINCT FROM OLD.annual_discount_percent OR
                   NEW.setup_fee IS DISTINCT FROM OLD.setup_fee OR
                   NEW.trial_days IS DISTINCT FROM OLD.trial_days OR
                   NEW.effective_from IS DISTINCT FROM OLD.effective_from THEN
                    RAISE EXCEPTION 'CANNOT_MUTATE_PUBLISHED_PLAN_VERSION: Retirement transition cannot alter commercial content values.' USING ERRCODE = 'P0001';
                END IF;
                RETURN NEW;
            ELSE
                RAISE EXCEPTION 'CANNOT_MUTATE_PUBLISHED_PLAN_VERSION: Published plan versions are immutable. Create a new version for pricing or entitlement changes.' USING ERRCODE = 'P0001';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_version_immutability ON public.plan_versions;
CREATE TRIGGER trg_enforce_plan_version_immutability
    BEFORE UPDATE OR DELETE ON public.plan_versions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_version_immutability();


-- =========================================================================
-- 4. PLAN ENTITLEMENTS TABLE & IMMUTABILITY / TYPE CONSISTENCY TRIGGERS
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.plan_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_version_id UUID NOT NULL REFERENCES public.plan_versions(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL REFERENCES public.commercial_feature_definitions(feature_key) ON DELETE RESTRICT,
    value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'text', 'json')),
    boolean_value BOOLEAN,
    integer_value BIGINT,
    text_value TEXT,
    json_value JSONB,
    is_unlimited BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    CONSTRAINT uq_plan_entitlements_version_feature UNIQUE (plan_version_id, feature_key),
    CONSTRAINT chk_plan_entitlements_value_shape CHECK (
        (value_type = 'boolean' AND boolean_value IS NOT NULL AND integer_value IS NULL AND text_value IS NULL AND json_value IS NULL AND is_unlimited = false) OR
        (value_type = 'integer' AND is_unlimited = false AND integer_value IS NOT NULL AND integer_value >= 0 AND boolean_value IS NULL AND text_value IS NULL AND json_value IS NULL) OR
        (value_type = 'integer' AND is_unlimited = true AND integer_value IS NULL AND boolean_value IS NULL AND text_value IS NULL AND json_value IS NULL) OR
        (value_type = 'text' AND text_value IS NOT NULL AND boolean_value IS NULL AND integer_value IS NULL AND json_value IS NULL AND is_unlimited = false) OR
        (value_type = 'json' AND json_value IS NOT NULL AND boolean_value IS NULL AND integer_value IS NULL AND text_value IS NULL AND is_unlimited = false)
    )
);

ALTER TABLE public.plan_entitlements ENABLE ROW LEVEL SECURITY;

-- Entitlement & Feature Definition Type Consistency Function
CREATE OR REPLACE FUNCTION public.enforce_entitlement_type_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_def_type TEXT;
BEGIN
    SELECT value_type INTO v_def_type
    FROM public.commercial_feature_definitions
    WHERE feature_key = NEW.feature_key;

    IF v_def_type IS NULL THEN
        RAISE EXCEPTION 'UNKNOWN_FEATURE_KEY: Feature key % is not registered.', NEW.feature_key USING ERRCODE = 'P0001';
    END IF;

    IF NEW.value_type != v_def_type THEN
        RAISE EXCEPTION 'ENTITLEMENT_TYPE_MISMATCH: Entitlement value_type (%) does not match feature definition value_type (%).', NEW.value_type, v_def_type USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_entitlements_type_consistency ON public.plan_entitlements;
CREATE TRIGGER trg_enforce_plan_entitlements_type_consistency
    BEFORE INSERT OR UPDATE ON public.plan_entitlements
    FOR EACH ROW EXECUTE FUNCTION public.enforce_entitlement_type_consistency();

-- Immutability Enforcement Function for Plan Entitlements
CREATE OR REPLACE FUNCTION public.enforce_plan_entitlement_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_version_status TEXT;
BEGIN
    SELECT lifecycle_status INTO v_version_status
    FROM public.plan_versions
    WHERE id = COALESCE(OLD.plan_version_id, NEW.plan_version_id);

    IF v_version_status = 'published' THEN
        RAISE EXCEPTION 'CANNOT_MUTATE_PUBLISHED_PLAN_ENTITLEMENTS: Entitlements of published plan versions are immutable.' USING ERRCODE = 'P0001';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_plan_entitlement_immutability ON public.plan_entitlements;
CREATE TRIGGER trg_enforce_plan_entitlement_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.plan_entitlements
    FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_entitlement_immutability();


-- =========================================================================
-- SEED VERSION 1 CATALOG AND ENTITLEMENTS
-- =========================================================================

DO $$
DECLARE
    v_baslangic_plan_id   UUID;
    v_pro_plan_id         UUID;
    v_premium_plan_id     UUID;
    v_kurumsal_plan_id    UUID;
    v_standart_plan_id    UUID;
    v_baslangic_ver_id    UUID;
    v_pro_ver_id          UUID;
    v_premium_ver_id      UUID;
    v_kurumsal_ver_id     UUID;
    v_standart_ver_id     UUID;
BEGIN
    SELECT id INTO v_baslangic_plan_id FROM public.plans WHERE code = 'baslangic';
    SELECT id INTO v_pro_plan_id       FROM public.plans WHERE code = 'professional';
    SELECT id INTO v_premium_plan_id   FROM public.plans WHERE code = 'premium';
    SELECT id INTO v_kurumsal_plan_id  FROM public.plans WHERE code = 'kurumsal';
    SELECT id INTO v_standart_plan_id  FROM public.plans WHERE code = 'standart';

    -- 1. Başlangıç Version 1
    SELECT id INTO v_baslangic_ver_id FROM public.plan_versions WHERE plan_id = v_baslangic_plan_id AND version_number = 1;
    IF v_baslangic_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_baslangic_plan_id, 1, 'draft', 'TRY', 990.00, 9504.00, 20.00, 0.00, 14, NULL, 'Approved Version 1 Catalog')
        RETURNING id INTO v_baslangic_ver_id;
    END IF;

    -- 2. Profesyonel Version 1
    SELECT id INTO v_pro_ver_id FROM public.plan_versions WHERE plan_id = v_pro_plan_id AND version_number = 1;
    IF v_pro_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_pro_plan_id, 1, 'draft', 'TRY', 2490.00, 23904.00, 20.00, 0.00, 14, NULL, 'Approved Version 1 Catalog')
        RETURNING id INTO v_pro_ver_id;
    END IF;

    -- 3. Premium Version 1
    SELECT id INTO v_premium_ver_id FROM public.plan_versions WHERE plan_id = v_premium_plan_id AND version_number = 1;
    IF v_premium_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_premium_plan_id, 1, 'draft', 'TRY', 4490.00, 43104.00, 20.00, 0.00, 14, NULL, 'Approved Version 1 Catalog')
        RETURNING id INTO v_premium_ver_id;
    END IF;

    -- 4. Kurumsal Version 1
    SELECT id INTO v_kurumsal_ver_id FROM public.plan_versions WHERE plan_id = v_kurumsal_plan_id AND version_number = 1;
    IF v_kurumsal_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_kurumsal_plan_id, 1, 'draft', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'Enterprise Custom Agreements')
        RETURNING id INTO v_kurumsal_ver_id;
    END IF;

    -- 5. Legacy Standart Version 1
    SELECT id INTO v_standart_ver_id FROM public.plan_versions WHERE plan_id = v_standart_plan_id AND version_number = 1;
    IF v_standart_ver_id IS NULL THEN
        INSERT INTO public.plan_versions (plan_id, version_number, lifecycle_status, currency, monthly_price, annual_price, annual_discount_percent, setup_fee, trial_days, published_at, internal_note)
        VALUES (v_standart_plan_id, 1, 'draft', 'TRY', 2490.00, 23904.00, 20.00, 0.00, 14, NULL, 'Legacy Standart compatibility snapshot')
        RETURNING id INTO v_standart_ver_id;
    END IF;

    -- Seed Entitlements for Başlangıç Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_baslangic_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'max_staff', 'integer', NULL, 1, NULL, false),
        (v_baslangic_ver_id, 'max_services', 'integer', NULL, 15, NULL, false),
        (v_baslangic_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_baslangic_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_baslangic_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_baslangic_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_baslangic_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_baslangic_ver_id, 'custom_domain_eligible', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'crm_level', 'text', NULL, NULL, 'lite', false),
        (v_baslangic_ver_id, 'priority_support', 'boolean', false, NULL, NULL, false),
        (v_baslangic_ver_id, 'dedicated_support', 'boolean', false, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Entitlements for Profesyonel Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_pro_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'max_staff', 'integer', NULL, 5, NULL, false),
        (v_pro_ver_id, 'max_services', 'integer', NULL, 50, NULL, false),
        (v_pro_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_pro_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_pro_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_pro_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_pro_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'custom_domain_eligible', 'boolean', false, NULL, NULL, false),
        (v_pro_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_pro_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_pro_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_pro_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_pro_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_pro_ver_id, 'dedicated_support', 'boolean', false, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Entitlements for Premium Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_premium_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'max_staff', 'integer', NULL, 15, NULL, false),
        (v_premium_ver_id, 'max_services', 'integer', NULL, NULL, NULL, true),
        (v_premium_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_premium_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_premium_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_premium_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_premium_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'custom_domain_eligible', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_premium_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_premium_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_premium_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_premium_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_premium_ver_id, 'dedicated_support', 'boolean', true, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Entitlements for Kurumsal Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_kurumsal_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'max_staff', 'integer', NULL, NULL, NULL, true),
        (v_kurumsal_ver_id, 'max_services', 'integer', NULL, NULL, NULL, true),
        (v_kurumsal_ver_id, 'max_branches', 'integer', NULL, NULL, NULL, true),
        (v_kurumsal_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_kurumsal_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_kurumsal_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_kurumsal_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'custom_domain_eligible', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'custom_domain_included', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'multi_branch', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'white_label', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'crm_level', 'text', NULL, NULL, 'full', false),
        (v_kurumsal_ver_id, 'priority_support', 'boolean', true, NULL, NULL, false),
        (v_kurumsal_ver_id, 'dedicated_support', 'boolean', true, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Entitlements for Legacy Standart Version 1
    INSERT INTO public.plan_entitlements (plan_version_id, feature_key, value_type, boolean_value, integer_value, text_value, is_unlimited)
    VALUES
        (v_standart_ver_id, 'core_booking', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'customer_self_service', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'customer_cancellation', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'customer_reschedule_request', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'admin_appointment_operations', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'staff_management', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'service_management', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'max_staff', 'integer', NULL, 3, NULL, false),
        (v_standart_ver_id, 'max_services', 'integer', NULL, 25, NULL, false),
        (v_standart_ver_id, 'max_branches', 'integer', NULL, 1, NULL, false),
        (v_standart_ver_id, 'max_monthly_appointments', 'integer', NULL, NULL, NULL, true),
        (v_standart_ver_id, 'notification_allowance', 'integer', NULL, 0, NULL, false),
        (v_standart_ver_id, 'ai_allowance', 'integer', NULL, 0, NULL, false),
        (v_standart_ver_id, 'lari_minisite', 'boolean', true, NULL, NULL, false),
        (v_standart_ver_id, 'custom_domain_eligible', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'custom_domain_included', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'multi_branch', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'white_label', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'crm_level', 'text', NULL, NULL, 'lite', false),
        (v_standart_ver_id, 'priority_support', 'boolean', false, NULL, NULL, false),
        (v_standart_ver_id, 'dedicated_support', 'boolean', false, NULL, NULL, false)
    ON CONFLICT (plan_version_id, feature_key) DO NOTHING;

    -- Seed Completeness Guard Verification
    IF (SELECT count(*) FROM public.plan_entitlements WHERE plan_version_id = v_baslangic_ver_id) < 21 OR
       (SELECT count(*) FROM public.plan_entitlements WHERE plan_version_id = v_pro_ver_id) < 21 OR
       (SELECT count(*) FROM public.plan_entitlements WHERE plan_version_id = v_premium_ver_id) < 21 OR
       (SELECT count(*) FROM public.plan_entitlements WHERE plan_version_id = v_kurumsal_ver_id) < 21 OR
       (SELECT count(*) FROM public.plan_entitlements WHERE plan_version_id = v_standart_ver_id) < 21 THEN
        RAISE EXCEPTION 'INCOMPLETE_VERSION_1_SEED: Cannot publish Version 1 plan versions because entitlement seeding is incomplete.' USING ERRCODE = 'P0001';
    END IF;

    -- Atomic Transition from Draft to Published
    UPDATE public.plan_versions
    SET lifecycle_status = 'published',
        published_at = now()
    WHERE lifecycle_status = 'draft';
END $$;
END $$;


-- =========================================================================
-- 5. SUBSCRIPTIONS TABLE ALIGNMENT & COMPATIBILITY BACKFILL
-- =========================================================================

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES public.plan_versions(id) ON DELETE RESTRICT,
ADD COLUMN IF NOT EXISTS billing_mode TEXT CHECK (billing_mode IS NULL OR billing_mode IN ('provider', 'manual', 'comped')),
ADD COLUMN IF NOT EXISTS grace_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS commercial_version BIGINT NOT NULL DEFAULT 1 CHECK (commercial_version >= 1);

-- Backfill plan_version_id deterministically for existing subscriptions rows
UPDATE public.subscriptions s
SET plan_version_id = pv.id
FROM public.plans p
JOIN public.plan_versions pv ON pv.plan_id = p.id AND pv.version_number = 1
WHERE s.plan_version_id IS NULL
  AND s.plan_id IS NOT NULL
  AND lower(s.plan_id) = p.code;


-- =========================================================================
-- 6. TENANT ENTITLEMENT OVERRIDES TABLE & TYPE CONSISTENCY TRIGGER
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.tenant_entitlement_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL REFERENCES public.commercial_feature_definitions(feature_key) ON DELETE RESTRICT,
    value_type TEXT NOT NULL CHECK (value_type IN ('boolean', 'integer', 'text', 'json')),
    boolean_value BOOLEAN,
    integer_value BIGINT,
    text_value TEXT,
    json_value JSONB,
    is_unlimited BOOLEAN NOT NULL DEFAULT false,
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ CHECK (expires_at IS NULL OR expires_at > starts_at),
    revoked_at TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id),
    revoked_by UUID REFERENCES auth.users(id),
    reason TEXT NOT NULL CHECK (trim(reason) != ''),
    revoke_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_tenant_overrides_value_shape CHECK (
        (value_type = 'boolean' AND boolean_value IS NOT NULL AND integer_value IS NULL AND text_value IS NULL AND json_value IS NULL AND is_unlimited = false) OR
        (value_type = 'integer' AND is_unlimited = false AND integer_value IS NOT NULL AND integer_value >= 0 AND boolean_value IS NULL AND text_value IS NULL AND json_value IS NULL) OR
        (value_type = 'integer' AND is_unlimited = true AND integer_value IS NULL AND boolean_value IS NULL AND text_value IS NULL AND json_value IS NULL) OR
        (value_type = 'text' AND text_value IS NOT NULL AND boolean_value IS NULL AND integer_value IS NULL AND json_value IS NULL AND is_unlimited = false) OR
        (value_type = 'json' AND json_value IS NOT NULL AND boolean_value IS NULL AND integer_value IS NULL AND text_value IS NULL AND is_unlimited = false)
    )
);

CREATE INDEX IF NOT EXISTS idx_tenant_entitlement_overrides_lookup
ON public.tenant_entitlement_overrides (tenant_id, feature_key, starts_at)
WHERE revoked_at IS NULL;

ALTER TABLE public.tenant_entitlement_overrides ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_enforce_tenant_overrides_type_consistency ON public.tenant_entitlement_overrides;
CREATE TRIGGER trg_enforce_tenant_overrides_type_consistency
    BEFORE INSERT OR UPDATE ON public.tenant_entitlement_overrides
    FOR EACH ROW EXECUTE FUNCTION public.enforce_entitlement_type_consistency();


-- =========================================================================
-- 7. PLATFORM SYSTEM RESTRICTIONS TABLE (LEVEL 1 PRECEDENCE)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.platform_system_restrictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL means global system-wide restriction
    feature_key TEXT NOT NULL REFERENCES public.commercial_feature_definitions(feature_key) ON DELETE RESTRICT,
    is_restricted BOOLEAN NOT NULL DEFAULT true,
    reason TEXT NOT NULL CHECK (trim(reason) != ''),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ CHECK (expires_at IS NULL OR expires_at > starts_at),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_restrictions_lookup
ON public.platform_system_restrictions (tenant_id, feature_key, starts_at);

ALTER TABLE public.platform_system_restrictions ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 8. SUBSCRIPTION EVENTS (APPEND-ONLY LEDGER)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.subscription_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (trim(event_type) != ''),
    previous_state JSONB,
    new_state JSONB,
    internal_reason TEXT NOT NULL CHECK (trim(internal_reason) != ''),
    idempotency_key TEXT UNIQUE CHECK (idempotency_key IS NULL OR trim(idempotency_key) != ''),
    actor_user_id UUID REFERENCES auth.users(id),
    actor_role TEXT,
    effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_tenant_sub
ON public.subscription_events (tenant_id, subscription_id, created_at DESC);

ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;

-- Append-Only Enforcement & Tenant Consistency Trigger for subscription_events
CREATE OR REPLACE FUNCTION public.enforce_append_only_subscription_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_sub_tenant UUID;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: subscription_events is an immutable append-only audit ledger. UPDATE and DELETE are prohibited.' USING ERRCODE = 'P0001';
    END IF;

    -- Verify tenant_id matches subscription tenant_id
    SELECT tenant_id INTO v_sub_tenant
    FROM public.subscriptions WHERE id = NEW.subscription_id;

    IF v_sub_tenant IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION 'CROSS_TENANT_EVENT_VIOLATION: subscription_events tenant_id must match subscription tenant_id.' USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_append_only_subscription_events ON public.subscription_events;
CREATE TRIGGER trg_enforce_append_only_subscription_events
    BEFORE INSERT OR UPDATE OR DELETE ON public.subscription_events
    FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only_subscription_events();


-- =========================================================================
-- 9. BILLING TRANSACTIONS (APPEND-ONLY FINANCIAL LEDGER)
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.billing_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    transaction_type TEXT NOT NULL CHECK (transaction_type IN ('charge', 'payment', 'credit_adjustment', 'debit_adjustment', 'refund', 'reversal', 'void')),
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'TRY' CHECK (length(currency) = 3 AND currency = upper(currency)),
    billing_mode TEXT CHECK (billing_mode IS NULL OR billing_mode IN ('provider', 'manual', 'comped')),
    payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('bank_transfer', 'cash', 'manual_card', 'other')),
    related_transaction_id UUID REFERENCES public.billing_transactions(id) ON DELETE RESTRICT,
    external_provider_reference TEXT,
    reference_note TEXT,
    internal_reason TEXT NOT NULL CHECK (trim(internal_reason) != ''),
    idempotency_key TEXT UNIQUE NOT NULL CHECK (trim(idempotency_key) != ''),
    billing_period_start TIMESTAMPTZ,
    billing_period_end TIMESTAMPTZ CHECK (billing_period_end IS NULL OR billing_period_start IS NULL OR billing_period_end > billing_period_start),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    effective_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    CONSTRAINT chk_billing_transactions_self_ref CHECK (related_transaction_id IS NULL OR related_transaction_id != id)
);

CREATE INDEX IF NOT EXISTS idx_billing_transactions_tenant
ON public.billing_transactions (tenant_id, occurred_at DESC);

ALTER TABLE public.billing_transactions ENABLE ROW LEVEL SECURITY;

-- Financial Ledger Integrity & Append-Only Trigger
CREATE OR REPLACE FUNCTION public.enforce_append_only_billing_transactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_rel_tenant UUID;
    v_rel_sub    UUID;
BEGIN
    IF TG_OP IN ('UPDATE', 'DELETE') THEN
        RAISE EXCEPTION 'APPEND_ONLY_VIOLATION: billing_transactions is an immutable append-only financial ledger. UPDATE and DELETE are prohibited.' USING ERRCODE = 'P0001';
    END IF;

    -- Refund and Reversal MUST reference an original transaction
    IF NEW.transaction_type IN ('refund', 'reversal') AND NEW.related_transaction_id IS NULL THEN
        RAISE EXCEPTION 'REFUND_REVERSAL_MUST_REFERENCE_TRANSACTION: % transactions must reference a valid original transaction.', NEW.transaction_type USING ERRCODE = 'P0001';
    END IF;

    -- Check related_transaction belongs to same tenant
    IF NEW.related_transaction_id IS NOT NULL THEN
        SELECT tenant_id, subscription_id INTO v_rel_tenant, v_rel_sub
        FROM public.billing_transactions WHERE id = NEW.related_transaction_id;

        IF v_rel_tenant IS DISTINCT FROM NEW.tenant_id THEN
            RAISE EXCEPTION 'CROSS_TENANT_TRANSACTION_VIOLATION: Related transaction must belong to the same tenant.' USING ERRCODE = 'P0001';
        END IF;

        IF NEW.subscription_id IS NOT NULL AND v_rel_sub IS NOT NULL AND v_rel_sub IS DISTINCT FROM NEW.subscription_id THEN
            RAISE EXCEPTION 'SUBSCRIPTION_MISMATCH_TRANSACTION_VIOLATION: Related transaction must belong to the same subscription.' USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_append_only_billing_transactions ON public.billing_transactions;
CREATE TRIGGER trg_enforce_append_only_billing_transactions
    BEFORE INSERT OR UPDATE OR DELETE ON public.billing_transactions
    FOR EACH ROW EXECUTE FUNCTION public.enforce_append_only_billing_transactions();


-- =========================================================================
-- 10. USAGE COUNTERS TABLE
-- =========================================================================

CREATE TABLE IF NOT EXISTS public.usage_counters (
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    feature_key TEXT NOT NULL REFERENCES public.commercial_feature_definitions(feature_key) ON DELETE RESTRICT,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL CHECK (period_end > period_start),
    used_count BIGINT NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    reserved_count BIGINT NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
    version BIGINT NOT NULL DEFAULT 1 CHECK (version >= 1),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, feature_key, period_start, period_end)
);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;


-- =========================================================================
-- 11. INTERNAL READ HELPER: resolve_effective_tenant_entitlements (4-LEVEL PRECEDENCE)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.resolve_effective_tenant_entitlements(
    p_tenant_id UUID,
    p_at TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
    feature_key TEXT,
    value_type TEXT,
    boolean_value BOOLEAN,
    integer_value BIGINT,
    text_value TEXT,
    json_value JSONB,
    is_unlimited BOOLEAN,
    source TEXT,
    plan_version_id UUID,
    override_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_sub_plan_version_id UUID;
BEGIN
    IF p_tenant_id IS NULL THEN
        RETURN;
    END IF;

    -- Resolve active subscription's plan_version_id for this tenant
    SELECT sub.plan_version_id INTO v_sub_plan_version_id
    FROM public.subscriptions sub
    WHERE sub.tenant_id = p_tenant_id
      AND sub.status IN ('active', 'manual_active', 'comped', 'trialing')
      AND (sub.current_period_end IS NULL OR sub.current_period_end > p_at)
    ORDER BY sub.created_at DESC
    LIMIT 1;

    RETURN QUERY
    WITH all_keys AS (
        SELECT f.feature_key AS fkey, f.value_type AS vtype
        FROM public.commercial_feature_definitions f
    ),
    -- Level 1: Platform / System Restriction (Highest Precedence)
    platform_rest AS (
        SELECT DISTINCT ON (pr.feature_key)
            pr.feature_key AS fkey
        FROM public.platform_system_restrictions pr
        WHERE (pr.tenant_id = p_tenant_id OR pr.tenant_id IS NULL)
          AND pr.is_restricted = true
          AND pr.starts_at <= p_at
          AND (pr.expires_at IS NULL OR pr.expires_at > p_at)
        ORDER BY pr.feature_key, pr.tenant_id NULLS LAST, pr.starts_at DESC
    ),
    -- Level 2: Active Tenant Override
    active_overrides AS (
        SELECT DISTINCT ON (o.feature_key)
            o.id AS ovr_id,
            o.feature_key AS fkey,
            o.value_type AS vtype,
            o.boolean_value AS bval,
            o.integer_value AS ival,
            o.text_value AS tval,
            o.json_value AS jval,
            o.is_unlimited AS unlim
        FROM public.tenant_entitlement_overrides o
        WHERE o.tenant_id = p_tenant_id
          AND o.starts_at <= p_at
          AND (o.expires_at IS NULL OR o.expires_at > p_at)
          AND o.revoked_at IS NULL
        ORDER BY o.feature_key, o.starts_at DESC, o.created_at DESC
    ),
    -- Level 3: Assigned Plan Version Default
    plan_defaults AS (
        SELECT
            pe.feature_key AS fkey,
            pe.value_type AS vtype,
            pe.boolean_value AS bval,
            pe.integer_value AS ival,
            pe.text_value AS tval,
            pe.json_value AS jval,
            pe.is_unlimited AS unlim
        FROM public.plan_entitlements pe
        WHERE pe.plan_version_id = v_sub_plan_version_id
    )
    SELECT
        k.fkey AS feature_key,
        k.vtype AS value_type,
        CASE
            WHEN pr.fkey IS NOT NULL AND k.vtype = 'boolean' THEN false
            WHEN pr.fkey IS NOT NULL AND k.vtype = 'integer' THEN 0::bigint
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.bval
            WHEN pd.fkey IS NOT NULL THEN pd.bval
            WHEN k.vtype = 'boolean' THEN false
            ELSE NULL
        END AS boolean_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN 0::bigint
            WHEN o.ovr_id IS NOT NULL THEN o.ival
            WHEN pd.fkey IS NOT NULL THEN pd.ival
            WHEN k.vtype = 'integer' THEN 0::bigint
            ELSE NULL
        END AS integer_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.tval
            WHEN pd.fkey IS NOT NULL THEN pd.tval
            ELSE NULL
        END AS text_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN NULL
            WHEN o.ovr_id IS NOT NULL THEN o.jval
            WHEN pd.fkey IS NOT NULL THEN pd.jval
            ELSE NULL
        END AS json_value,
        CASE
            WHEN pr.fkey IS NOT NULL THEN false
            WHEN o.ovr_id IS NOT NULL THEN o.unlim
            WHEN pd.fkey IS NOT NULL THEN pd.unlim
            ELSE false
        END AS is_unlimited,
        CASE
            WHEN pr.fkey IS NOT NULL THEN 'platform_restriction'
            WHEN o.ovr_id IS NOT NULL THEN 'tenant_override'
            WHEN pd.fkey IS NOT NULL THEN 'plan_version'
            ELSE 'default_deny'
        END AS source,
        v_sub_plan_version_id AS plan_version_id,
        o.ovr_id AS override_id
    FROM all_keys k
    LEFT JOIN platform_rest pr ON pr.fkey = k.fkey
    LEFT JOIN active_overrides o ON o.fkey = k.fkey
    LEFT JOIN plan_defaults pd ON pd.fkey = k.fkey;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.resolve_effective_tenant_entitlements(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;


-- =========================================================================
-- 12. PUBLIC RPC: get_public_commercial_plan_catalog
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_public_commercial_plan_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_catalog jsonb;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'plan_code',                p.code,
            'public_name',              p.public_name,
            'sort_order',               p.sort_order,
            'version_number',           pv.version_number,
            'plan_version_id',          pv.id,
            'currency',                 pv.currency,
            'monthly_price',            pv.monthly_price,
            'annual_price',             pv.annual_price,
            'annual_discount_percent',  pv.annual_discount_percent,
            'setup_fee',                pv.setup_fee,
            'trial_days',               pv.trial_days,
            'entitlements',             COALESCE(ents.ent_map, '{}'::jsonb)
        ) ORDER BY p.sort_order ASC
    )
    INTO v_catalog
    FROM public.plans p
    JOIN public.plan_versions pv ON pv.plan_id = p.id AND pv.lifecycle_status = 'published'
    LEFT JOIN LATERAL (
        SELECT jsonb_object_agg(
            pe.feature_key,
            jsonb_build_object(
                'value_type',         pe.value_type,
                'boolean_value',      pe.boolean_value,
                'integer_value',      pe.integer_value,
                'text_value',         pe.text_value,
                'json_value',         pe.json_value,
                'is_unlimited',       pe.is_unlimited,
                'public_label',       fd.public_label,
                'maturity',           fd.maturity,
                'publicly_claimable', fd.publicly_claimable
            )
        ) AS ent_map
        FROM public.plan_entitlements pe
        JOIN public.commercial_feature_definitions fd ON fd.feature_key = pe.feature_key
        WHERE pe.plan_version_id = pv.id
    ) ents ON true
    WHERE p.is_public = true
      AND p.is_active = true
      AND p.is_assignable = true
      AND p.is_legacy = false;

    RETURN COALESCE(v_catalog, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_public_commercial_plan_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_commercial_plan_catalog() TO anon, authenticated;


-- =========================================================================
-- 13. AUTHENTICATED RPC: get_my_commercial_subscription_snapshot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.get_my_commercial_subscription_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   UUID;
    v_tenant_id UUID;
    v_role      TEXT;
    v_sub_row   RECORD;
    v_plan_row  RECORD;
    v_ver_row   RECORD;
    v_ents      jsonb;
    v_overrides jsonb;
    v_usage     jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthenticated');
    END IF;

    SELECT up.tenant_id, up.role INTO v_tenant_id, v_role
    FROM public.users_profile up
    WHERE up.id = v_user_id AND up.active = true;

    IF v_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'no_tenant_association');
    END IF;

    -- Fetch active subscription
    SELECT s.id, s.plan_id, s.plan_version_id, s.status, s.billing_source, s.billing_mode,
           s.paid_through_date, s.grace_until, s.current_period_start, s.current_period_end,
           s.created_at, s.updated_at
    INTO v_sub_row
    FROM public.subscriptions s
    WHERE s.tenant_id = v_tenant_id
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_sub_row.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'reason_code', 'subscription_not_found',
            'tenant_id', v_tenant_id
        );
    END IF;

    -- Fetch assigned plan version and plan metadata
    IF v_sub_row.plan_version_id IS NOT NULL THEN
        SELECT pv.id AS version_id, pv.version_number, pv.currency, pv.monthly_price, pv.annual_price,
               pv.annual_discount_percent, pv.setup_fee, pv.trial_days, pv.lifecycle_status,
               p.code AS plan_code, p.public_name, p.is_legacy
        INTO v_ver_row
        FROM public.plan_versions pv
        JOIN public.plans p ON p.id = pv.plan_id
        WHERE pv.id = v_sub_row.plan_version_id;
    END IF;

    -- Effective entitlements
    SELECT jsonb_object_agg(
        res.feature_key,
        jsonb_build_object(
            'value_type',    res.value_type,
            'boolean_value', res.boolean_value,
            'integer_value', res.integer_value,
            'text_value',    res.text_value,
            'json_value',    res.json_value,
            'is_unlimited',  res.is_unlimited,
            'source',        res.source
        )
    )
    INTO v_ents
    FROM public.resolve_effective_tenant_entitlements(v_tenant_id, now()) res;

    -- Active overrides list
    SELECT jsonb_agg(
        jsonb_build_object(
            'override_id',   o.id,
            'feature_key',   o.feature_key,
            'value_type',    o.value_type,
            'boolean_value', o.boolean_value,
            'integer_value', o.integer_value,
            'text_value',    o.text_value,
            'json_value',    o.json_value,
            'is_unlimited',  o.is_unlimited,
            'starts_at',      o.starts_at,
            'expires_at',     o.expires_at,
            'reason',        o.reason
        ) ORDER BY o.starts_at DESC
    )
    INTO v_overrides
    FROM public.tenant_entitlement_overrides o
    WHERE o.tenant_id = v_tenant_id
      AND o.starts_at <= now()
      AND (o.expires_at IS NULL OR o.expires_at > now())
      AND o.revoked_at IS NULL;

    -- Usage counters
    SELECT jsonb_agg(
        jsonb_build_object(
            'feature_key',    uc.feature_key,
            'period_start',   uc.period_start,
            'period_end',     uc.period_end,
            'used_count',     uc.used_count,
            'reserved_count', uc.reserved_count
        )
    )
    INTO v_usage
    FROM public.usage_counters uc
    WHERE uc.tenant_id = v_tenant_id
      AND uc.period_start <= now()
      AND uc.period_end > now();

    RETURN jsonb_build_object(
        'success',              true,
        'reason_code',           'ok',
        'tenant_id',             v_tenant_id,
        'subscription', jsonb_build_object(
            'subscription_id',    v_sub_row.id,
            'plan_id',            v_sub_row.plan_id,
            'plan_version_id',    v_sub_row.plan_version_id,
            'status',             v_sub_row.status,
            'billing_source',     v_sub_row.billing_source,
            'billing_mode',       v_sub_row.billing_mode,
            'paid_through_date',  v_sub_row.paid_through_date,
            'grace_until',        v_sub_row.grace_until,
            'current_period_start', v_sub_row.current_period_start,
            'current_period_end', v_sub_row.current_period_end
        ),
        'assigned_plan_version', CASE WHEN v_ver_row.version_id IS NOT NULL THEN jsonb_build_object(
            'plan_code',          v_ver_row.plan_code,
            'public_name',        v_ver_row.public_name,
            'version_number',     v_ver_row.version_number,
            'is_legacy',          v_ver_row.is_legacy,
            'currency',           v_ver_row.currency,
            'monthly_price',      v_ver_row.monthly_price,
            'annual_price',       v_ver_row.annual_price,
            'annual_discount_percent', v_ver_row.annual_discount_percent,
            'setup_fee',          v_ver_row.setup_fee,
            'trial_days',         v_ver_row.trial_days
        ) ELSE NULL END,
        'effective_entitlements', COALESCE(v_ents, '{}'::jsonb),
        'active_overrides',       COALESCE(v_overrides, '[]'::jsonb),
        'current_usage_counters', COALESCE(v_usage, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_commercial_subscription_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_commercial_subscription_snapshot() TO authenticated;


-- =========================================================================
-- 14. SUPER ADMIN RPC: super_admin_get_commercial_catalog
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_get_commercial_catalog()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   UUID;
    v_catalog   jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR NOT public.is_super_admin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'plan_id',                  p.id,
            'plan_code',                p.code,
            'public_name',              p.public_name,
            'internal_description',     p.internal_description,
            'is_public',                p.is_public,
            'is_active',                p.is_active,
            'is_assignable',            p.is_assignable,
            'is_legacy',                p.is_legacy,
            'sort_order',               p.sort_order,
            'versions',                 COALESCE(vers.ver_list, '[]'::jsonb)
        ) ORDER BY p.sort_order ASC
    )
    INTO v_catalog
    FROM public.plans p
    LEFT JOIN LATERAL (
        SELECT jsonb_agg(
            jsonb_build_object(
                'version_id',               pv.id,
                'version_number',           pv.version_number,
                'lifecycle_status',         pv.lifecycle_status,
                'currency',                 pv.currency,
                'monthly_price',            pv.monthly_price,
                'annual_price',             pv.annual_price,
                'annual_discount_percent',  pv.annual_discount_percent,
                'setup_fee',                pv.setup_fee,
                'trial_days',               pv.trial_days,
                'effective_from',           pv.effective_from,
                'effective_to',             pv.effective_to,
                'published_at',             pv.published_at,
                'retired_at',               pv.retired_at,
                'internal_note',            pv.internal_note,
                'entitlements',             COALESCE(ents.ent_map, '{}'::jsonb)
            ) ORDER BY pv.version_number DESC
        ) AS ver_list
        FROM public.plan_versions pv
        LEFT JOIN LATERAL (
            SELECT jsonb_object_agg(
                pe.feature_key,
                jsonb_build_object(
                    'value_type',         pe.value_type,
                    'boolean_value',      pe.boolean_value,
                    'integer_value',      pe.integer_value,
                    'text_value',         pe.text_value,
                    'json_value',         pe.json_value,
                    'is_unlimited',       pe.is_unlimited
                )
            ) AS ent_map
            FROM public.plan_entitlements pe
            WHERE pe.plan_version_id = pv.id
        ) ents ON true
        WHERE pv.plan_id = p.id
    ) vers ON true;

    RETURN jsonb_build_object('success', true, 'reason_code', 'ok', 'plans', COALESCE(v_catalog, '[]'::jsonb));
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_get_commercial_catalog() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_get_commercial_catalog() TO authenticated;


-- =========================================================================
-- 15. SUPER ADMIN RPC: super_admin_get_tenant_commercial_snapshot
-- =========================================================================

CREATE OR REPLACE FUNCTION public.super_admin_get_tenant_commercial_snapshot(
    p_tenant_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
    v_user_id   UUID;
    v_sub_row   RECORD;
    v_ver_row   RECORD;
    v_ents      jsonb;
    v_overrides jsonb;
    v_events    jsonb;
    v_txs       jsonb;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL OR NOT public.is_super_admin(v_user_id) THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'unauthorized');
    END IF;

    IF p_tenant_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason_code', 'invalid_tenant');
    END IF;

    SELECT s.id, s.plan_id, s.plan_version_id, s.status, s.billing_source, s.billing_mode,
           s.paid_through_date, s.grace_until, s.current_period_start, s.current_period_end,
           s.payment_reference_note, s.next_manual_review_at, s.manual_activation_reason,
           s.created_at, s.updated_at
    INTO v_sub_row
    FROM public.subscriptions s
    WHERE s.tenant_id = p_tenant_id
    ORDER BY s.created_at DESC
    LIMIT 1;

    IF v_sub_row.id IS NOT NULL AND v_sub_row.plan_version_id IS NOT NULL THEN
        SELECT pv.id AS version_id, pv.version_number, pv.currency, pv.monthly_price, pv.annual_price,
               pv.annual_discount_percent, pv.setup_fee, pv.trial_days, pv.lifecycle_status,
               p.code AS plan_code, p.public_name, p.is_legacy
        INTO v_ver_row
        FROM public.plan_versions pv
        JOIN public.plans p ON p.id = pv.plan_id
        WHERE pv.id = v_sub_row.plan_version_id;
    END IF;

    -- Effective entitlements
    SELECT jsonb_object_agg(
        res.feature_key,
        jsonb_build_object(
            'value_type',    res.value_type,
            'boolean_value', res.boolean_value,
            'integer_value', res.integer_value,
            'text_value',    res.text_value,
            'json_value',    res.json_value,
            'is_unlimited',  res.is_unlimited,
            'source',        res.source,
            'override_id',   res.override_id
        )
    )
    INTO v_ents
    FROM public.resolve_effective_tenant_entitlements(p_tenant_id, now()) res;

    -- Overrides
    SELECT jsonb_agg(
        jsonb_build_object(
            'override_id',   o.id,
            'feature_key',   o.feature_key,
            'value_type',    o.value_type,
            'boolean_value', o.boolean_value,
            'integer_value', o.integer_value,
            'text_value',    o.text_value,
            'json_value',    o.json_value,
            'is_unlimited',  o.is_unlimited,
            'starts_at',      o.starts_at,
            'expires_at',     o.expires_at,
            'revoked_at',    o.revoked_at,
            'reason',        o.reason,
            'revoke_reason', o.revoke_reason
        ) ORDER BY o.created_at DESC
    )
    INTO v_overrides
    FROM public.tenant_entitlement_overrides o
    WHERE o.tenant_id = p_tenant_id;

    -- Recent Events Summary (Last 10)
    SELECT jsonb_agg(
        jsonb_build_object(
            'event_id',       se.id,
            'event_type',     se.event_type,
            'internal_reason', se.internal_reason,
            'actor_role',     se.actor_role,
            'effective_at',   se.effective_at,
            'created_at',     se.created_at
        ) ORDER BY se.created_at DESC
    )
    INTO v_events
    FROM (
        SELECT * FROM public.subscription_events
        WHERE tenant_id = p_tenant_id
        ORDER BY created_at DESC LIMIT 10
    ) se;

    -- Recent Transactions Summary (Last 10)
    SELECT jsonb_agg(
        jsonb_build_object(
            'transaction_id',   bt.id,
            'transaction_type', bt.transaction_type,
            'amount',           bt.amount,
            'currency',         bt.currency,
            'billing_mode',     bt.billing_mode,
            'payment_method',   bt.payment_method,
            'reference_note',   bt.reference_note,
            'internal_reason',  bt.internal_reason,
            'occurred_at',      bt.occurred_at
        ) ORDER BY bt.occurred_at DESC
    )
    INTO v_txs
    FROM (
        SELECT * FROM public.billing_transactions
        WHERE tenant_id = p_tenant_id
        ORDER BY occurred_at DESC LIMIT 10
    ) bt;

    RETURN jsonb_build_object(
        'success',              true,
        'reason_code',           'ok',
        'tenant_id',             p_tenant_id,
        'subscription', CASE WHEN v_sub_row.id IS NOT NULL THEN jsonb_build_object(
            'subscription_id',    v_sub_row.id,
            'plan_id',            v_sub_row.plan_id,
            'plan_version_id',    v_sub_row.plan_version_id,
            'status',             v_sub_row.status,
            'billing_source',     v_sub_row.billing_source,
            'billing_mode',       v_sub_row.billing_mode,
            'paid_through_date',  v_sub_row.paid_through_date,
            'grace_until',        v_sub_row.grace_until,
            'payment_reference_note', v_sub_row.payment_reference_note,
            'next_manual_review_at', v_sub_row.next_manual_review_at,
            'manual_activation_reason', v_sub_row.manual_activation_reason,
            'current_period_start', v_sub_row.current_period_start,
            'current_period_end', v_sub_row.current_period_end
        ) ELSE NULL END,
        'assigned_plan_version', CASE WHEN v_ver_row.version_id IS NOT NULL THEN jsonb_build_object(
            'plan_code',          v_ver_row.plan_code,
            'public_name',        v_ver_row.public_name,
            'version_number',     v_ver_row.version_number,
            'is_legacy',          v_ver_row.is_legacy,
            'currency',           v_ver_row.currency,
            'monthly_price',      v_ver_row.monthly_price,
            'annual_price',       v_ver_row.annual_price,
            'annual_discount_percent', v_ver_row.annual_discount_percent,
            'setup_fee',          v_ver_row.setup_fee,
            'trial_days',         v_ver_row.trial_days
        ) ELSE NULL END,
        'effective_entitlements', COALESCE(v_ents, '{}'::jsonb),
        'overrides_history',      COALESCE(v_overrides, '[]'::jsonb),
        'recent_events',          COALESCE(v_events, '[]'::jsonb),
        'recent_transactions',    COALESCE(v_txs, '[]'::jsonb)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.super_admin_get_tenant_commercial_snapshot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.super_admin_get_tenant_commercial_snapshot(UUID) TO authenticated;


-- =========================================================================
-- 16. RLS POLICIES & DEFAULT DENY PRIVILEGES FOR NEW TABLES
-- =========================================================================

-- Commercial Feature Definitions
DROP POLICY IF EXISTS "Super Admin Full Access on commercial_feature_definitions" ON public.commercial_feature_definitions;
DROP POLICY IF EXISTS "Public Read Access on commercial_feature_definitions" ON public.commercial_feature_definitions;

CREATE POLICY "Super Admin Full Access on commercial_feature_definitions"
ON public.commercial_feature_definitions FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Public Read Access on commercial_feature_definitions"
ON public.commercial_feature_definitions FOR SELECT TO anon, authenticated
USING (true);

-- Plans
DROP POLICY IF EXISTS "Super Admin Full Access on plans" ON public.plans;
DROP POLICY IF EXISTS "Public Read Access on plans" ON public.plans;

CREATE POLICY "Super Admin Full Access on plans"
ON public.plans FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Public Read Access on plans"
ON public.plans FOR SELECT TO anon, authenticated
USING (is_public = true AND is_active = true);

-- Plan Versions
DROP POLICY IF EXISTS "Super Admin Full Access on plan_versions" ON public.plan_versions;
DROP POLICY IF EXISTS "Public Read Access on plan_versions" ON public.plan_versions;

CREATE POLICY "Super Admin Full Access on plan_versions"
ON public.plan_versions FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Public Read Access on plan_versions"
ON public.plan_versions FOR SELECT TO anon, authenticated
USING (lifecycle_status = 'published');

-- Plan Entitlements
DROP POLICY IF EXISTS "Super Admin Full Access on plan_entitlements" ON public.plan_entitlements;
DROP POLICY IF EXISTS "Public Read Access on plan_entitlements" ON public.plan_entitlements;

CREATE POLICY "Super Admin Full Access on plan_entitlements"
ON public.plan_entitlements FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Public Read Access on plan_entitlements"
ON public.plan_entitlements FOR SELECT TO anon, authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.plan_versions pv
        WHERE pv.id = plan_entitlements.plan_version_id
          AND pv.lifecycle_status = 'published'
    )
);

-- Tenant Entitlement Overrides
DROP POLICY IF EXISTS "Super Admin Full Access on tenant_entitlement_overrides" ON public.tenant_entitlement_overrides;
DROP POLICY IF EXISTS "Tenant Staff Read Access on tenant_entitlement_overrides" ON public.tenant_entitlement_overrides;

CREATE POLICY "Super Admin Full Access on tenant_entitlement_overrides"
ON public.tenant_entitlement_overrides FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Staff Read Access on tenant_entitlement_overrides"
ON public.tenant_entitlement_overrides FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.tenant_id = tenant_entitlement_overrides.tenant_id
    )
);

-- Platform System Restrictions (Strict Client Default-Deny RLS; Internal SECURITY DEFINER Read Only)
DROP POLICY IF EXISTS "Super Admin Full Access on platform_system_restrictions" ON public.platform_system_restrictions;
DROP POLICY IF EXISTS "Public Read Access on platform_system_restrictions" ON public.platform_system_restrictions;
-- RLS remains enabled with ZERO permissive policies for anon or authenticated roles.
-- Direct client/browser table access (SELECT/INSERT/UPDATE/DELETE) is 100% denied.
-- Internal helper public.resolve_effective_tenant_entitlements reads this table via SECURITY DEFINER.

-- Subscription Events
DROP POLICY IF EXISTS "Super Admin Full Access on subscription_events" ON public.subscription_events;
DROP POLICY IF EXISTS "Tenant Staff Read Access on subscription_events" ON public.subscription_events;

CREATE POLICY "Super Admin Full Access on subscription_events"
ON public.subscription_events FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Staff Read Access on subscription_events"
ON public.subscription_events FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.tenant_id = subscription_events.tenant_id
    )
);

-- Billing Transactions
DROP POLICY IF EXISTS "Super Admin Full Access on billing_transactions" ON public.billing_transactions;
DROP POLICY IF EXISTS "Tenant Staff Read Access on billing_transactions" ON public.billing_transactions;

CREATE POLICY "Super Admin Full Access on billing_transactions"
ON public.billing_transactions FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Staff Read Access on billing_transactions"
ON public.billing_transactions FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.tenant_id = billing_transactions.tenant_id
    )
);

-- Usage Counters
DROP POLICY IF EXISTS "Super Admin Full Access on usage_counters" ON public.usage_counters;
DROP POLICY IF EXISTS "Tenant Staff Read Access on usage_counters" ON public.usage_counters;

CREATE POLICY "Super Admin Full Access on usage_counters"
ON public.usage_counters FOR ALL TO authenticated
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Tenant Staff Read Access on usage_counters"
ON public.usage_counters FOR SELECT TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.users_profile up
        WHERE up.id = auth.uid()
          AND up.active = true
          AND up.tenant_id = usage_counters.tenant_id
    )
);
