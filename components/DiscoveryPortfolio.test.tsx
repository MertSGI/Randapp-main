import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { DiscoveryPortfolio, safeExternalUrl } from './DiscoveryPortfolio.tsx';
import {
  DiscoveryMarketplaceView,
  DiscoveryMarketplaceRoute,
  loadDiscoveryDetailBySlug,
} from './DiscoveryMarketplaceView.tsx';
import type { DiscoveryBusinessDetailDTO, DiscoveryListingDTO } from '../types/discoveryMarketplaceDTOs.ts';

const SYNTH_BUSINESS: DiscoveryBusinessDetailDTO = {
  tenantId: 'aaaa1111-a1a1-41a1-81a1-aaaaaaaaaaaa',
  slug: 'aura-nisantasi',
  name: 'Aura Kuaför',
  businessCategory: 'Kuaför',
  shortDescription: 'Nişantaşı bakım stüdyosu',
  city: 'İstanbul',
  district: 'Şişli',
  galleryImages: ['https://example.test/gallery-1.jpg', 'javascript:alert(1)'],
  amenities: ['Wi-Fi', 'Vale'],
  paymentMethods: ['Nakit'],
  websiteUrl: 'javascript:alert(1)',
  instagramUrl: 'https://instagram.com/auranisantasi',
  branches: [{ id: 'b1', name: 'Merkez', slug: 'merkez', isPrimary: true, timezone: 'Europe/Istanbul' }],
  services: [{ id: 's1', name: 'Saç Kesimi', duration: 45, price: 750 }],
  reviewsSummary: {
    totalReviews: 0,
    averageRating: 0,
    distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  },
  recentReviews: [],
};

const SYNTH_LISTING: DiscoveryListingDTO = {
  tenantId: SYNTH_BUSINESS.tenantId,
  slug: SYNTH_BUSINESS.slug,
  name: SYNTH_BUSINESS.name,
  businessCategory: SYNTH_BUSINESS.businessCategory,
  city: SYNTH_BUSINESS.city,
  district: SYNTH_BUSINESS.district,
  galleryImages: [],
  amenities: [],
  reviewCount: 0,
  averageRating: 0,
  featuredServices: [],
};

export async function runDiscoveryPortfolioTests(): Promise<void> {
  // 1. XSS URL sanitization
  assert.equal(safeExternalUrl('javascript:alert(1)'), undefined);
  assert.equal(safeExternalUrl('data:text/html,xss'), undefined);
  assert.equal(safeExternalUrl('https://instagram.com/auranisantasi'), 'https://instagram.com/auranisantasi');

  // 2. Zero-review business must NOT fabricate a 5.0 rating
  const portfolioHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DiscoveryPortfolio, {
      business: SYNTH_BUSINESS,
      directStorefrontUrl: 'https://randevulari.com/#/s/aura-nisantasi',
    })
  );
  assert.ok(portfolioHtml.includes('Aura Kuaför'));
  assert.ok(portfolioHtml.includes('Henüz değerlendirme yok'));
  assert.ok(!portfolioHtml.includes('5.0'), 'Must not fabricate 5.0 rating when reviewCount is 0');
  assert.ok(portfolioHtml.includes('/#/s/aura-nisantasi'));

  // 3. About tab must strip unsafe javascript: URLs
  const aboutHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DiscoveryPortfolio, {
      business: SYNTH_BUSINESS,
      initialTab: 'about',
    })
  );
  assert.ok(!aboutHtml.includes('javascript:alert(1)'));
  assert.ok(aboutHtml.includes('https://instagram.com/auranisantasi'));

  // 4. Verified published reviews render cleanly
  const withReviewHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DiscoveryPortfolio, {
      business: {
        ...SYNTH_BUSINESS,
        reviewsSummary: {
          totalReviews: 1,
          averageRating: 4.0,
          distribution: { 5: 0, 4: 1, 3: 0, 2: 0, 1: 0 },
        },
        recentReviews: [
          {
            id: 'rev-1',
            rating: 4,
            title: 'Temiz ve hızlı',
            content: 'Çok beğendim.',
            createdAt: '2026-11-16T10:00:00Z',
            responseText: 'Teşekkür ederiz!',
          },
        ],
      },
      initialTab: 'reviews',
    })
  );
  assert.ok(withReviewHtml.includes('4.0'));
  assert.ok(withReviewHtml.includes('Temiz ve hızlı'));
  assert.ok(withReviewHtml.includes('Teşekkür ederiz!'));

  // 5. Marketplace disabled state explicitly keeps V1 storefront independence
  const disabledHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DiscoveryMarketplaceView, {
      marketplaceEnabled: false,
      initialListings: [SYNTH_LISTING],
    })
  );
  assert.ok(disabledHtml.includes('discovery-marketplace-disabled'));
  assert.ok(disabledHtml.includes('/#/s/:slug'));

  // 6. Marketplace listing + detail views
  const listHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DiscoveryMarketplaceView, {
      marketplaceEnabled: true,
      initialListings: [SYNTH_LISTING],
    })
  );
  assert.ok(listHtml.includes('Aura Kuaför'));
  assert.ok(listHtml.includes('/#/s/aura-nisantasi'));
  assert.ok(!listHtml.includes('5.0'));

  const detailHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DiscoveryMarketplaceView, {
      marketplaceEnabled: true,
      initialListings: [SYNTH_LISTING],
      initialSelectedBusiness: SYNTH_BUSINESS,
    })
  );
  assert.ok(detailHtml.includes('verified-review-form'));
  assert.ok(detailHtml.includes('fast-rebooking-panel'));

  // 7. /discovery/:tenantSlug route param wiring & deep-link detail loader behavior
  const routedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: ['/discovery/aura-nisantasi'] },
      React.createElement(
        Routes,
        null,
        React.createElement(Route, {
          path: '/discovery/:tenantSlug',
          element: React.createElement(DiscoveryMarketplaceRoute),
        })
      )
    )
  );
  assert.ok(routedHtml.includes('data-discovery-route-slug="aura-nisantasi"'));

  const fetchedSlugs: string[] = [];
  const loadedOk = await loadDiscoveryDetailBySlug('aura-nisantasi', async (req) => {
    fetchedSlugs.push(req.slug);
    return { success: true, data: { business: SYNTH_BUSINESS } };
  });
  assert.deepEqual(fetchedSlugs, ['aura-nisantasi']);
  assert.equal(loadedOk.business?.slug, 'aura-nisantasi');
  assert.equal(loadedOk.error, null);

  const loadedFail = await loadDiscoveryDetailBySlug('missing-salon', async () => ({
    success: false,
    error: { code: 'NOT_FOUND', reasonCode: 'NOT_FOUND', message: 'Business not found.' },
  }));
  assert.equal(loadedFail.business, null);
  assert.equal(loadedFail.error, 'Business not found.');

  console.log('[PASS] DiscoveryPortfolio & DiscoveryMarketplaceView tests verified');
}

await runDiscoveryPortfolioTests();
