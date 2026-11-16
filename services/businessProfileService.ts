import type { SalonBusinessProfile } from '../types';
import { getBusinessProfileRepository } from './repositories';
import { getDataSourceMode } from './dataSourceConfig';

export type TaxEntityType = 'individual' | 'corporate';
export type TaxVerificationStatus = 'unverified' | 'pending_server_verification' | 'verified';

export interface CommercialTaxProfile {
  tenantId: string;
  entityType: TaxEntityType;
  legalBusinessName: string;
  taxNumber: string;
  taxOffice: string;
  billingAddress: string;
  billingEmail: string;
  eInvoiceRegistered: boolean;
  verificationStatus: TaxVerificationStatus;
  isServerVerified: boolean;
  updatedAt: string;
}

export interface CommercialTaxProfileInput {
  entityType: TaxEntityType;
  legalBusinessName: string;
  taxNumber: string;
  taxOffice?: string;
  billingAddress: string;
  billingEmail: string;
  eInvoiceRegistered?: boolean;
  // Intentionally accepted in input type so anti-tamper guards can reject/strip client spoofing.
  verificationStatus?: TaxVerificationStatus;
  isServerVerified?: boolean;
}

export interface CommercialTaxProfileValidationResult {
  valid: boolean;
  errors: string[];
  normalizedTaxNumber: string;
  detectedIdType: 'vkn' | 'tckn' | 'invalid';
}

export interface SaveCommercialTaxProfileResult {
  success: boolean;
  reasonCode:
    | 'SAVED_LOCAL_DRAFT_PENDING_VERIFICATION'
    | 'INVALID_TAX_PROFILE'
    | 'INVALID_TENANT_ID'
    | 'SERVER_TAX_PROFILE_ENDPOINT_REQUIRED';
  errors: string[];
  profile: CommercialTaxProfile | null;
}

export interface InvoiceAdapterStatus {
  provider: 'efatura_adapter_unconfigured';
  canIssueAutomatedInvoice: false;
  status: 'EXTERNAL_PROVIDER_VERIFICATION_PENDING';
  taxProfileValid: boolean;
  taxProfileServerVerified: false;
  reasonCode: 'MISSING_TAX_PROFILE' | 'INVALID_TAX_PROFILE' | 'SERVER_INVOICE_ADAPTER_REQUIRED';
  blockers: string[];
}

export interface InvoiceIssueRequest {
  tenantId: string;
  transactionReference: string;
  amount: number;
  currency: string;
  taxProfile: CommercialTaxProfileInput | CommercialTaxProfile | null | undefined;
}

export interface InvoiceIssueResult {
  issued: false;
  status: 'REJECTED_CLIENT_FAIL_CLOSED';
  reasonCode: 'INVALID_TENANT_ID' | 'INVALID_AMOUNT' | 'MISSING_TAX_PROFILE' | 'INVALID_TAX_PROFILE' | 'SERVER_INVOICE_ADAPTER_REQUIRED';
  invoiceNumber: null;
  ettn: null;
  errors: string[];
}

function getCommercialTaxStorageKey(tenantId: string): string {
  return `lari:${tenantId.trim()}:commercial_tax_profile`;
}

/**
 * Validates a 10-digit Turkish Tax Identification Number (VKN) using the GİB modulo-10 checksum.
 */
export function isValidTurkishVkn(rawValue: string): boolean {
  const digits = String(rawValue || '').replace(/\D/g, '');
  if (!/^\d{10}$/.test(digits) || /^0{10}$/.test(digits)) {
    return false;
  }

  let total = 0;
  for (let i = 0; i < 9; i += 1) {
    const digit = Number(digits[i]);
    const step = (digit + (9 - i)) % 10;
    const weighted = (step * Math.pow(2, 9 - i)) % 9;
    total += step !== 0 && weighted === 0 ? 9 : weighted;
  }

  const checkDigit = (10 - (total % 10)) % 10;
  return checkDigit === Number(digits[9]);
}

/**
 * Validates an 11-digit Turkish Republic Identity Number (TCKN) checksum for sole proprietorships.
 */
export function isValidTurkishTckn(rawValue: string): boolean {
  const digits = String(rawValue || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(digits) || digits[0] === '0' || /^(\d)\1{10}$/.test(digits)) {
    return false;
  }

  const nums = digits.split('').map((d) => Number(d));
  const oddSum = nums[0] + nums[2] + nums[4] + nums[6] + nums[8];
  const evenSum = nums[1] + nums[3] + nums[5] + nums[7];
  const d10 = (((oddSum * 7 - evenSum) % 10) + 10) % 10;
  if (d10 !== nums[9]) {
    return false;
  }

  const firstTenSum = nums.slice(0, 10).reduce((acc, n) => acc + n, 0);
  return firstTenSum % 10 === nums[10];
}

export function validateCommercialTaxProfile(
  input: CommercialTaxProfileInput | null | undefined
): CommercialTaxProfileValidationResult {
  if (!input || typeof input !== 'object') {
    return {
      valid: false,
      errors: ['tax_profile_required'],
      normalizedTaxNumber: '',
      detectedIdType: 'invalid'
    };
  }

  const errors: string[] = [];
  const normalizedTaxNumber = String(input.taxNumber || '').replace(/\D/g, '');
  const entityType: TaxEntityType = input.entityType === 'individual' ? 'individual' : 'corporate';
  const legalBusinessName = String(input.legalBusinessName || '').trim();
  const taxOffice = String(input.taxOffice || '').trim();
  const billingAddress = String(input.billingAddress || '').trim();
  const billingEmail = String(input.billingEmail || '').trim();

  if (input.entityType !== 'corporate' && input.entityType !== 'individual') {
    errors.push('invalid_entity_type');
  }
  if (legalBusinessName.length < 2) {
    errors.push('legal_business_name_required');
  }
  if (billingAddress.length < 5) {
    errors.push('billing_address_required');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(billingEmail)) {
    errors.push('invalid_billing_email');
  }

  let detectedIdType: 'vkn' | 'tckn' | 'invalid' = 'invalid';
  if (entityType === 'corporate') {
    if (taxOffice.length < 2) {
      errors.push('tax_office_required');
    }
    if (isValidTurkishVkn(normalizedTaxNumber)) {
      detectedIdType = 'vkn';
    } else {
      errors.push('invalid_vkn');
    }
  } else {
    if (isValidTurkishTckn(normalizedTaxNumber)) {
      detectedIdType = 'tckn';
    } else if (isValidTurkishVkn(normalizedTaxNumber)) {
      detectedIdType = 'vkn';
    } else {
      errors.push('invalid_tckn_or_vkn');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    normalizedTaxNumber,
    detectedIdType
  };
}

export function redactCommercialTaxProfileForLogs(
  profile: Partial<CommercialTaxProfile> | null | undefined
): Record<string, unknown> | null {
  if (!profile) {
    return null;
  }

  const rawTax = String(profile.taxNumber || '').replace(/\D/g, '');
  const maskedTax = rawTax.length >= 4 ? `******${rawTax.slice(-4)}` : '[REDACTED]';
  const rawEmail = String(profile.billingEmail || '').trim();
  const atIndex = rawEmail.indexOf('@');
  const maskedEmail =
    atIndex > 0 ? `${rawEmail[0]}***${rawEmail.slice(atIndex)}` : '[REDACTED]';

  return {
    tenantId: profile.tenantId || null,
    entityType: profile.entityType || null,
    legalBusinessName: profile.legalBusinessName || null,
    taxNumber: maskedTax,
    taxOffice: profile.taxOffice || null,
    billingAddress: '[REDACTED]',
    billingEmail: maskedEmail,
    verificationStatus: profile.verificationStatus || 'unverified',
    isServerVerified: false
  };
}

export function getInvoiceAdapterStatus(
  profile: CommercialTaxProfileInput | CommercialTaxProfile | null | undefined
): InvoiceAdapterStatus {
  if (!profile) {
    return {
      provider: 'efatura_adapter_unconfigured',
      canIssueAutomatedInvoice: false,
      status: 'EXTERNAL_PROVIDER_VERIFICATION_PENDING',
      taxProfileValid: false,
      taxProfileServerVerified: false,
      reasonCode: 'MISSING_TAX_PROFILE',
      blockers: ['Vergi/fatura kimlik profili eksik.', 'Sunucu e-Fatura/e-Arşiv entegrasyonu aktif değil.']
    };
  }

  const validation = validateCommercialTaxProfile(profile);
  if (!validation.valid) {
    return {
      provider: 'efatura_adapter_unconfigured',
      canIssueAutomatedInvoice: false,
      status: 'EXTERNAL_PROVIDER_VERIFICATION_PENDING',
      taxProfileValid: false,
      taxProfileServerVerified: false,
      reasonCode: 'INVALID_TAX_PROFILE',
      blockers: [
        `Vergi profili eksik veya geçersiz: ${validation.errors.join(', ')}`,
        'Sunucu e-Fatura/e-Arşiv entegrasyonu aktif değil.'
      ]
    };
  }

  return {
    provider: 'efatura_adapter_unconfigured',
    canIssueAutomatedInvoice: false,
    status: 'EXTERNAL_PROVIDER_VERIFICATION_PENDING',
    taxProfileValid: true,
    taxProfileServerVerified: false,
    reasonCode: 'SERVER_INVOICE_ADAPTER_REQUIRED',
    blockers: ['Otomatik e-Fatura/e-Arşiv kesimi yalnızca doğrulanmış sunucu entegrasyonu üzerinden yapılabilir.']
  };
}

export function issueInvoiceFailClosed(request: InvoiceIssueRequest): InvoiceIssueResult {
  const errors: string[] = [];
  if (!request.tenantId || !request.tenantId.trim()) {
    errors.push('invalid_tenant_id');
    return {
      issued: false,
      status: 'REJECTED_CLIENT_FAIL_CLOSED',
      reasonCode: 'INVALID_TENANT_ID',
      invoiceNumber: null,
      ettn: null,
      errors
    };
  }

  if (typeof request.amount !== 'number' || !Number.isFinite(request.amount) || request.amount <= 0) {
    errors.push('invalid_amount');
    return {
      issued: false,
      status: 'REJECTED_CLIENT_FAIL_CLOSED',
      reasonCode: 'INVALID_AMOUNT',
      invoiceNumber: null,
      ettn: null,
      errors
    };
  }

  if (!request.taxProfile) {
    errors.push('tax_profile_required');
    return {
      issued: false,
      status: 'REJECTED_CLIENT_FAIL_CLOSED',
      reasonCode: 'MISSING_TAX_PROFILE',
      invoiceNumber: null,
      ettn: null,
      errors
    };
  }

  const validation = validateCommercialTaxProfile(request.taxProfile);
  if (!validation.valid) {
    return {
      issued: false,
      status: 'REJECTED_CLIENT_FAIL_CLOSED',
      reasonCode: 'INVALID_TAX_PROFILE',
      invoiceNumber: null,
      ettn: null,
      errors: validation.errors
    };
  }

  return {
    issued: false,
    status: 'REJECTED_CLIENT_FAIL_CLOSED',
    reasonCode: 'SERVER_INVOICE_ADAPTER_REQUIRED',
    invoiceNumber: null,
    ettn: null,
    errors: ['server_invoice_adapter_required']
  };
}

function readLocalTaxDraft(tenantId: string): CommercialTaxProfile | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(getCommercialTaxStorageKey(tenantId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CommercialTaxProfile>;
    if (!parsed || typeof parsed !== 'object' || parsed.tenantId !== tenantId) {
      return null;
    }
    // Fail-closed: tampered client storage can never assert server verification.
    return {
      tenantId,
      entityType: parsed.entityType === 'individual' ? 'individual' : 'corporate',
      legalBusinessName: String(parsed.legalBusinessName || ''),
      taxNumber: String(parsed.taxNumber || ''),
      taxOffice: String(parsed.taxOffice || ''),
      billingAddress: String(parsed.billingAddress || ''),
      billingEmail: String(parsed.billingEmail || ''),
      eInvoiceRegistered: parsed.eInvoiceRegistered === true,
      verificationStatus:
        parsed.verificationStatus === 'pending_server_verification'
          ? 'pending_server_verification'
          : 'unverified',
      isServerVerified: false,
      updatedAt: String(parsed.updatedAt || new Date().toISOString())
    };
  } catch {
    return null;
  }
}

export const businessProfileService = {
  async getBusinessProfile(tenantId: string): Promise<SalonBusinessProfile | null> {
    const repo = getBusinessProfileRepository();
    return repo.getBusinessProfile(tenantId);
  },

  async updateBusinessProfile(tenantId: string, profileData: Partial<SalonBusinessProfile>): Promise<SalonBusinessProfile | null> {
    const repo = getBusinessProfileRepository();
    return repo.updateBusinessProfile(tenantId, profileData);
  },

  async getPublicBusinessProfile(tenantId: string): Promise<SalonBusinessProfile | null> {
      return this.getBusinessProfile(tenantId);
  },

  async getPublicBusinessProfileBySlug(slug: string): Promise<SalonBusinessProfile | null> {
    const repo = getBusinessProfileRepository();
    return repo.getPublicBusinessProfileBySlug(slug);
  },

  getCommercialTaxProfile(tenantId: string): CommercialTaxProfile | null {
    const normalizedTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
    if (!normalizedTenantId) {
      return null;
    }
    if (getDataSourceMode() === 'supabase') {
      // Fail-closed: client storage is never trusted as tax authority in persistent Supabase mode.
      return null;
    }
    return readLocalTaxDraft(normalizedTenantId);
  },

  saveCommercialTaxProfile(
    tenantId: string,
    input: CommercialTaxProfileInput
  ): SaveCommercialTaxProfileResult {
    const normalizedTenantId = typeof tenantId === 'string' ? tenantId.trim() : '';
    if (!normalizedTenantId) {
      return {
        success: false,
        reasonCode: 'INVALID_TENANT_ID',
        errors: ['invalid_tenant_id'],
        profile: null
      };
    }

    const validation = validateCommercialTaxProfile(input);
    if (!validation.valid) {
      return {
        success: false,
        reasonCode: 'INVALID_TAX_PROFILE',
        errors: validation.errors,
        profile: null
      };
    }

    if (getDataSourceMode() === 'supabase') {
      return {
        success: false,
        reasonCode: 'SERVER_TAX_PROFILE_ENDPOINT_REQUIRED',
        errors: ['server_tax_profile_endpoint_required'],
        profile: null
      };
    }

    // Strip any caller-supplied verification claims; server adapter owns verification.
    const safeDraft: CommercialTaxProfile = {
      tenantId: normalizedTenantId,
      entityType: input.entityType,
      legalBusinessName: input.legalBusinessName.trim(),
      taxNumber: validation.normalizedTaxNumber,
      taxOffice: String(input.taxOffice || '').trim(),
      billingAddress: input.billingAddress.trim(),
      billingEmail: input.billingEmail.trim(),
      eInvoiceRegistered: input.eInvoiceRegistered === true,
      verificationStatus: 'pending_server_verification',
      isServerVerified: false,
      updatedAt: new Date().toISOString()
    };

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(getCommercialTaxStorageKey(normalizedTenantId), JSON.stringify(safeDraft));
    }

    return {
      success: true,
      reasonCode: 'SAVED_LOCAL_DRAFT_PENDING_VERIFICATION',
      errors: [],
      profile: safeDraft
    };
  },

  validateCommercialTaxProfile(
    input: CommercialTaxProfileInput | null | undefined
  ): CommercialTaxProfileValidationResult {
    return validateCommercialTaxProfile(input);
  },

  getInvoiceAdapterStatus(
    profile: CommercialTaxProfileInput | CommercialTaxProfile | null | undefined
  ): InvoiceAdapterStatus {
    return getInvoiceAdapterStatus(profile);
  },

  issueInvoice(request: InvoiceIssueRequest): InvoiceIssueResult {
    return issueInvoiceFailClosed(request);
  },

  getMockProfile(tenantId: string): SalonBusinessProfile {
    // Left for backwards compatibility if needed elsewhere
    return {
      id: 'mock-prof-1',
      tenant_id: tenantId,
      short_description: 'Şehrin en iyi saç tasarım stüdyosu.',
      about_text: 'Yılların verdiği tecrübe ve alanında uzman kadromuzla, size en iyi hizmeti sunmak için buradayız. LARİ teknolojisi ile güzelliğinize değer katıyoruz.',
      business_category: 'Hair Salon',
      address: 'Örnek Mah. Güzellik Sok. No: 12',
      city: 'İstanbul',
      district: 'Kadıköy',
      whatsapp_number: '+905551234567',
      instagram_url: 'https://instagram.com/sandboxtenant',
      opening_hours_summary: 'Pzt-Cmt: 09:00 - 20:00, Pzr: Kapalı',
      cover_images: [
         'https://images.unsplash.com/photo-1560066984-138dadb4c035?auto=format&fit=crop&q=80&w=1200&h=400'
      ],
      gallery_images: [
         'https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=600&h=400&q=80',
         'https://images.unsplash.com/photo-1595476108010-b4d1f10d5e43?auto=format&fit=crop&w=600&h=400&q=80'
      ],
      is_public_profile_enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }
};

