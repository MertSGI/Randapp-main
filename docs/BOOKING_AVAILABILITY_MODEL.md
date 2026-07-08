# Booking Availability Model

## Scope
Defines how LARİ calculates when a customer can book an appointment. 

## Current Implementation (MVP / Phase 1)
- **Static Days/Hours**: The system assumes standard operational hours (e.g., typically configured in the mock database or admin settings).
- **Slot Unavailability**: When an appointment is booked and marked `confirmed`, that exact time slot for that selected staff member is removed from the availability list for the specific date.
- **"No Preference" (Bana Fark Etmez)**: 
  - If a user selects this, the system evaluates all staff for that service.
  - If any staff member is free at a given time slot, that time slot is shown as available.
  - Upon booking with "No Preference", the first available staff member for that slot is automatically assigned the appointment.

## Next Phase Requirements (Production Backend)
When migrating to the production backend (Supabase):
1. **Dynamic Schedule**: Integrate real staff shift patterns, holidays, and breaks from the Admin panel settings.
2. **Buffer Times**: Service durations must intelligently block out consecutive time slots (e.g. a 90-minute coloring service blocks three 30-min slots).
3. **Concurrency Rules**: Ensure physical resources (like washing sinks) are not double-booked if the salon sets resource constraints.
4. **Google Calendar Sync**: Two-way sync to block slots based on external private calendars.
