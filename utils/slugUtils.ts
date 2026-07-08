/**
 * Slug generation and validation utilities for Tenant subdomains
 */

/**
 * Validates a slug against reserved words and format constraints.
 * 
 * Rules:
 * - Must be URL-safe ASCII
 * - Lowercase
 * - Only letters, numbers, hyphens
 * - No consecutive hyphens
 * - Minimum length: 3
 * - Maximum length: 50
 * - Cannot be a reserved word
 */

const RESERVED_WORDS = new Set([
  'admin', 'api', 'app', 'www', 'randapp', 'super-admin', 
  'login', 'pricing', 'checkout', 'support', 'help', 
  'contact', 'static', 'assets', 'demo', 'book', 'tenant'
]);

export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 3 || slug.length > 50) return false;
  if (RESERVED_WORDS.has(slug.toLowerCase())) return false;
  
  // Must start and end with alphanumeric, only allow hyphens in between
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return false;
  
  // Check no consecutive hyphens
  if (slug.includes('--')) return false;

  return true;
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
 */
export function generateSlugFromName(name: string): string {
  let slug = name.toLowerCase();

  // Convert Turkish characters
  const charMap: Record<string, string> = {
    'ç': 'c',
    'ğ': 'g',
    'ı': 'i',
    'ö': 'o',
    'ş': 's',
    'ü': 'u',
  };

  slug = slug.replace(/[çğıöşü]/g, (match) => charMap[match]);

  // Replace spaces and invalid chars with hyphens
  slug = slug.replace(/[^a-z0-9]+/g, '-');

  // Collapse repeated hyphens
  slug = slug.replace(/-+/g, '-');

  // Trim hyphens
  slug = slug.replace(/^-+|-+$/g, '');

  if (slug.length < 3) return ''; // invalid base
  
  return slug.substring(0, 50);
}

/**
 * Proposes alternative slugs if the base slug conflicts or is reserved.
 */
export function getSlugAlternatives(baseSlug: string): string[] {
  return [
    `${baseSlug}-studio`,
    `${baseSlug}-guzellik`,
    `${baseSlug}-salon`,
    `${baseSlug}-tr`
  ];
}
