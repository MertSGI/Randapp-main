# LIVE SMOKE TEST SCRIPT

A step-by-step human execute script for testing the live production system end-to-end after deploying LARİ.

1. **Open the Homepage (`/`)**
   - Confirm it renders cleanly, links work, styles are intact.
2. **Open the Pilot Customer Preview (`/pilot/customer`)**
   - Confirm it displays the public booking view properly without asking for an owner login/creating an owner session.
3. **Verify App Routing Behavior**
   - Ensure an unauthenticated request to `/admin` forces a redirect to `/login`.
4. **Register a Test Tenant (`/register`)**
   - Fill out registration and accept terms.
   - Complete checkout path based on active run mode.
   - Wait for redirection to Onboarding.
5. **Complete Onboarding Configuration**
   - Set up basic profile (`slug`), one service, and one staff member.
   - Set up availability.
   - Preview site.
   - Complete "Verifications" and "Go Live" Publish sequence.
6. **Open the Business Public Booking Link (`/#/book?tenant={ID}`)**
   - Ensure the published tenant URL successfully loads the Lumina theme.
7. **Create a Test Booking**
   - Act as an end customer. Proceed through checkout steps on public view.
   - Finalize the Booking (appointment).
8. **Admin Operations Verification**
   - Log back into Admin (`/admin`).
   - Navigate to **Appointments**.
   - Find the newly booked test appointment and mark it "Completed".
9. **Customer Memory Check**
   - Go to **Customer** Tab.
   - Ensure the test customer from step 7 appears.
10. **Reports & Ledger Check**
    - View **Reports**; confirm 1 completed appointment logged in dashboard.
11. **Billing Verification**
    - Go to **Billing**. Confirm that there are no errors about missing subscription data.
12. **Super Admin Review**
    - Access Super Admin.
    - Navigate to **Tenants** or **Go Live Console**.
    - Ensure your newly created tenant reflects accurately.
13. **Export Test Payload**
    - Go to Data Export, locate the test tenant, and run the export snapshot to verify the data was captured fully.

*Pass state: All steps executed cleanly without crashing, looping, or blank-screens.*
