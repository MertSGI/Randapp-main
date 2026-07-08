# Custom Domain DNS Operations Guide

This document defines the lifecycle, DNS routing configurations, and system operations for connecting customer-owned custom domains (e.g. `www.myhairsalon.com` or `randevu.hairsalon.com`) to their LARİ-hosted booking site.

---

## 1. Custom Domain DNS Configurations

To link their own premium domain, a salon owner must create specific DNS records with their own registrar pointing to LARİ's ingress servers.

### 1.1. Setup Scenario A: Customer wants to use a Subdomain (e.g., `randevu.hairsalon.com`)
This is the recommended setup as it avoids messing with root domain zone configurations.
*   **Instruction**: Create a CNAME record pointing to LARİ's custom-domain routing proxy.

```text
Type     Host        Value / Target             TTL
────────────────────────────────────────────────────────
CNAME    randevu     custom.randevulari.com     3600
```

### 1.2. Setup Scenario B: Customer wants to use their Root Domain (e.g., `hairsalon.com` with `www.hairsalon.com`)
If the customer wants their full website to load their reservation page directly:
1.  **Apex/Root Domain**: Create an A record mapping to LARİ's custom domain ingress Gateway IP (or ALIAS/ANAME record if supported).
2.  **www Alias**: Create a CNAME record pointing the www host to the custom ingress.

```text
Type     Host        Value / Target                      TTL
──────────────────────────────────────────────────────────
A        @           192.0.2.2 (Lari Gateway Landing IP) 3600
CNAME    www         custom.randevulari.com              3600
```

---

## 2. Configuration Status Lifecycle

A custom domain request transitions through a strict state machine to prevent orphaned certificates, visual errors, or DNS hijacking:

```
[ requested ] ───► admin sends details ───► [ dns_instructions_sent ]
                                                      │
                                                      ▼
 [ active ] ◄─── cert leased & resolved ◄─── [ verifying ]
     │                                                │
     ├─ paused by owner ─► [ paused ]                 ├── verification failed ──► [ rejected ]
     └─ deleted ─────────► [ (deleted) ]              └── fallback manually  ───► [ (re-verify) ]
```

### Detailed Status Meanings:

1.  **`requested`**: The salon owner has typed their domain into their LARİ settings dashboard and clicked Submit. No records have been inspected or configured on the server yet.
2.  **`dns_instructions_sent`**: The system (or support team) has generated and sent the specific DNS record parameters depending on whether they asked for Scenario A or B.
3.  **`verifying`**: The owner has clicked "Check DNS" or configured their records. LARİ is background-checking the domain's authoritative DNS zone for correct mapping.
4.  **`active`**: The CNAME/A configuration has been successfully matched, Let's Encrypt has issued an SSL certificate for the customer's domain, and the hosting proxy is ready to serve the customer page.
5.  **`rejected`**: The domain mapping contains invalid structures, is linked to a prohibited policy infraction, or contains typos, and verification is halted.
6.  **`paused`**: The domain is temporarily disabled (either by the owner wanting to use the default subdomain path, or due to past-due billing, suspension, or active dunning procedures).

---

## 3. Operational Warning (No Automatic Activation Claim)

*   **Honesty Guardrail**: The UX and documentation must **never** claim custom domains are automatically configured instantly. Custom domain mapping requires external DNS lookup, verification, and TLS certificate generation, which may take up to 24-48 hours depending on DNS propagation speed across different registrars.
*   **Support Gate**: Custom domain connection is gated by the subscriber's tier and is fully verified before final activation.
