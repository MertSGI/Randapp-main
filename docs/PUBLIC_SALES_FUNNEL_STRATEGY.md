# Public Sales Funnel Strategy

This document defines the strategic intent, goal, and Call to Action (CTA) hierarchy for every public-facing page in the LARİ sales funnel. The objective is to naturally guide visitors toward conversion (registration) without pressuring them, providing safe fallback paths for hesitation.

## Core Funnel Flow
Discover value → See example business → Understand customer experience → Understand owner/admin value → Preview own business → Compare pricing → Register → Admin onboarding

## Route Logic

### / (Homepage)
* **Visitor Intent**: "What is LARİ and why should I care?"
* **Page Goal**: Communicate core value quickly.
* **Primary CTA**: Start 14-day trial (`/register?planId=professional`)
* **Secondary CTA**: See example business (`/pilot`)
* **Helper CTAs**: Compare packages (`/pricing`), Preview own business (`/demo`)
* **What to learn**: The core digital storefront, online booking, AI assistant proposition.
* **Next step**: Register or view demo depending on readiness.

### /features (Features)
* **Visitor Intent**: "What does this product actually do?"
* **Page Goal**: Explain modules and features in detail.
* **Primary CTA**: Start 14-Day Free (`/register?planId=professional`)
* **Secondary CTAs**: View example business (`/pilot`), Preview own business (`/demo`)
* **What to learn**: Breadth and depth of available functionalities (booking, catalog, memory, AI).
* **Next step**: Usually `/pilot` or `/demo` to see features in action, or `/register`.

### /mobile-app (Mobile)
* **Visitor Intent**: "How does the customer experience feel on a phone?"
* **Page Goal**: Show customer booking simplicity and owner/admin utility.
* **Primary CTA**: View Customer Experience (`/pilot/customer`)
* **Secondary CTA**: View Admin Panel (`/pilot/admin`)
* **Helper CTAs**: Start 14-Day Free, Preview own business.
* **What to learn**: Seamless mobile layout and responsive design.
* **Next step**: Detailed preview of the specific experience.

### /pricing (Pricing)
* **Visitor Intent**: "Which package is right for me and what does it cost?"
* **Page Goal**: Help the user decide on a plan.
* **Primary CTA**: Plan-specific register (`/register?planId={id}`)
* **Secondary CTA**: Contact for Enterprise (`/contact`)
* **Helper CTAs**: Preview own business (`/demo`), See example business (`/pilot`) — useful recovery for hesitated users.
* **What to learn**: Value scaling across plans.
* **Next step**: `/register` to confirm plan, or previews if unsure.

### /contact (Contact/Support)
* **Visitor Intent**: "I have questions, technical issues, or I am an enterprise customer."
* **Page Goal**: Recover hesitant visitors or capture high-value leads.
* **Primary CTA**: Contact / Support Form
* **Secondary CTAs**: Preview own business (`/demo`), See example business (`/pilot`), Start 14-Day Free.
* **What to learn**: We are approachable and ready to help. 
* **Next step**: Waiting for a reply or trying previews.

### /pilot (Pilot Entry)
* **Visitor Intent**: "Show me how it works."
* **Page Goal**: Split the audience into customer perspective or owner perspective.
* **Primary CTA**: Customer experience (`/pilot/customer`)
* **Secondary CTA**: Admin preview (`/pilot/admin`)
* **Helper CTAs**: Own business preview (`/demo`), Register
* **What to learn**: That the platform provides two distinct, powerful experiences.
* **Next step**: Drill down into customer or admin flows.

### /pilot/customer (SalonWebsiteView without auth)
* **Visitor Intent**: "What will my customers see?"
* **Page Goal**: Prove the smoothness of the booking flow and AI assistant.
* **Primary CTA**: Book Appointment (in-flow actions stay in-flow)
* **Secondary/Helper CTAs**: Back to demos, or bottom helpers for Admin preview (`/pilot/admin`), Own business (`/demo`), Register.
* **What to learn**: Professional, frictionless booking on behalf of customers.
* **Next step**: Admin preview or Register.

### /pilot/admin (Pilot Admin Preview)
* **Visitor Intent**: "What will I control as a business owner?"
* **Page Goal**: Prove the operational value (calendar, clients, settings).
* **Primary CTA**: Start trial (`/register?planId=professional`)
* **Secondary CTA**: Preview own business (`/demo`)
* **Helper CTAs**: View Customer view (`/pilot/customer`)
* **What to learn**: Easy to use, full control over the salon.
* **Next step**: Register to get their own.

### /demo (Demo Landing)
* **Visitor Intent**: "How would my own business look on LARİ?"
* **Page Goal**: Drive imagination, personalization, and connection to their own brand.
* **Primary CTA**: Start 14-Day Free (`/register?planId=professional`)
* **Secondary CTA**: Compare packages (`/pricing`)
* **Helper CTA**: See example business (`/pilot`) if imagination fails.
* **What to learn**: Their brand already looks great on the LARİ platform.
* **Next step**: Register their tenant for real.

### /register (Registration)
* **Visitor Intent**: "I am ready to start my free trial."
* **Page Goal**: Securely collect tenant details and start the 14-day trial.
* **Primary CTA**: Complete Signup.
* **Secondary CTA**: Login (`/login`)
* **Helper CTA**: Compare packages (`/pricing` if unsure about plan).
* **What to learn**: Plan commitment, 14-day secure trial (card required, no charge).
* **Next step**: Application onboarding.

### /login (Login)
* **Visitor Intent**: "I already have an account."
* **Page Goal**: Fast, secure authentication.
* **Primary CTA**: Login
* **Secondary CTA**: Create account (`/register`)
* **Helper CTAs**: Demo / Pilot (if visited by accident or exploring again).
* **What to learn**: Simple access.
* **Next step**: Admin dashboard.
