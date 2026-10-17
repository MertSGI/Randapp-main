# LARI release gate C1-C4 acceptance evidence

Evidence format version: 1

## Evidence layers

The accepted Product source is b0abd72536d665aaed334c48f69b68e1d8806942. Its accepted hosted runs are 38951741143 and 38951741181. Its Vercel deployment is dpl_GU7az4n1kdrAYBoGLdNhmNAvQCJA, READY at target null.

This checked-in document records source facts known before a release-gate descendant is created. It never claims the containing commit's future run IDs. After checks pass, the workflow generates release-gate-evidence.json from GITHUB_SHA, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, and GITHUB_WORKFLOW and uploads it as lari-release-gate-evidence-SHA-RUN_ID. GitHub's immutable run record and the generated artifact bind the descendant without another source commit.

## C1 dependency classification

The 17 October 2026 audit of the accepted lockfile reported 11 vulnerable package nodes: one low, three moderate, seven high. npm audit --omit=dev reduced the production set to react-router-dom and react-router only.

| Package | Directness and scope | Production exploitability in LARI | Compatible fix | Breaking-change risk | Decision |
| --- | --- | --- | --- | --- | --- |
| @babel/core 7.29.0 | Transitive development dependency through the React Vite plugin | Build-time arbitrary file read requires attacker-controlled source-map input; reviewed repository sources are the only build input and the package is absent from the browser bundle | Newer patched 7.x resolution | Low, but lockfile-wide build churn | Classify; do not change for this release |
| @tailwindcss/typography 0.5.19 | Direct development dependency; finding is inherited from postcss-selector-parser | Build-time selector parsing only; no runtime code path | Latest 0.5.20 still resolves the affected parser; npm proposes an unsafe downgrade to 0.5.4 | High and not a real remediation path | Classify; do not force or downgrade |
| baseline-browser-mapping 2.10.19 | Transitive development dependency through Browserslist/Babel | Invalid build metadata can terminate the build; no deployed runtime path | 2.11.0 or newer | Low, but no release runtime benefit | Classify |
| browserslist 4.28.2 | Transitive development dependency through Babel | Requires attacker-controlled query/custom stats during build; LARI does not expose this as a service | Newer than 4.28.6; current 4.29.3 | Low | Classify |
| nanoid 3.3.11 | Transitive development dependency through PostCSS | Vulnerable custom/non-secure generator calls are not used by application runtime | 3.3.18 or newer; current 3.3.20 | Low | Classify |
| postcss 8.5.10 | Transitive development dependency through Vite | Source-map file disclosure requires malicious CSS/sourceMappingURL at build time; repository CSS is reviewed and the parser is not deployed | Newer than 8.5.22; current 8.5.30 | Low-to-medium build-output churn | Classify |
| postcss-selector-parser 6.0.10 | Transitive development dependency from direct typography plugin | Crafted selector CPU exhaustion is confined to trusted build input | 7.1.6, but the direct plugin does not yet consume it | Medium because an override crosses the plugin's dependency contract | Classify; no override |
| react-router 7.14.1 | Transitive production dependency of react-router-dom | LARI is a declarative client SPA and has no framework, RSC, SSR hydration, action, or manifest endpoint. The client navigation/open-redirect advisory remains relevant to runtime routing | 7.18.4 through react-router-dom 7.18.4 | Low-to-medium same-major update; requires route and browser regression | Fix |
| react-router-dom 7.14.1 | Direct production dependency | Client-side routing is shipped to users; retaining an affected direct runtime dependency is release-critical even though server-only advisory paths are absent | 7.18.4, compatible with Node 20 and the existing React version | Low-to-medium same-major update | Pin 7.18.4 and requalify |
| source-map-js 1.2.1 | Transitive development dependency through PostCSS | Malformed indexed source-map denial of service is a build-only trusted-input path | 1.2.2 | Low | Classify |
| vite 6.4.2 | Direct development dependency | The advisories affect the Windows development server and launch-editor path; Vite is not served in the production artifact and no untrusted dev-server access is authorized | 6.4.4 is a compatible same-major patch | Low, but not release-critical | Classify; defer to a dedicated toolchain update |

Release decision: update only react-router-dom to exact 7.18.4, which also resolves react-router to 7.18.4. Require npm audit --omit=dev --audit-level=high, TypeScript, production build, route-contract tests, and real Chromium UI-V2 tests. Do not run npm audit fix --force.

## C2 technical state

Backup PR 1 remains draft, unmerged, and separate at 51b98d7cbd0a46f863b7888f9dd141d0107bd305. Static review confirms workflow_dispatch only, exact project and confirmation gates, default-branch execution restriction, environment binding, PostgreSQL 17.6 tools and restore target, age public-recipient encryption, disposable loopback restore, pinned artifact upload, sanitized logging, and no staging restore path.

The manifest binds ciphertext filename, SHA-256, size, source revision, PostgreSQL versions, and restore verdict. The uploaded bytes are content-verifiable but the seven-day GitHub artifact is not an archival or undeletable object; external retention is mandatory. No paid Supabase upgrade or backup add-on is invoked. Account-specific GitHub Actions minutes and artifact billing are not observable from source and remain an owner account check, so billing readiness is UNKNOWN rather than PASS.

Current GitHub environment branch-policy and secret-name reads are permission-gated. Source references are not presence evidence. Both are UNKNOWN until an owner reads Repository Settings > Environments > lari-staging-backup.

## C3 technical state

Controller current facts dated 17 October 2026:

- anon SELECT: TRUE
- anon TRUNCATE: TRUE
- permissive public SELECT policy: PRESENT
- migration 20261011155623: NOT APPLIED

The existing migration is preserved byte-for-byte. Disposable PostgreSQL 17 qualification covers direct anonymous denial, manage-token detail, cancellation, reschedule request, pending-reschedule read, owner scope, cross-tenant denial, service role, policy and ACL invariants, repeat application, rollback, and reapplication.

Live staging remains NOT_APPLIED. The bounded operator procedure is APPOINTMENT_TOKEN_HARDENING_STAGING_CUTOVER.md.

## C4 technical state

Real staging synthetic E2E is NOT_EXECUTED. The one-time, test-owned plan is LARI_STAGING_SYNTHETIC_E2E_PLAN.md. It requires separate credentials and owner authorization after P0, uses server-authoritative RPCs, and permits cleanup only for the explicitly recorded fixture IDs.

## Release boundary

Product remains unmerged and production remains NO_GO. No backup, live SQL, customer-token access, default-branch merge, or production promotion is evidence produced by this source package.
