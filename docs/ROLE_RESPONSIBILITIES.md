# Role Responsibilities

## Salon Customer (Unauthenticated Client)
- **Access**: Public pages (`/`), Booking experience (`/book`), AI Visualizer (`/ai-visualizer`).
- **Capabilities**: Book appointments, view salon information, use AI tools (if enabled for tenant).
- **Restrictions**: Cannot access `/admin` or `/super-admin`.

## Salon Owner / Tenant Admin (`admin@randapp.com`)
- **Access**: Marketing pages (`/`), Customer pages (`/book`), Admin Panel (`/admin`).
- **Capabilities**: Manage services, manage staff, view/manage appointments, run reports, manage billing/subscription.
- **Tenant Control**: Can only access data associated with their own `tenantId`.
- **Restrictions**: Cannot access `/super-admin`.

## Super Admin (`superadmin@randapp.com`)
- **Access**: Super Admin Dashboard (`/super-admin`), Marketing pages (`/`). Admin pages (`/admin`) access might be limited or require impersonation.
- **Capabilities**: View all tenants across the platform. View aggregate platform metrics (Total Salons, MRR, Active). Manage platform-wide billing plans. Approve or pause tenant "Go-Live" requests.
- **Restrictions**: Should not generally create direct bookings on behalf of salons unless impersonating.

## Development Mock Accounts
- `admin@randapp.com` / `admin123` (Salon Owner)
- `superadmin@randapp.com` / `superadmin123` (Super Admin)
