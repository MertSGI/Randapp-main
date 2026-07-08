# AI Assistant Configuration

This document outlines the architecture, data flows, and security guidelines for AI capabilities (Gemini) within the LARİ platform (Phase 3).

## Current Architecture (Phase 3 Mock-Safe)
- Gemini SDK (`@google/genai`) is completely removed from the frontend client bundle for security.
- The `geminiService.ts` on the frontend acts solely as a safe API client or returns robust mock data when running locally (`VITE_DATA_MODE=mock`).
- **Edge Function Scaffolds**: We have introduced `/supabase/functions/` placeholders (`ai-recommendation`, `ai-visualization`, `ai-quota-check`) to house the actual Gemini integration. In production, this ensures the `GEMINI_API_KEY` is completely hidden and requests are verified on the backend.
- **Future Integration:** For full sandbox and production readiness, we have defined the Edge Function contracts in `EDGE_FUNCTION_CONTRACTS.md` and RLS permissions to restrict unauthorized API consumption.

## Plan-Based Capabilities
AI capability gating is strictly managed by `SubscriptionPlan` features:
1. **Starter**: No AI Recommendation, no AI Visualization.
2. **Professional**: AI Recommendations (`aiRecommendationsEnabled: true`) with a monthly limit. No Visualization.
3. **Premium**: Both AI Recommendations and AI Visualization (`aiVisualizationEnabled: true`), larger quota.

## Data Privacy & KVKK Limits
- **Customer Memory Isolation**: Customer Memory reference photos (`customer.referencePhotos`) are strictly used as salon-internal operational records. They are **NOT** sent to the AI natively.
- **Explicit Uploads Only**: Only photos the customer explicitly uploads on the `/ai-visualizer` (or appointment wizard) specifically for AI recommendations are passed to the Edge Functions.
- **Volatile Processing**: Images passed to AI must be deleted immediately after analysis is complete. They are not stored in Supabase Storage or used for model training.
- **No Biometrics**: We do not implement facial recognition. Features only process hair/style contexts.
- **Super Admin Governance**: The `SuperAdminAISettingsPage` includes a platform-wide "Block Customer Memory Photos" mechanism, enforcing the strict opt-in rule algorithmically.

## Future Production Implementation Requirements
1. **Complete Edge Function Deployment**: Ensure `supabase functions deploy` is performed and `GEMINI_API_KEY` is set via `supabase secrets set`.
2. **Real Quota Tracking**: Introduce `ai_usage_logs` table in Supabase to track tenant-level usage correctly.
3. **True Image Generation Setup**: Link `ai-visualization` to a true foundational image generation API (e.g. Imagen 3) returning short-lived Signed URLs.
