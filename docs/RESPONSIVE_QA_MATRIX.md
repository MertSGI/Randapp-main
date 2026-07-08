# Responsive QA Matrix

Every feature of LARİ must be tested against this matrix to ensure a flawless experience across all devices.

## Device Breakpoints
- **Mobile:** 390px width (e.g., iPhone 12/13/14 Pro)
- **Tablet:** 768px width (e.g., iPad Mini/Air portrait)
- **Desktop:** 1440px width (e.g., Standard 13-15" laptop)

## Pass Criteria (All Devices)
1. **No Horizontal Scroll:** At 390px, no element should cause horizontal scrolling.
2. **Text Legibility:** No clipped or truncated critical text.
3. **CTA Accessibility:** Buttons must be fully visible and have adequate tap targets (at least 44px on mobile).
4. **Header/Navigation:** Clean breakdown/hamburger menu on mobile without duplicate headers.
5. **Image Loading:** No broken images; graceful fallbacks required.
6. **No Spurious Errors:** Customer-facing UI must not show "sandbox," "mock," or "payment disabled" warnings.

## Matrix Areas

### 1. Marketing Flow
| View | Desktop | Mobile |
|------|---------|--------|
| Marketing Home | Full hero video, detailed grid | Stacked sections, full-height hero |
| Pricing | Side-by-side comparison | Stacked, sticky CTA |
| Features | Interactive bento grid | Linear list, sticky nav |
| Contact | Side-by-side form & map | Stacked form above map |

### 2. Tenant Salon Application
| View | Desktop | Mobile |
|------|---------|--------|
| Business Preview | Full header, wide hero, side-by-side contact | Collapsed header, stacked hero, linear info flow |
| AI Visualizer | Floating drawer or inline module | Bottom sheet or full screen modal |
| Embedded Booking | Left step column, right summary sticky card | Single column, progress indicator top, summary collapsed |

### 3. Customer Portal
| View | Desktop | Mobile |
|------|---------|--------|
| Dashboard | Side-navigation, grid list of appointments | Bottom navigation, vertical list view |

### 4. Admin Dashboard
| View | Desktop | Mobile |
|------|---------|--------|
| Calendar | Full week/day grid with drag & drop | Day list/timeline view |
| Website Setup | Full split-screen preview/edit | Modal preview, stacked form |
| Billing & Features | Data tables and graphs | Card-based lists |

### 5. Super Admin
| View | Desktop | Mobile |
|------|---------|--------|
| Verification Queue| Data grid with inline review actions | Stacked cards, hidden less critical columns |
| Tenants | Comprehensive table | Summarized cards |
