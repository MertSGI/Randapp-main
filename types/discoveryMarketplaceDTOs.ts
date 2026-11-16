// types/discoveryMarketplaceDTOs.ts
// Phase 7: Discovery Marketplace, Verified Reviews, Favorites & Fast-Rebooking DTOs

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export interface DiscoveryError {
  code: string;
  message: string;
  reasonCode?: string;
  details?: unknown;
}

export interface DiscoveryListingsRequest {
  searchQuery?: string;
  city?: string;
  district?: string;
  category?: string;
  minRating?: number;
  limit?: number;
  offset?: number;
}

export interface DiscoveryPrimaryBranchDTO {
  id: string;
  name: string;
  slug: string;
  isPrimary: boolean;
  timezone: string;
}

export interface DiscoveryFeaturedServiceDTO {
  id: string;
  name: string;
  nameTr?: string;
  duration: number;
  price: number;
  category?: string;
  image?: string;
}

export interface DiscoveryListingDTO {
  tenantId: string;
  slug: string;
  name: string;
  businessCategory: string;
  shortDescription?: string;
  aboutText?: string;
  city: string;
  district: string;
  address?: string;
  coverImageUrl?: string;
  logoUrl?: string;
  galleryImages: string[];
  amenities: string[];
  phone?: string;
  whatsappNumber?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  openingHoursSummary?: string;
  reviewCount: number;
  averageRating: number;
  primaryBranch?: DiscoveryPrimaryBranchDTO | null;
  featuredServices: DiscoveryFeaturedServiceDTO[];
}

export interface DiscoveryListingsResponse {
  totalCount: number;
  limit: number;
  offset: number;
  listings: DiscoveryListingDTO[];
}

export interface DiscoveryDetailRequest {
  slug: string;
}

export interface DiscoveryReviewSummaryDTO {
  totalReviews: number;
  averageRating: number;
  distribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

export interface DiscoveryRecentReviewDTO {
  id: string;
  rating: number;
  title?: string;
  content?: string;
  publishedAt?: string;
  createdAt: string;
  responseText?: string;
  respondedAt?: string;
  serviceName?: string;
  branchName?: string;
}

export interface DiscoveryBranchDetailDTO {
  id: string;
  name: string;
  slug: string;
  isPrimary: boolean;
  timezone: string;
}

export interface DiscoveryServiceDetailDTO {
  id: string;
  name: string;
  nameTr?: string;
  category?: string;
  duration: number;
  price: number;
  image?: string;
}

export interface DiscoveryBusinessDetailDTO {
  tenantId: string;
  slug: string;
  name: string;
  businessCategory: string;
  shortDescription?: string;
  aboutText?: string;
  city: string;
  district: string;
  address?: string;
  phone?: string;
  whatsappNumber?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  openingHoursSummary?: string;
  coverImageUrl?: string;
  logoUrl?: string;
  galleryImages: string[];
  amenities: string[];
  parkingInfo?: string;
  paymentMethods: string[];
  cancellationPolicy?: string;
  bookingPolicy?: string;
  branches: DiscoveryBranchDetailDTO[];
  services: DiscoveryServiceDetailDTO[];
  reviewsSummary: DiscoveryReviewSummaryDTO;
  recentReviews: DiscoveryRecentReviewDTO[];
}

export interface DiscoveryDetailResponse {
  business: DiscoveryBusinessDetailDTO;
}

// =========================================================================
// Verified Reviews DTOs (Phase 7 Node 1)
// =========================================================================

export interface CreateVerifiedReviewRequest {
  appointmentId: string;
  rating: number;
  title?: string;
  content?: string;
  idempotencyKey: string;
}

export interface CreateVerifiedReviewByTokenRequest {
  manageToken: string;
  rating: number;
  title?: string;
  content?: string;
  idempotencyKey: string;
  expectedTenantSlug?: string;
  clientFingerprint?: string;
}

export interface CreateVerifiedReviewResponse {
  success: boolean;
  idempotentReplay: boolean;
  reviewId?: string;
  reasonCode: string;
  message?: string;
  appointmentStatus?: string;
}

export interface GetPublicReviewsRequest {
  tenantSlug: string;
  branchId?: string;
  serviceId?: string;
  staffId?: string;
  minRating?: number;
  limit?: number;
  offset?: number;
}

export interface PublicReviewItemDTO {
  id: string;
  branchId: string;
  branchName: string;
  serviceId: string;
  serviceName: string;
  staffId: string;
  staffName: string;
  rating: number;
  title?: string;
  content?: string;
  responseText?: string;
  respondedAt?: string;
  createdAt: string;
}

export interface PublicReviewsAggregateDTO {
  totalCount: number;
  averageRating: number;
  ratingDistribution: {
    5: number;
    4: number;
    3: number;
    2: number;
    1: number;
  };
}

export interface GetPublicReviewsResponse {
  tenantId: string;
  reviews: PublicReviewItemDTO[];
  aggregate: PublicReviewsAggregateDTO;
}

export interface GetTenantReviewsRequest {
  branchId?: string;
  serviceId?: string;
  staffId?: string;
  customerId?: string;
  isPublished?: boolean;
  minRating?: number;
  limit?: number;
  offset?: number;
}

export interface TenantReviewItemDTO extends PublicReviewItemDTO {
  appointmentId: string;
  appointmentDate: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  isPublished: boolean;
  publishedAt?: string;
  respondedBy?: string;
  respondedByUserId?: string;
  updatedAt: string;
}

export interface TenantReviewsAggregateDTO extends PublicReviewsAggregateDTO {
  publishedCount: number;
  pendingCount: number;
}

export interface GetTenantReviewsResponse {
  tenantId: string;
  reviews: TenantReviewItemDTO[];
  aggregate: TenantReviewsAggregateDTO;
}

export type ReviewModerationAction = 'publish' | 'unpublish' | 'respond';

export interface ModerateReviewRequest {
  reviewId: string;
  action: ReviewModerationAction;
  responseText?: string;
}

export interface ModerateReviewResponse {
  success: boolean;
  reasonCode: string;
}

// =========================================================================
// Favorites & Fast-Rebooking DTOs (Phase 7 Node 3)
// =========================================================================

export interface SetCustomerFavoriteRequest {
  tenantId: string;
  isFavorite: boolean;
}

export interface SetCustomerFavoriteResponse {
  success: boolean;
  reasonCode: string;
  action?: 'ADDED' | 'REMOVED' | 'UNCHANGED';
  favoriteId?: string | null;
  isFavorite?: boolean;
}

export interface CustomerFavoriteDTO {
  favoriteId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  createdAt: string;
}

export interface GetCustomerFavoritesRequest {
  limit?: number;
  offset?: number;
}

export interface GetCustomerFavoritesResponse {
  total: number;
  limit: number;
  offset: number;
  favorites: CustomerFavoriteDTO[];
}

export interface GetFastRebookingSeedRequest {
  manageToken: string;
}

export interface FastRebookingSeedDTO {
  sourceAppointmentId: string;
  tenantSlug: string;
  branchId: string;
  serviceId: string;
  serviceName: string;
  currentServicePrice: number;
  currentServiceDurationMinutes: number;
  staffId: string;
  staffName: string;
  requiresCurrentAvailabilitySelection: true;
  availabilityAuthority: 'evaluate_booking_slot';
  bookingAuthority: 'create_public_booking';
  canonicalBookingRequired: true;
}

export interface GetFastRebookingSeedResponse {
  success: boolean;
  reasonCode: string;
  seed?: FastRebookingSeedDTO;
}
