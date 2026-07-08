# Customer Portal Lite Model (MVP)

The Customer Portal Lite allows salon customers to access, view, and cancel their own appointments without requiring a heavy, password-based registration system.

## Authentication Mechanism (Phase 1 / MVP)
- **Method:** `VITE_DATA_MODE=mock` local storage authentication.
- **Login:** Customers enter their phone number or email.
- **Verification:** The system matches the normalized contact string against existing appointments or mock customer profiles. If a match is found, session state is persisted locally.
- **Production Path:** In production (Supabase), this MUST be replaced with phone OTP, magic links, or a secure `Supabase Auth` provider to prevent unauthorized access. Passwords are intentionally avoided to maximize conversion. This is governed by Edge Functions to enforce true Row Level Security (RLS).

## Features
- **Upcoming Appointments:** View future appointments.
- **Cancel Eligible Appointments:** A customer can cancel their appointment if it is outside the restricted cancellation window (e.g. 12 hours before).
- **Appointment History:** View past/cancelled appointments.
- **Privacy:** Customers CANNOT see internal salon notes or reference photos.

## Future Scope (Customer Marketplace)
In future phases, the Customer Portal will evolve into a directory-based mobile application where users can discover new salons, leave reviews, and receive promotional campaigns.
