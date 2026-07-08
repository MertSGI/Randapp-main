# Mobile & Desktop Public Site QA Checklist

## Layout & Viewport
- [x] Content on Desktop uses an expansive layout (`max-w-4xl` or `max-w-7xl` containers) to feel like a real website rather than a narrow phone viewport.
- [x] Preview wrapper limits width only where appropriate (admin preview context).
- [x] No horizontal scrolling/overflow on mobile devices (320px - 430px widths tested).
- [x] Margins and paddings are generous and adaptively scale based on screen size (`md:px-8`, `px-4`).

## Hero Section, Cover & Assets
- [x] Cover image height is expansive on desktop and reasonable on mobile to allow immediate visibility of brand details.
- [x] Cover images function as the ONLY gallery — there is no independent gallery section, avoiding redundancy.
- [x] Multiple cover images use carousel interaction and support tap-to-lightbox for an immersive viewing experience.
- [x] Logo prominently overlaps the hero section (`-mt-12`), using rounding and border for contrast.
- [x] Clear and readable Typography for Business Name and short description under the logo.

## Booking Flow Separation & Semantic Order
- [x] Public site behaves identically to a standalone marketing web business card until the user initiates a booking. 
- [x] Booking stepping indicator (1-2-3-4-5) is completely hidden during the website view (Step 0).
- [x] The booking flow order strictly follows: Service -> Staff -> Nearest Availability -> Date/Time -> Final Details.
- [x] Nearest availability ("En yakın müsaitlik") is queried and surfaced directly inside the staff selection cards.

## Tap Targets & Accessibility
- [x] All buttons (Instagram, Map, WhatsApp, Phone, Booking) maintain a minimum of 44x44px touch area (Tailwind `h-12 w-12` minimums used for icon buttons).
- [x] Contrast ratios between text and background on `bg-white` / `bg-slate-800` cards is high.

## Media Upload UX
- [x] Profile Edit now defaults to using multi-file native upload components from the user's device (Logo and Cover).
- [x] "Galeri" input has been removed from Business settings to simplify UX.
- [x] Raw URL fields are hidden inside a toggle/collapsible element (`<details>`) as an advanced feature.

## Previews vs Production
- [x] Real preview `SitePreviewPage` looks indistinguishable from the production routing `/book` (minus the admin preview wrapper).
- [x] Identical stylistic patterns to demo are enforced directly via Tailwind.
