# Customer Account Lite Model (MVP)

A frictionless approach to customer account creation during the booking flow.

## Goal
To reduce friction and increase booking conversion, LARİ does NOT require password creation or explicit account registration before booking. 

## Flow
1. Guest booking is the default. 
2. Browser autofill (`name`, `email`, `tel`) speeds up data entry.
3. Upon success, the customer is invited to visit the Customer Portal.
4. Their provided email/phone serves as their primary identity key across the platform.

## Profile Unification strategy
Subsequent bookings using the same email or phone number will be soft-linked to the same `Customer Profile` in the `Customer Memory` system. 

## Production Scaling
- When migrating to real SMS/Email systems, explicit confirmation/marketing consent opt-ins will be collected via OTP/Magic Link.
- Marketing consent is strictly separated from operational communications (e.g. appointment reminders).
