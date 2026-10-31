/**
 * Slug generation and validation utilities for Tenant subdomains
 */

export const SLUG_MIN_LENGTH = 3;
export const SLUG_MAX_LENGTH = 50;
export const SLUG_FORMAT_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export const SLUG_VALIDATION_REASONS = {
  VALID: 'VALID',
  EMPTY_OR_SHORT: 'EMPTY_OR_SHORT',
  TOO_LONG: 'TOO_LONG',
  INVALID_FORMAT: 'INVALID_FORMAT',
  RESERVED: 'RESERVED',
  SLUG_TAKEN: 'SLUG_TAKEN',
  MISSING_TENANT: 'MISSING_TENANT',
  TENANT_NOT_FOUND: 'TENANT_NOT_FOUND',
  CROSS_TENANT_CONFLICT: 'CROSS_TENANT_CONFLICT',
  CONCURRENT_RACE_CONFLICT: 'CONCURRENT_RACE_CONFLICT',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
} as const;

export type SlugValidationReason =
  (typeof SLUG_VALIDATION_REASONS)[keyof typeof SLUG_VALIDATION_REASONS];

export interface SlugValidationResult {
  isValid: boolean;
  reason: SlugValidationReason;
  normalizedSlug: string;
  error?: string;
}

export const RESERVED_SLUGS_LIST: readonly string[] = [
  'admin',
  'api',
  'app',
  'appointment',
  'assets',
  'auth',
  'book',
  'booking',
  'cdn',
  'checkout',
  'contact',
  'customer',
  'demo',
  'features',
  'ftp',
  'help',
  'lari',
  'login',
  'mail',
  'mobile-app',
  'payment',
  'pilot',
  'pricing',
  'privacy',
  'radapp',
  'randapp',
  'randevu',
  'randevulari',
  'register',
  'settings',
  'smtp',
  'static',
  'super-admin',
  'support',
  'tenant',
  'terms',
  'www',
];

const RESERVED_WORDS = new Set<string>(RESERVED_SLUGS_LIST);

const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  Ç: 'c',
  Ğ: 'g',
  İ: 'i',
  I: 'i',
  Ö: 'o',
  Ş: 's',
  Ü: 'u',
};

/**
 * Transliterates Turkish characters and lowercases without masking malformed
 * characters, consecutive hyphens, or overlong length.
 */
export function canonicalizeSlugCandidate(input: string): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/[çğıöşüÇĞİIÖŞÜ]/g, (match) => TURKISH_CHAR_MAP[match] || match)
    .toLowerCase();
}

export function isReservedSlugWord(slug: string): boolean {
  if (typeof slug !== 'string' || !slug) return false;
  return RESERVED_WORDS.has(canonicalizeSlugCandidate(slug));
}

/**
 * Evaluates a candidate slug against canonical format, length (3..50), and
 * reserved-word policy, returning a structured reason code.
 */
export function validateSlugFormat(rawSlug: string): SlugValidationResult {
  if (typeof rawSlug !== 'string') {
    return {
      isValid: false,
      reason: SLUG_VALIDATION_REASONS.EMPTY_OR_SHORT,
      normalizedSlug: '',
      error: 'Link en az 3 karakter olmalıdır.',
    };
  }

  const normalizedSlug = canonicalizeSlugCandidate(rawSlug);

  if (!normalizedSlug || normalizedSlug.length < SLUG_MIN_LENGTH) {
    return {
      isValid: false,
      reason: SLUG_VALIDATION_REASONS.EMPTY_OR_SHORT,
      normalizedSlug,
      error: 'Link en az 3 karakter olmalıdır.',
    };
  }

  if (normalizedSlug.length > SLUG_MAX_LENGTH) {
    return {
      isValid: false,
      reason: SLUG_VALIDATION_REASONS.TOO_LONG,
      normalizedSlug,
      error: 'Link en fazla 50 karakter olabilir.',
    };
  }

  if (normalizedSlug.includes('--') || !SLUG_FORMAT_REGEX.test(normalizedSlug)) {
    return {
      isValid: false,
      reason: SLUG_VALIDATION_REASONS.INVALID_FORMAT,
      normalizedSlug,
      error: 'Link yalnızca küçük harf, rakam ve tek tire içerebilir.',
    };
  }

  if (RESERVED_WORDS.has(normalizedSlug)) {
    return {
      isValid: false,
      reason: SLUG_VALIDATION_REASONS.RESERVED,
      normalizedSlug,
      error: 'Bu bağlantı adı sistem tarafından rezerve edilmiştir.',
    };
  }

  return {
    isValid: true,
    reason: SLUG_VALIDATION_REASONS.VALID,
    normalizedSlug,
  };
}

/**
 * Validates an exact canonical slug against reserved words and format constraints.
 *
 * Rules:
 * - Must be URL-safe ASCII
 * - Lowercase (exact canonical form)
 * - Only letters, numbers, hyphens
 * - No consecutive hyphens
 * - Minimum length: 3
 * - Maximum length: 50
 * - Cannot be a reserved word
 */
export function isValidSlug(slug: string): boolean {
  if (typeof slug !== 'string' || !slug) return false;
  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) return false;
  if (RESERVED_WORDS.has(slug.toLowerCase())) return false;
  if (!SLUG_FORMAT_REGEX.test(slug)) return false;
  if (slug.includes('--')) return false;
  return true;
}

/**
 * Normalizes a human-entered string into a URL-safe slug (without silent truncation).
 */
export function normalizeCanonicalSlug(input: string): string {
  if (typeof input !== 'string') return '';
  let slug = canonicalizeSlugCandidate(input);
  slug = slug.replace(/[^a-z0-9-]+/g, '-');
  slug = slug.replace(/-+/g, '-');
  slug = slug.replace(/^-+|-+$/g, '');
  return slug;
}

/**
 * Generates a URL-safe slug from a business name.
 *
 * Rules:
 * - Convert Turkish characters
 * - Lowercase
 * - Replace spaces with hyphens
 * - Remove unsupported characters
 * - Collapse repeated hyphens
 * - Trim hyphens from start/end
 * - Reject if shorter than 3 chars, overlong (>50 after trim), or reserved
 */
export function generateSlugFromName(name: string): string {
  if (typeof name !== 'string' || !name.trim()) return '';
  let slug = canonicalizeSlugCandidate(name);
  slug = slug.replace(/[^a-z0-9]+/g, '-');
  slug = slug.replace(/-+/g, '-');
  slug = slug.replace(/^-+|-+$/g, '');

  if (slug.length < SLUG_MIN_LENGTH || slug.length > SLUG_MAX_LENGTH) {
    return '';
  }

  if (!isValidSlug(slug)) {
    return '';
  }

  return slug;
}

/**
 * Proposes deterministic alternative slugs ONLY when the base slug itself is a
 * valid, non-reserved canonical slug. Every candidate is validated against
 * format, reserved words, and the <=50 character ceiling.
 */
export function getSlugAlternatives(baseSlug: string): string[] {
  const canonicalBase = canonicalizeSlugCandidate(baseSlug);
  if (!isValidSlug(canonicalBase)) {
    return [];
  }

  const suffixes = ['studio', 'guzellik', 'salon', 'tr'];
  const candidates: string[] = [];

  for (const suffix of suffixes) {
    const candidate = `${canonicalBase}-${suffix}`;
    if (isValidSlug(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}
