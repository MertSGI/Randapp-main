// services/discoveryMarketplaceService.ts
// Phase 7: Discovery Marketplace, Verified Reviews, Favorites & Fast-Rebooking Service
//
// Invariants:
// - Server-authoritative RPC boundary (zero localStorage / mock business truth).
// - Fails closed with UNAVAILABLE when data mode is not 'supabase'.
// - Strictly public-safe projections only; no fabricated 5.0 ratings or PII leaks.
// - Verified reviews require completed appointment / valid manage token ownership.

import { fetchSupabase } from './repositories/supabaseClient';
import { getDataSourceMode, type DataSourceMode } from './dataSourceConfig';
import type {
  CreateVerifiedReviewByTokenRequest,
  CreateVerifiedReviewRequest,
  CreateVerifiedReviewResponse,
  CustomerFavoriteDTO,
  DiscoveryBusinessDetailDTO,
  DiscoveryDetailRequest,
  DiscoveryDetailResponse,
  DiscoveryError,
  DiscoveryListingDTO,
  DiscoveryListingsRequest,
  DiscoveryListingsResponse,
  FastRebookingSeedDTO,
  GetCustomerFavoritesRequest,
  GetCustomerFavoritesResponse,
  GetFastRebookingSeedRequest,
  GetFastRebookingSeedResponse,
  GetPublicReviewsRequest,
  GetPublicReviewsResponse,
  GetTenantReviewsRequest,
  GetTenantReviewsResponse,
  ModerateReviewRequest,
  ModerateReviewResponse,
  PublicReviewItemDTO,
  Result,
  SetCustomerFavoriteRequest,
  SetCustomerFavoriteResponse,
  TenantReviewItemDTO,
} from '../types/discoveryMarketplaceDTOs';

export type DiscoveryRpcFetcher = (path: string, options?: RequestInit) => Promise<Response>;

export interface DiscoveryCallOptions {
  mode?: DataSourceMode;
  fetcher?: DiscoveryRpcFetcher;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDiscoveryUnavailableResult<T>(): Result<T, DiscoveryError> {
  return {
    success: false,
    error: {
      code: 'UNAVAILABLE',
      reasonCode: 'UNAVAILABLE',
      message: 'Discovery Marketplace and Verified Reviews require Supabase server authority mode.',
    },
  };
}

export function sanitizeBoundedText(
  value: string | undefined | null,
  fieldName: string,
  maxLen = 100
): string | null {
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
  if (typeof rating !== 'number' || Number.isNaN(rating) || rating < 1.0 || rating > 5.0) {
    throw new Error('INVALID_ARGUMENT: minRating must be between 1.0 and 5.0');
  }
  return rating;
}

export function validateReviewRating(rating: number): number {
  if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new Error('INVALID_ARGUMENT: rating must be an integer between 1 and 5');
  }
  return rating;
}

export function validateManageTokenFormat(token: string | undefined | null): string {
  const trimmed = typeof token === 'string' ? token.trim() : '';
  if (trimmed.length < 32 || trimmed.length > 128) {
    throw new Error('INVALID_TOKEN: Manage token length must be between 32 and 128 characters');
  }
  return trimmed;
}

export function validateIdempotencyKey(key: string | undefined | null): string {
  const trimmed = typeof key === 'string' ? key.trim() : '';
  if (!trimmed) {
    throw new Error('INVALID_ARGUMENT: idempotencyKey is required');
  }
  if (trimmed.length > 200) {
    throw new Error('INVALID_ARGUMENT: idempotencyKey exceeds maximum length of 200 characters');
  }
  return trimmed;
}

export function validateUuidField(value: string | undefined | null, fieldName: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!UUID_REGEX.test(trimmed)) {
    throw new Error(`INVALID_ARGUMENT: ${fieldName} must be a valid UUID`);
  }
  return trimmed;
}

export function validatePaginationBounds(
  limit?: number,
  offset?: number,
  defaultLimit = 20
): { boundedLimit: number; boundedOffset: number } {
  let boundedLimit = defaultLimit;
  if (limit !== undefined && limit !== null) {
    if (typeof limit !== 'number' || Number.isNaN(limit) || limit < 1) {
      boundedLimit = defaultLimit;
    } else if (limit > 100) {
      boundedLimit = 100;
    } else {
      boundedLimit = Math.floor(limit);
    }
  }

  let boundedOffset = 0;
  if (offset !== undefined && offset !== null) {
    if (typeof offset !== 'number' || Number.isNaN(offset) || offset < 0) {
      boundedOffset = 0;
    } else {
      boundedOffset = Math.floor(offset);
    }
  }

  return { boundedLimit, boundedOffset };
}

export function normalizeDiscoveryRpcError(status: number, rawText: string): DiscoveryError {
  const text = rawText || '';
  const lower = text.toLowerCase();

  let parsedBody: Record<string, unknown> | null = null;
  try {
    const candidate = JSON.parse(text);
    if (candidate && typeof candidate === 'object') {
      parsedBody = candidate as Record<string, unknown>;
    }
  } catch {
    // Plain text or non-JSON error
  }

  const msg = String(parsedBody?.message || text || 'Discovery service error');

  if (status === 401 || lower.includes('unauthenticated')) {
    return { code: 'UNAUTHENTICATED', reasonCode: 'UNAUTHENTICATED', message: msg };
  }
  if (lower.includes('cross_tenant_violation')) {
    return { code: 'CROSS_TENANT_VIOLATION', reasonCode: 'CROSS_TENANT_VIOLATION', message: msg };
  }
  if (lower.includes('idempotency_conflict')) {
    return { code: 'IDEMPOTENCY_CONFLICT', reasonCode: 'IDEMPOTENCY_CONFLICT', message: msg };
  }
  if (status === 403 || lower.includes('forbidden')) {
    return { code: 'FORBIDDEN', reasonCode: 'FORBIDDEN', message: msg };
  }
  if (status === 404 || lower.includes('not_found')) {
    return { code: 'NOT_FOUND', reasonCode: 'NOT_FOUND', message: msg };
  }
  if (lower.includes('invalid_argument')) {
    return { code: 'INVALID_ARGUMENT', reasonCode: 'INVALID_ARGUMENT', message: msg };
  }
  if (lower.includes('invalid_token')) {
    return { code: 'INVALID_TOKEN', reasonCode: 'invalid_token', message: msg };
  }
  return { code: 'RPC_EXECUTION_ERROR', reasonCode: 'RPC_EXECUTION_ERROR', message: msg };
}

export function mapRawListingToDTO(raw: any): DiscoveryListingDTO {
  return {
    tenantId: String(raw?.tenant_id || ''),
    slug: String(raw?.slug || ''),
    name: String(raw?.name || ''),
    businessCategory: String(raw?.business_category || ''),
    shortDescription: raw?.short_description || undefined,
    aboutText: raw?.about_text || undefined,
    city: String(raw?.city || ''),
    district: String(raw?.district || ''),
    address: raw?.address || undefined,
    coverImageUrl: raw?.cover_image_url || undefined,
    logoUrl: raw?.logo_url || undefined,
    galleryImages: Array.isArray(raw?.gallery_images) ? raw.gallery_images : [],
    amenities: Array.isArray(raw?.amenities) ? raw.amenities : [],
    phone: raw?.phone || undefined,
    whatsappNumber: raw?.whatsapp_number || undefined,
    instagramUrl: raw?.instagram_url || undefined,
    websiteUrl: raw?.website_url || undefined,
    openingHoursSummary: raw?.opening_hours_summary || undefined,
    reviewCount: Number(raw?.review_count || 0),
    averageRating: Number(raw?.average_rating || 0),
    primaryBranch: raw?.primary_branch
      ? {
          id: String(raw.primary_branch.id || ''),
          name: String(raw.primary_branch.name || ''),
          slug: String(raw.primary_branch.slug || ''),
          isPrimary: Boolean(raw.primary_branch.is_primary),
          timezone: String(raw.primary_branch.timezone || 'UTC'),
        }
      : null,
    featuredServices: Array.isArray(raw?.featured_services)
      ? raw.featured_services.map((s: any) => ({
          id: String(s?.id || ''),
          name: String(s?.name || ''),
          nameTr: s?.name_tr || undefined,
          duration: Number(s?.duration || 0),
          price: Number(s?.price || 0),
          category: s?.category || undefined,
          image: s?.image || undefined,
        }))
      : [],
  };
}

export function mapRawBusinessDetailToDTO(raw: any): DiscoveryBusinessDetailDTO {
  const b = raw?.business || raw || {};
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
          id: String(br?.id || ''),
          name: String(br?.name || ''),
          slug: String(br?.slug || ''),
          isPrimary: Boolean(br?.is_primary),
          timezone: String(br?.timezone || 'UTC'),
        }))
      : [],
    services: Array.isArray(b.services)
      ? b.services.map((s: any) => ({
          id: String(s?.id || ''),
          name: String(s?.name || ''),
          nameTr: s?.name_tr || undefined,
          category: s?.category || undefined,
          duration: Number(s?.duration || 0),
          price: Number(s?.price || 0),
          image: s?.image || undefined,
        }))
      : [],
    reviewsSummary: {
      totalReviews: Number(revSummary.total_reviews || 0),
      averageRating: Number(revSummary.average_rating || 0),
      distribution: {
        5: Number(dist['5'] || 0),
        4: Number(dist['4'] || 0),
        3: Number(dist['3'] || 0),
        2: Number(dist['2'] || 0),
        1: Number(dist['1'] || 0),
      },
    },
    recentReviews: Array.isArray(b.recent_reviews)
      ? b.recent_reviews.map((r: any) => ({
          id: String(r?.id || ''),
          rating: Number(r?.rating || 0),
          title: r?.title || undefined,
          content: r?.content || undefined,
          publishedAt: r?.published_at || undefined,
          createdAt: String(r?.created_at || ''),
          responseText: r?.response_text || undefined,
          respondedAt: r?.responded_at || undefined,
          serviceName: r?.service_name || undefined,
          branchName: r?.branch_name || undefined,
        }))
      : [],
  };
}

function mapPublicReviewItem(r: any): PublicReviewItemDTO {
  return {
    id: String(r?.id || ''),
    branchId: String(r?.branch_id || ''),
    branchName: String(r?.branch_name || ''),
    serviceId: String(r?.service_id || ''),
    serviceName: String(r?.service_name || ''),
    staffId: String(r?.staff_id || ''),
    staffName: String(r?.staff_name || ''),
    rating: Number(r?.rating || 0),
    title: r?.title || undefined,
    content: r?.content || undefined,
    responseText: r?.response_text || undefined,
    respondedAt: r?.responded_at || undefined,
    createdAt: String(r?.created_at || ''),
  };
}

function mapTenantReviewItem(r: any): TenantReviewItemDTO {
  return {
    ...mapPublicReviewItem(r),
    appointmentId: String(r?.appointment_id || ''),
    appointmentDate: String(r?.appointment_date || ''),
    customerId: String(r?.customer_id || ''),
    customerName: String(r?.customer_name || ''),
    customerEmail: r?.customer_email || undefined,
    isPublished: Boolean(r?.is_published),
    publishedAt: r?.published_at || undefined,
    respondedBy: r?.responded_by || undefined,
    respondedByUserId: r?.responded_by_user_id || undefined,
    updatedAt: String(r?.updated_at || ''),
  };
}

async function invokeDiscoveryRpc<T>(
  rpcName: string,
  payload: Record<string, unknown>,
  options?: DiscoveryCallOptions
): Promise<Result<T, DiscoveryError>> {
  const mode = options?.mode ?? getDataSourceMode();
  if (mode !== 'supabase') {
    return createDiscoveryUnavailableResult<T>();
  }

  const fetcher = options?.fetcher ?? fetchSupabase;
  try {
    const res = await fetcher(`/rest/v1/rpc/${rpcName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const rawErr = await res.text();
      return {
        success: false,
        error: normalizeDiscoveryRpcError(res.status, rawErr),
      };
    }

    const data = (await res.json()) as T;
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'RPC_EXECUTION_ERROR',
        reasonCode: 'RPC_EXECUTION_ERROR',
        message: err instanceof Error ? err.message : 'Network error calling discovery service.',
      },
    };
  }
}

export class DiscoveryMarketplaceService {
  async getListings(
    request: DiscoveryListingsRequest = {},
    options?: DiscoveryCallOptions
  ): Promise<Result<DiscoveryListingsResponse, DiscoveryError>> {
    let rpcParams: Record<string, unknown>;
    let boundedLimit = 20;
    let boundedOffset = 0;
    try {
      const cleanSearch = sanitizeBoundedText(request.searchQuery, 'searchQuery');
      const cleanCity = sanitizeBoundedText(request.city, 'city');
      const cleanDistrict = sanitizeBoundedText(request.district, 'district');
      const cleanCategory = sanitizeBoundedText(request.category, 'category');
      const cleanMinRating = validateRatingBounds(request.minRating);
      const pagination = validatePaginationBounds(request.limit, request.offset, 20);
      boundedLimit = pagination.boundedLimit;
      boundedOffset = pagination.boundedOffset;

      rpcParams = {
        p_search_query: cleanSearch,
        p_city: cleanCity,
        p_district: cleanDistrict,
        p_category: cleanCategory,
        p_min_rating: cleanMinRating,
        p_limit: boundedLimit,
        p_offset: boundedOffset,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          reasonCode: 'INVALID_ARGUMENT',
          message: err instanceof Error ? err.message : 'Parameter validation failed',
        },
      };
    }

    const rpcRes = await invokeDiscoveryRpc<any>('get_discovery_marketplace_listings', rpcParams, options);
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data;
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
    return {
      success: true,
      data: {
        totalCount: Number(data.total_count || 0),
        limit: Number(data.limit || boundedLimit),
        offset: Number(data.offset || boundedOffset),
        listings: rawListings.map(mapRawListingToDTO),
      },
    };
  }

  async getDetail(
    request: DiscoveryDetailRequest,
    options?: DiscoveryCallOptions
  ): Promise<Result<DiscoveryDetailResponse, DiscoveryError>> {
    let cleanSlug: string | null = null;
    try {
      cleanSlug = sanitizeBoundedText(request.slug, 'slug');
      if (!cleanSlug) {
        return {
          success: false,
          error: {
            code: 'INVALID_ARGUMENT',
            reasonCode: 'INVALID_ARGUMENT',
            message: 'slug is required',
          },
        };
      }
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          reasonCode: 'INVALID_ARGUMENT',
          message: err instanceof Error ? err.message : 'Parameter validation failed',
        },
      };
    }

    const rpcRes = await invokeDiscoveryRpc<any>(
      'get_discovery_marketplace_detail',
      { p_slug: cleanSlug },
      options
    );
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data;
    if (!data) {
      return {
        success: false,
        error: {
          code: 'NOT_FOUND',
          reasonCode: 'NOT_FOUND',
          message: 'Business not found',
        },
      };
    }

    if (!data.success) {
      return {
        success: false,
        error: {
          code: String(data.reason_code || 'DISCOVERY_INELIGIBLE'),
          reasonCode: String(data.reason_code || 'DISCOVERY_INELIGIBLE'),
          message: String(data.message || 'Business is not published or eligible for discovery'),
          details: data,
        },
      };
    }

    return {
      success: true,
      data: {
        business: mapRawBusinessDetailToDTO(data),
      },
    };
  }

  async createVerifiedReview(
    request: CreateVerifiedReviewRequest,
    options?: DiscoveryCallOptions
  ): Promise<Result<CreateVerifiedReviewResponse, DiscoveryError>> {
    let payload: Record<string, unknown>;
    try {
      const appointmentId = validateUuidField(request.appointmentId, 'appointmentId');
      const rating = validateReviewRating(request.rating);
      const title = sanitizeBoundedText(request.title, 'title', 160);
      const content = sanitizeBoundedText(request.content, 'content', 4000);
      const idempotencyKey = validateIdempotencyKey(request.idempotencyKey);

      payload = {
        p_appointment_id: appointmentId,
        p_rating: rating,
        p_title: title,
        p_content: content,
        p_idempotency_key: idempotencyKey,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INVALID_ARGUMENT',
          reasonCode: 'INVALID_ARGUMENT',
          message: err instanceof Error ? err.message : 'Invalid review payload',
        },
      };
    }

    const rpcRes = await invokeDiscoveryRpc<any>('create_verified_review', payload, options);
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data || {};
    if (!data.success) {
      return {
        success: false,
        error: {
          code: String(data.reason_code || 'REVIEW_REJECTED').toUpperCase(),
          reasonCode: String(data.reason_code || 'review_rejected'),
          message: String(data.message || 'Verified review was rejected by server.'),
          details: data,
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        idempotentReplay: Boolean(data.idempotent_replay),
        reviewId: data.review_id ? String(data.review_id) : undefined,
        reasonCode: String(data.reason_code || 'ok'),
        message: data.message ? String(data.message) : undefined,
      },
    };
  }

  async createVerifiedReviewByManageToken(
    request: CreateVerifiedReviewByTokenRequest,
    options?: DiscoveryCallOptions
  ): Promise<Result<CreateVerifiedReviewResponse, DiscoveryError>> {
    let payload: Record<string, unknown>;
    try {
      const manageToken = validateManageTokenFormat(request.manageToken);
      const rating = validateReviewRating(request.rating);
      const title = sanitizeBoundedText(request.title, 'title', 160);
      const content = sanitizeBoundedText(request.content, 'content', 4000);
      const idempotencyKey = validateIdempotencyKey(request.idempotencyKey);
      const expectedTenantSlug = sanitizeBoundedText(request.expectedTenantSlug, 'expectedTenantSlug', 100);
      const clientFingerprint = sanitizeBoundedText(request.clientFingerprint, 'clientFingerprint', 128);

      payload = {
        p_manage_token: manageToken,
        p_rating: rating,
        p_title: title,
        p_content: content,
        p_idempotency_key: idempotencyKey,
        p_expected_tenant_slug: expectedTenantSlug,
        p_client_fingerprint: clientFingerprint,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid token review payload';
      const isTokenErr = msg.startsWith('INVALID_TOKEN:');
      return {
        success: false,
        error: {
          code: isTokenErr ? 'INVALID_TOKEN' : 'INVALID_ARGUMENT',
          reasonCode: isTokenErr ? 'invalid_token' : 'INVALID_ARGUMENT',
          message: msg,
        },
      };
    }

    const rpcRes = await invokeDiscoveryRpc<any>(
      'create_verified_review_by_manage_token',
      payload,
      options
    );
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data || {};
    if (!data.success) {
      const reasonCode = String(data.reason_code || 'invalid_token');
      return {
        success: false,
        error: {
          code: reasonCode.toUpperCase(),
          reasonCode,
          message: String(data.message || 'Verified review submission rejected.'),
          details: data,
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        idempotentReplay: Boolean(data.idempotent_replay),
        reviewId: data.review_id ? String(data.review_id) : undefined,
        reasonCode: String(data.reason_code || 'ok'),
        message: data.message ? String(data.message) : undefined,
      },
    };
  }

  async getPublicReviews(
    request: GetPublicReviewsRequest,
    options?: DiscoveryCallOptions
  ): Promise<Result<GetPublicReviewsResponse, DiscoveryError>> {
    let payload: Record<string, unknown>;
    try {
      const tenantSlug = sanitizeBoundedText(request.tenantSlug, 'tenantSlug', 100);
      if (!tenantSlug) {
        throw new Error('INVALID_ARGUMENT: tenantSlug is required');
      }
      const branchId = request.branchId ? validateUuidField(request.branchId, 'branchId') : null;
      const serviceId = request.serviceId ? validateUuidField(request.serviceId, 'serviceId') : null;
      const staffId = request.staffId ? validateUuidField(request.staffId, 'staffId') : null;
      const minRating =
        request.minRating !== undefined && request.minRating !== null
          ? validateReviewRating(request.minRating)
          : null;
      const { boundedLimit, boundedOffset } = validatePaginationBounds(request.limit, request.offset, 20);

      payload = {
        p_tenant_slug: tenantSlug,
        p_branch_id: branchId,
        p_service_id: serviceId,
        p_staff_id: staffId,
        p_min_rating: minRating,
        p_limit: boundedLimit,
        p_offset: boundedOffset,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INVALID_ARGUMENT',
          reasonCode: 'INVALID_ARGUMENT',
          message: err instanceof Error ? err.message : 'Invalid public reviews request',
        },
      };
    }

    const rpcRes = await invokeDiscoveryRpc<any>('get_public_reviews', payload, options);
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data || {};
    if (!data.success) {
      return {
        success: false,
        error: {
          code: String(data.reason_code || 'NOT_FOUND').toUpperCase(),
          reasonCode: String(data.reason_code || 'not_found'),
          message: 'Public reviews could not be loaded.',
        },
      };
    }

    const agg = data.aggregate || {};
    const dist = agg.rating_distribution || {};
    return {
      success: true,
      data: {
        tenantId: String(data.tenant_id || ''),
        reviews: Array.isArray(data.reviews) ? data.reviews.map(mapPublicReviewItem) : [],
        aggregate: {
          totalCount: Number(agg.total_count || 0),
          averageRating: Number(agg.average_rating || 0),
          ratingDistribution: {
            5: Number(dist['5'] || 0),
            4: Number(dist['4'] || 0),
            3: Number(dist['3'] || 0),
            2: Number(dist['2'] || 0),
            1: Number(dist['1'] || 0),
          },
        },
      },
    };
  }

  async getTenantReviews(
    request: GetTenantReviewsRequest = {},
    options?: DiscoveryCallOptions
  ): Promise<Result<GetTenantReviewsResponse, DiscoveryError>> {
    let payload: Record<string, unknown>;
    try {
      const branchId = request.branchId ? validateUuidField(request.branchId, 'branchId') : null;
      const serviceId = request.serviceId ? validateUuidField(request.serviceId, 'serviceId') : null;
      const staffId = request.staffId ? validateUuidField(request.staffId, 'staffId') : null;
      const customerId = request.customerId ? validateUuidField(request.customerId, 'customerId') : null;
      const minRating =
        request.minRating !== undefined && request.minRating !== null
          ? validateReviewRating(request.minRating)
          : null;
      const { boundedLimit, boundedOffset } = validatePaginationBounds(request.limit, request.offset, 50);

      payload = {
        p_branch_id: branchId,
        p_service_id: serviceId,
        p_staff_id: staffId,
        p_customer_id: customerId,
        p_is_published: request.isPublished ?? null,
        p_min_rating: minRating,
        p_limit: boundedLimit,
        p_offset: boundedOffset,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INVALID_ARGUMENT',
          reasonCode: 'INVALID_ARGUMENT',
          message: err instanceof Error ? err.message : 'Invalid tenant reviews request',
        },
      };
    }

    const rpcRes = await invokeDiscoveryRpc<any>('get_tenant_reviews', payload, options);
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data || {};
    const agg = data.aggregate || {};
    const dist = agg.rating_distribution || {};
    return {
      success: true,
      data: {
        tenantId: String(data.tenant_id || ''),
        reviews: Array.isArray(data.reviews) ? data.reviews.map(mapTenantReviewItem) : [],
        aggregate: {
          totalCount: Number(agg.total_count || 0),
          publishedCount: Number(agg.published_count || 0),
          pendingCount: Number(agg.pending_count || 0),
          averageRating: Number(agg.average_rating || 0),
          ratingDistribution: {
            5: Number(dist['5'] || 0),
            4: Number(dist['4'] || 0),
            3: Number(dist['3'] || 0),
            2: Number(dist['2'] || 0),
            1: Number(dist['1'] || 0),
          },
        },
      },
    };
  }

  async moderateReview(
    request: ModerateReviewRequest,
    options?: DiscoveryCallOptions
  ): Promise<Result<ModerateReviewResponse, DiscoveryError>> {
    let payload: Record<string, unknown>;
    try {
      const reviewId = validateUuidField(request.reviewId, 'reviewId');
      if (!['publish', 'unpublish', 'respond'].includes(request.action)) {
        throw new Error('INVALID_ARGUMENT: action must be publish, unpublish, or respond');
      }
      const responseText =
        request.action === 'respond'
          ? sanitizeBoundedText(request.responseText, 'responseText', 4000)
          : null;
      if (request.action === 'respond' && !responseText) {
        throw new Error('INVALID_ARGUMENT: responseText is required for respond action');
      }
      payload = {
        p_review_id: reviewId,
        p_action: request.action,
        p_response_text: responseText,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INVALID_ARGUMENT',
          reasonCode: 'INVALID_ARGUMENT',
          message: err instanceof Error ? err.message : 'Invalid moderation request',
        },
      };
    }

    const rpcRes = await invokeDiscoveryRpc<any>('moderate_review', payload, options);
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data || {};
    if (!data.success) {
      return {
        success: false,
        error: {
          code: String(data.reason_code || 'MODERATION_REJECTED').toUpperCase(),
          reasonCode: String(data.reason_code || 'moderation_rejected'),
          message: 'Review moderation rejected.',
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        reasonCode: String(data.reason_code || 'ok'),
      },
    };
  }

  async setCustomerFavorite(
    request: SetCustomerFavoriteRequest,
    options?: DiscoveryCallOptions
  ): Promise<Result<SetCustomerFavoriteResponse, DiscoveryError>> {
    let payload: Record<string, unknown>;
    try {
      const tenantId = validateUuidField(request.tenantId, 'tenantId');
      if (typeof request.isFavorite !== 'boolean') {
        throw new Error('INVALID_ARGUMENT: isFavorite must be a boolean');
      }
      payload = {
        p_tenant_id: tenantId,
        p_is_favorite: request.isFavorite,
      };
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INVALID_ARGUMENT',
          reasonCode: 'INVALID_ARGUMENT',
          message: err instanceof Error ? err.message : 'Invalid favorite request',
        },
      };
    }

    const rpcRes = await invokeDiscoveryRpc<any>('set_customer_favorite', payload, options);
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data || {};
    if (!data.success) {
      const reasonCode = String(data.reason_code || 'FAVORITE_REJECTED');
      return {
        success: false,
        error: {
          code: reasonCode,
          reasonCode,
          message: 'Favorite update rejected.',
        },
      };
    }

    return {
      success: true,
      data: {
        success: true,
        reasonCode: String(data.reason_code || 'OK'),
        action: data.action,
        favoriteId: data.favorite_id ?? null,
        isFavorite: Boolean(data.is_favorite),
      },
    };
  }

  async getCustomerFavorites(
    request: GetCustomerFavoritesRequest = {},
    options?: DiscoveryCallOptions
  ): Promise<Result<GetCustomerFavoritesResponse, DiscoveryError>> {
    const { boundedLimit, boundedOffset } = validatePaginationBounds(request.limit, request.offset, 50);

    const rpcRes = await invokeDiscoveryRpc<any>(
      'get_customer_favorites',
      { p_limit: boundedLimit, p_offset: boundedOffset },
      options
    );
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data || {};
    if (!data.success) {
      const reasonCode = String(data.reason_code || 'UNAUTHENTICATED');
      return {
        success: false,
        error: {
          code: reasonCode,
          reasonCode,
          message: 'Favorites could not be loaded.',
        },
      };
    }

    const favorites: CustomerFavoriteDTO[] = Array.isArray(data.favorites)
      ? data.favorites.map((f: any) => ({
          favoriteId: String(f?.favorite_id || ''),
          tenantId: String(f?.tenant_id || ''),
          tenantSlug: String(f?.tenant_slug || ''),
          tenantName: String(f?.tenant_name || ''),
          createdAt: String(f?.created_at || ''),
        }))
      : [];

    return {
      success: true,
      data: {
        total: Number(data.total || 0),
        limit: Number(data.limit || boundedLimit),
        offset: Number(data.offset || boundedOffset),
        favorites,
      },
    };
  }

  async getFastRebookingSeed(
    request: GetFastRebookingSeedRequest,
    options?: DiscoveryCallOptions
  ): Promise<Result<GetFastRebookingSeedResponse, DiscoveryError>> {
    let manageToken: string;
    try {
      manageToken = validateManageTokenFormat(request.manageToken);
    } catch (err) {
      return {
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          reasonCode: 'INVALID_TOKEN',
          message: err instanceof Error ? err.message : 'Invalid manage token',
        },
      };
    }

    const rpcRes = await invokeDiscoveryRpc<any>(
      'get_fast_rebooking_seed_by_manage_token',
      { p_manage_token: manageToken },
      options
    );
    if (rpcRes.success === false) {
      return rpcRes;
    }

    const data = rpcRes.data || {};
    if (!data.success || !data.seed) {
      const reasonCode = String(data.reason_code || 'INVALID_TOKEN');
      return {
        success: false,
        error: {
          code: reasonCode,
          reasonCode,
          message: 'Fast rebooking seed unavailable.',
        },
      };
    }

    const s = data.seed;
    const seed: FastRebookingSeedDTO = {
      sourceAppointmentId: String(s.source_appointment_id || ''),
      tenantSlug: String(s.tenant_slug || ''),
      branchId: String(s.branch_id || ''),
      serviceId: String(s.service_id || ''),
      serviceName: String(s.service_name || ''),
      currentServicePrice: Number(s.current_service_price || 0),
      currentServiceDurationMinutes: Number(s.current_service_duration_minutes || 0),
      staffId: String(s.staff_id || ''),
      staffName: String(s.staff_name || ''),
      requiresCurrentAvailabilitySelection: true,
      availabilityAuthority: 'evaluate_booking_slot',
      bookingAuthority: 'create_public_booking',
      canonicalBookingRequired: true,
    };

    return {
      success: true,
      data: {
        success: true,
        reasonCode: String(data.reason_code || 'OK'),
        seed,
      },
    };
  }
}

export const discoveryMarketplaceService = new DiscoveryMarketplaceService();
export default discoveryMarketplaceService;
