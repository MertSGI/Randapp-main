// types/discoveryMarketplaceDTOs.ts
// Phase 7 Node 2 R2: Discovery Marketplace DTOs and Result Type
// Authority: DECISION-022 / LARI-P7-N2-DISCOVERY-MARKETPLACE-R2

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

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

export interface DiscoveryError {
  code: string;
  message: string;
  details?: any;
}
