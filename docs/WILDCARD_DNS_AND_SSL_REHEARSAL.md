# Wildcard DNS & SSL Rehearsal Guide

This document describes the validation protocols, configurations, and rehearsal steps required for mapping wildcard DNS and securing wildcard SSL/TLS certificates on LARİ's production routing layer.

---

## 1. Production Domain Architecture

LARİ targets the following centralized domain topology for Turkey and Global markets:

| Tier | Hostname Pattern | Purpose | Destination / Target |
| :--- | :--- | :--- | :--- |
| **Root (TR)** | `randevulari.com` | Marketing landing page | Landing page CDN / Cloud Run Ingress |
| **www (TR)** | `www.randevulari.com` | Marketing landing alias | Redirect or Marketing landing CDN |
| **Wildcard (TR)** | `*.randevulari.com` | Tenant dynamic subdomains | Multi-tenant SPA Hosting Ingress |
| **Admin App (TR)** | `app.randevulari.com` | Platform admin portal | Optional isolated admin container |

---

## 2. Mock / Rehearsal DNS Settings

Since we are in a pre-live development configuration, **do not make actual DNS updates in a live registrar**. The following placeholder records demonstrate the target DNS architecture:

```text
Type     Host                    Value / Target                                TTL
────────────────────────────────────────────────────────────────────────────────────────
A        @                       192.0.2.1 (Ingress Load Balancer IP)          3600
A        www                     192.0.2.1 (Ingress Load Balancer IP)          3600
A        *                       192.0.2.1 (Ingress routing IP)                3600
CNAME    app                     ingress.randevulari.com                       3600
```

---

## 3. Wildcard SSL/TLS Certificate Requirements

To ensure all dynamically provisioned tenant subdomains (e.g. `guzellik-salonu.randevulari.com`) are secured with HTTPS, a **wildcard certificate** is mandatory.

### 3.1. TLS Certificate Scope
A single certificate must cover both the apex domain and the wildcard subdomain level:
*   `randevulari.com`
*   `*.randevulari.com`

*Note: Wildcard certificates only cover one level. A subdomain like `sub.branch.randevulari.com` would not be secured by `*.randevulari.com`, which is why branch paths use route folder paths (e.g. `guzellik-salonu.randevulari.com/alsancak`) rather than double subdomains.*

### 3.2. Hosting Provider Managed SSL
*   If using **Vercel** or **Cloud Run / Google Cloud Load Balancing (GCLB)**: Managed SSL automatically handles certificate generation and auto-renewal for wildcard domains using Let's Encrypt once the wildcard DNS point is validated.
*   The system operates using SNI (Server Name Indication) mapping.

---

## 4. Rehearsal / Failure Symptoms & Mitigation

During DNS/SSL propagation, the following errors may occur at the network or reverse-proxy boundary:

### 4.1. Certificate Validation Failures (`ERR_CERT_COMMON_NAME_INVALID`)
*   **Symptom**: Customer opens `bebek-kuafor.randevulari.com` and gets a security warning because the server served the default certificate (e.g. for `randevulari.com` only) rather than the wildcard certificate.
*   **Resolution Check**: Verify that the certificate includes `*.randevulari.com` in the Subject Alternative Names (SAN) array.

### 4.2. SSL Handshake Timeout
*   **Symptom**: Connection hangs and terminates.
*   **Root Cause**: Ingress load balancer hasn't successfully provisioned the Let's Encrypt certificate yet, or DNS propagation isn't fully complete.
*   **Rollback / Fallback Path**: Local or pre-live users should utilize standard hash-routing fallback links (`/#/book?tenant=slug`) to skip subdomain SSL limitations and maintain functional customer booking flows.

---

## 5. Security & Isolation Check
*   **Secrets Security**: No provider credentials or DNS access keys are stored or written to standard code repositories.
*   **Pre-Live Isolation**: No real request commands are dispatched to registrar APIs during pre-live trials.
