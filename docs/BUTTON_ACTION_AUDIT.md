# Button Action Audit

This document tracks all buttons and actions across the LARİ platform to ensure everything is hooked up or clearly marked as a placeholder.

## Rules
- Every button must do what it promises (navigate, open external tab, save, etc.).
- If a button's feature is incomplete, it MUST open an alert `alert('Bu özellik sonraki fazda aktif edilecektir.')` or have a "Coming Soon" indicator.
- No buttons should fail silently.

## Audit

### Marketing Pages (Home, Features, Pricing, Contact)
- [ ] Primary CTAs ("Önizle", "Başla", vb.) -> `/demo`
- [ ] WhatsApp CTAs -> Open `wa.me` links with parameters.
- [ ] Email CTAs -> Open `mailto:` links.

### Salon Public Pages (BookingPage)
- [ ] Yol Tarifi Al -> Opens Google Maps directions.
- [ ] Haritada Aç -> Opens Google Maps search/direct link.
- [ ] WhatsApp / Instagram -> Opens respective platform links.
- [ ] AI Stil Tavsiyesi -> Links to visualizer tab or feature.
- [ ] Randevu Al / Devam -> Proceeds through the booking funnel.

### Admin Panel
- [ ] Save Profile -> Triggers Supabase/Mock save and shows success.
- [ ] Site Önizlemesini Aç -> Opens `/#/book?preview=true` in a new tab.
- [ ] Harita Linkini Test Et -> Opens `href` in a new tab.
- [ ] Onboarding "Kaydet & Sonraki" -> Advances stepped wizard.
- [ ] Hızlı Ekle (Hizmet/Çalışan) -> Opens modal or redirects.
- [ ] Randevu linkini kopyala -> Copies to clipboard and shows toast.
- [ ] Yayına Hazır Olarak İşaretle -> Calls `goLiveService`, saves state, does not directly publish.
- [ ] Fatura / Ödeme -> Opens iyzico or mock modal (currently should alert placeholder).

### Super Admin
- [ ] Approve Go-Live -> Approves tenant, updates state.
- [ ] Send Back -> Updates state, sets needs_changes.
- [ ] Pause -> Updates state, locks booking page.
- [ ] Contact -> Opens WhatsApp for that tenant.
- [ ] Manage Tenant -> Navigates to tenant detail (or shows alert placeholder).
- [ ] Payment Tests -> Mock payment flows or alert placeholder.
