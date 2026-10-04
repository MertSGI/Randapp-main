// services/discoveryMarketplaceService.ts
// Phase 7 Node 2 R2: Discovery Marketplace Application Service Boundary
// Authority: DECISION-022 / LARI-P7-N2-DISCOVERY-MARKETPLACE-R2
//
// Invariants:
// - Typed application service boundary for Discovery Marketplace R2.
// - Delegates to discoveryMarketplaceAdapter for Supabase RPC execution.
// - Provides deterministic error handling via Result<T, E> pattern.
// - Strictly public-safe projections only; no internal business financial or customer private data.

import {
  discoveryMarketplaceAdapter,
  DiscoveryMarketplaceAdapter,
} from '../adapters/discoveryMarketplaceAdapter.ts';
import type {
  DiscoveryListingsRequest,
  DiscoveryListingsResponse,
  DiscoveryDetailRequest,
  DiscoveryDetailResponse,
  DiscoveryError,
  Result,
} from '../types/discoveryMarketplaceDTOs';

export class DiscoveryMarketplaceService {
  private adapter: DiscoveryMarketplaceAdapter;

  constructor(adapter: DiscoveryMarketplaceAdapter = discoveryMarketplaceAdapter) {
    this.adapter = adapter;
  }

  /**
   * Retrieves server-authoritative public discovery marketplace listings with filtering and pagination.
   */
  async getListings(
    request: DiscoveryListingsRequest = {}
  ): Promise<Result<DiscoveryListingsResponse, DiscoveryError>> {
    return this.adapter.fetchListings(request);
  }

  /**
   * Retrieves server-authoritative single business public detail projection by slug.
   */
  async getDetail(
    request: DiscoveryDetailRequest
  ): Promise<Result<DiscoveryDetailResponse, DiscoveryError>> {
    return this.adapter.fetchDetail(request);
  }
}

export const discoveryMarketplaceService = new DiscoveryMarketplaceService();
export default discoveryMarketplaceService;
