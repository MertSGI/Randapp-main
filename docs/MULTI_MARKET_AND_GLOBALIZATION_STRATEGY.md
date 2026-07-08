# LARİ Platform: Multi-Market & Globalization Strategy

This document outlines the architectural readiness of the LARİ platform to support multiple markets globally from a single core codebase, avoiding brand or structural hardcoding in the frontend.

## 1. Core Architecture

The system operates as a single SaaS product that dynamically adjusts its branding, language, currency, and legal framework according to the current `marketId` ('tr' | 'global').

### Multi-Brand Concept
*   **RandevuLari / RandevuLari.com:** The targeted brand aimed solely at the Turkish market. Features specific Turkish terms, KVKK requirements, iyzico payment processing, and Turkish-centric workflows.
*   **LARİ / lari.app:** The generic, global brand. Features standard GDPR readiness, provider-agnostic payments (Stripe-ready architectures), and broader English language workflows.

## 2. Abstraction Layers

### `marketConfigService`
A central service that reads `(import.meta as any).env.VITE_LARI_MARKET` or hostnames, returning configuration properties required by the App such as:
*   Brand naming properties (`brandName`, `companyName`)
*   Default locales and currencies
*   Domain patterns

### `i18nLanguageConfig`
*   Maintains the active and planned list of languages alongside configurations like direction (`rtl`/`ltr`).
*   Language preference is persisted via local storage (`lari_selected_language`).
*   Language preference can be forced via URL parameters (`?lang=en`).

### `currencyService`
Handles formatted displays of amounts natively rather than hardcoding Turkish Lira (TL/TRY).

### `paymentProviderConfigService`
Abstracts payment integration so the platform avoids coupling internal models directly to 'iyzico'. This prepares us for multi-provider strategies (e.g. Stripe, local gateways) depending on the active `marketId`.

## 3. Developer Guidance
*   **Never hardcode LARİ.** Always use `marketConfigService.getBrandName()`.
*   **Never hardcode "iyzico".** Discuss functions as `payment`.
*   **Never hardcode TRY or ₺.** Always use `currencyService.formatPrice()`.
*   **Respect the Market Identity:** Never show "RandevuLari" to a global customer.
