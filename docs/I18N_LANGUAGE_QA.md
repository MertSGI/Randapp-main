# Translation and Language QA Notes

## Current Architecture
- Language state is managed by `LanguageContext.tsx`.
- The state is persisted in `localStorage` (`language_preference`), persisting user choices across sessions.
- `document.documentElement.lang` is programmatically updated, helping screen readers and browser auto-translate systems identify the page's active language correctly.
- Component strings are replaced dynamically by the `t` object (from `utils/translations.ts`) based on the active language (`tr` or `en`).
- Hardcoded mixed-language statements have been cleaned out from `BookingPage.tsx` and `SalonBookingLayout.tsx` and replaced with context-aware toggles.

## QA Process Followed
1. Ensured the language toggle in `MarketingLayout` immediately updates the state.
2. Verified `document.documentElement.lang` correctly assumes the chosen language value.
3. Verified the booking widget dynamically translates steps, labels, and placeholders.
4. Corrected edge cases (e.g., "Bana Fark Etmez" -> "No Preference") by migrating hard-strings to `translations.ts`.
5. Reused same object inside `AiVisualizerPage.tsx` for consistent handling without blowing up architecture.

## Remaining Considerations
- Service names and Staff names from the database may remain single-language depending on what the Tenant enters. We assume a TR-based tenant writes their service titles in Turkish. We provide `name_tr` keys where possible to fallback optionally.
