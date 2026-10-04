// adapters/discoveryMarketplaceAdapter.ts
// Phase 7 Node 2 R2: Discovery Marketplace Supabase RPC Adapter
// Authority: DECISION-022 / LARI-P7-N2-DISCOVERY-MARKETPLACE-R2

import { supabase } from '../services/supabaseClient.ts';
import type {
  DiscoveryListingsRequest,
  DiscoveryListingsResponse,
  DiscoveryDetailRequest,
  DiscoveryDetailResponse,
  DiscoveryListingDTO,
  DiscoveryBusinessDetailDTO,
  DiscoveryError,
  Result,
} from '../types/discoveryMarketplaceDTOs';

// ============================================================================
// Parameter Bounds Validation
// ============================================================================

export function sanitizeBoundedText(value: string | undefined | null, fieldName: string, maxLen = 100): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > maxLen) {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} exceeds maximum length of ${maxLen} characters`);
  }
  return trimmed;
}

export function validateRatingBounds(rating: number | undefined | null): number | null {
  if (rating === undefined || rating === null) {
    return null;
  }
  if (typeof rating !== 'number' || isNaN(rating) || rating < 1.0 || rating > 5.0) {
    throw new Error('INVALID_ARGUMENT: minRating must be between 1.0 and 5.0');
  }
  return rating;
}

export function validatePaginationBounds(limit?: number, offset?: number): { boundedLimit: number; boundedOffset: number } {
  let boundedLimit = 20;
  if (limit !== undefined && limit !== null) {
    if (typeof limit !== 'number' || isNaN(limit) || limit < 1) {
      boundedLimit = 20;
    } else if (limit > 100) {
      boundedLimit = 100;
    } else {
      boundedLimit = Math.floor(limit);
    }
  }

  let boundedOffset = 0;
  if (offset !== undefined && offset !== null) {
    if (typeof offset !== 'number' || isNaN(offset) || offset < 0) {
      boundedOffset = 0;
    } else {
      boundedOffset = Math.floor(offset);
    }
  }

  return { boundedLimit, boundedOffset };
}

// ============================================================================
// DTO Projection Mappers
// ============================================================================

export function mapRawListingToDTO(raw: any): DiscoveryListingDTO {
  return {
    tenantId: String(raw.tenant_id || ''),
    slug: String(raw.slug || ''),
    name: String(raw.name || ''),
    businessCategory: String(raw.business_category || ''),
    shortDescription: raw.short_description || undefined,
    aboutText: raw.about_text || undefined,
    city: String(raw.city || ''),
    district: String(raw.district || ''),
    address: raw.address || undefined,
    coverImageUrl: raw.cover_image_url || undefined,
    logoUrl: raw.logo_url || undefined,
    galleryImages: Array.isArray(raw.gallery_images) ? raw.gallery_images : [],
    amenities: Array.isArray(raw.amenities) ? raw.amenities : [],
    phone: raw.phone || undefined,
    whatsappNumber: raw.whatsapp_number || undefined,
    instagramUrl: raw.instagram_url || undefined,
    websiteUrl: raw.website_url || undefined,
    openingHoursSummary: raw.opening_hours_summary || undefined,
    reviewCount: Number(raw.review_count || 0),
    averageRating: Number(raw.average_rating || 0.0),
    primaryBranch: raw.primary_branch ? {
      id: String(raw.primary_branch.id || ''),
      name: String(raw.primary_branch.name || ''),
      slug: String(raw.primary_branch.slug || ''),
      isPrimary: Boolean(raw.primary_branch.is_primary),
      timezone: String(raw.primary_branch.timezone || 'UTC'),
    } : null,
    featuredServices: Array.isArray(raw.featured_services)
      ? raw.featured_services.map((s: any) => ({
          id: String(s.id || ''),
          name: String(s.name || ''),
          nameTr: s.name_tr || undefined,
          duration: Number(s.duration || 0),
          price: Number(s.price || 0),
          category: s.category || undefined,
          image: s.image || undefined,
        }))
      : [],
  };
}

export function mapRawBusinessDetailToDTO(raw: any): DiscoveryBusinessDetailDTO {
  const b = raw.business || raw;
  const revSummary = b.reviews_summary || {};
  const dist = revSummary.distribution || {};

  return {
    tenantId: String(b.tenant_id || ''),
    slug: String(b.slug || ''),
    name: String(b.name || ''),
    businessCategory: String(b.business_category || ''),
    shortDescription: b.short_description || undefined,
    aboutText: b.about_text || undefined,
    city: String(b.city || ''),
    district: String(b.district || ''),
    address: b.address || undefined,
    phone: b.phone || undefined,
    whatsappNumber: b.whatsapp_number || undefined,
    instagramUrl: b.instagram_url || undefined,
    websiteUrl: b.website_url || undefined,
    openingHoursSummary: b.opening_hours_summary || undefined,
    coverImageUrl: b.cover_image_url || undefined,
    logoUrl: b.logo_url || undefined,
    galleryImages: Array.isArray(b.gallery_images) ? b.gallery_images : [],
    amenities: Array.isArray(b.amenities) ? b.amenities : [],
    parkingInfo: b.parking_info || undefined,
    paymentMethods: Array.isArray(b.payment_methods) ? b.payment_methods : [],
    cancellationPolicy: b.cancellation_policy || undefined,
    bookingPolicy: b.booking_policy || undefined,
    branches: Array.isArray(b.branches)
      ? b.branches.map((br: any) => ({
          id: String(br.id || ''),
          name: String(br.name || ''),
          slug: String(br.slug || ''),
          isPrimary: Boolean(br.is_primary),
          timezone: String(br.timezone || 'UTC'),
        }))
      : [],
    services: Array.isArray(b.services)
      ? b.services.map((s: any) => ({
          id: String(s.id || ''),
          name: String(s.name || ''),
          nameTr: s.name_tr || undefined,
          category: s.category || undefined,
          duration: Number(s.duration || 0),
          price: Number(s.price || 0),
          image: s.image || undefined,
        }))
      : [],
    reviewsSummary: {
      totalReviews: Number(revSummary.total_reviews || 0),
      averageRating: Number(revSummary.average_rating || 0.0),
      distribution: {
        5: Number(dist['5'] || dist[5] || 0),
        4: Number(dist['4'] || dist[4] || 0),
        3: Number(dist['3'] || dist[3] || 0),
        2: Number(dist['2'] || dist[2] || 0),
        1: Number(dist['1'] || dist[1] || 0),
      },
    },
    recentReviews: Array.isArray(b.recent_reviews)
      ? b.recent_reviews.map((r: any) => ({
          id: String(r.id || ''),
          rating: Number(r.rating || 0),
          title: r.title || undefined,
          content: r.content || undefined,
          publishedAt: r.published_at || undefined,
          createdAt: String(r.created_at || ''),
          responseText: r.response_text || undefined,
          respondedAt: r.responded_at || undefined,
          serviceName: r.service_name || undefined,
          branchName: r.branch_name || undefined,
        }))
      : [],
  };
}

// ============================================================================
// RPC Adapter Implementation
// ============================================================================

export class DiscoveryMarketplaceAdapter {
  /**
   * Invokes public.get_discovery_marketplace_listings on Supabase.
   */
  async fetchListings(request: DiscoveryListingsRequest): Promise<Result<DiscoveryListingsResponse, DiscoveryError>> {
    try {
      const cleanSearch = sanitizeBoundedText(request.searchQuery, 'searchQuery');
      const cleanCity = sanitizeBoundedText(request.city, 'city');
      const cleanDistrict = sanitizeBoundedText(request.district, 'district');
      const cleanCategory = sanitizeBoundedText(request.category, 'category');
      const cleanMinRating = validateRatingBounds(request.minRating);
      const { boundedLimit, boundedOffset } = validatePaginationBounds(request.limit, request.offset);

      const rpcParams = {
        p_search_query: cleanSearch,
        p_city: cleanCity,
        p_district: cleanDistrict,
        p_category: cleanCategory,
        p_min_rating: cleanMinRating,
        p_limit: boundedLimit,
        p_offset: boundedOffset,
      };

      const { data, error } = await supabase.rpc('get_discovery_marketplace_listings', rpcParams);

      if (error) {
        return {
          success: false,
          error: {
            code: error.code || 'RPC_EXECUTION_ERROR',
            message: error.message || 'Error executing get_discovery_marketplace_listings',
            details: error,
          },
        };
      }

      if (!data) {
        return {
          success: true,
          data: {
            totalCount: 0,
            limit: boundedLimit,
            offset: boundedOffset,
            listings: [],
          },
        };
      }

      const rawListings = Array.isArray(data.listings) ? data.listings : [];
      const listings = rawListings.map(mapRawListingToDTO);

      return {
        success: true,
        data: {
          totalCount: Number(data.total_count || 0),
          limit: Number(data.limit || boundedLimit),
          offset: Number(data.offset || boundedOffset),
          listings,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message || 'Parameter bounds validation failed',
          details: err,
        },
      };
    }
  }

  /**
   * Invokes public.get_discovery_marketplace_detail on Supabase.
   */
  async fetchDetail(request: DiscoveryDetailRequest): Promise<Result<DiscoveryDetailResponse, DiscoveryError>> {
    try {
      if (!request.slug || !request.slug.trim()) {
        return {
          success: false,
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'slug is required',
          },
        };
      }

      const cleanSlug = sanitizeBoundedText(request.slug, 'slug');
      if (!cleanSlug) {
        return {
          success: false,
          error: {
            code: 'INVALID_ARGUMENT',
            message: 'slug is required',
          },
        };
      }

      const { data, error } = await supabase.rpc('get_discovery_marketplace_detail', {
        p_slug: cleanSlug,
      });

      if (error) {
        return {
          success: false,
          error: {
            code: error.code || 'RPC_EXECUTION_ERROR',
            message: error.message || 'Error executing get_discovery_marketplace_detail',
            details: error,
          },
        };
      }

      if (!data) {
        return {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: 'Business not found',
          },
        };
      }

      if (!data.success) {
        return {
          success: false,
          error: {
            code: data.reason_code || 'DISCOVERY_INELIGIBLE',
            message: data.message || 'Business is not published or eligible for discovery',
            details: data,
          },
        };
      }

      const business = mapRawBusinessDetailToDTO(data);

      return {
        success: true,
        data: {
          business,
        },
      };
    } catch (err: any) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message || 'Parameter validation failed',
          details: err,
        },
      };
    }
  }
}

export const discoveryMarketplaceAdapter = new DiscoveryMarketplaceAdapter();
