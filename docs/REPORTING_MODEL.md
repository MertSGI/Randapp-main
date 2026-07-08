# Reporting & Analytics Model

The application provides business insights directly to the salon owner via the `/admin` -> Raporlar tab, and platform-wide metrics to the Super Admin via the `/super-admin` dashboard.

## Estimation Approach
Revenue tracking in the MVP relies on **estimated appointment revenue**, not actual payment processing / POS data.

### How it's Calculated
1. The reporting service pulls all appointments.
2. It filters out `cancelled` appointments.
3. For each appointment, it maps the `serviceId` to the `services` catalog.
4. The prevailing price of the service is summed up.
*(Future capability: Store a snapshot `price_at_booking` on the appointment table directly so historical revenue doesn't fluctuate if the global service price is raised later.)*

## Salon Raporlar (Owner View)
Metrics calculated dynamically:
- **Total Appointments:** Raw count of bookings in date range.
- **Completed Appointments:** Count of `status === 'confirmed'` or `status === 'completed'`.
- **Tahmini Gelir (Estimated Revenue):** Sum of service prices for non-cancelled appointments. 
- **Ortalama Randevu Değeri (Average Order Value):** Estimated Revenue / Completed Appointments.
- **Top Booking / Top Revenue Service:** Extracted via simple aggregation loops over the service frequency map.

### Filtering
Currently powered by a simple frontend date switch:
- `this_month`
- `last_month`
- `last_30_days`

### Limitations Caveat
The UI explicitly notes: *"Bu gelir tahmini, uygulama üzerinden oluşturulan (ve iptal edilmeyen) randevulardaki güncel hizmet fiyatlarına göre hesaplanır. Tahsilat garantisi veya kesin finansal tablo değildir."*

## Platform Reporting (Super Admin View)
The Super Admin aggregates data across *all* tenants.
- **Platform Health:** Total salons vs. Active vs. Suspended.
- **Financial Baseline:** Expected MRR based on active subscriptions * current plan rates.
- **Tenant Efficacy:** Shows exactly how many appointments and estimated revenue a specific salon generated this month. This is critical for proving value and reducing churn (e.g., "LARİ helped you process 45,000 TL in bookings this month").
