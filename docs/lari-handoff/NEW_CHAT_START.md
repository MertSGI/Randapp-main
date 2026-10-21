# LARİ — NEW CHATGPT CONVERSATION BOOTSTRAP (`NEW_CHAT_START.md`)

Copy and paste the block below as the **first message** in a new ChatGPT conversation to continue LARİ seamlessly from this GitHub handoff package without repeating any history.

---

## Copy-Paste Prompt for a New ChatGPT Conversation

```markdown
You are continuing product engineering and release operations for **LARİ** (multi-tenant appointment, salon, clinic, and health-tourism SaaS platform).

Your single authoritative source of truth is the evidence-verified GitHub handoff package in `MertSGI/Randapp-main` on branch `handoff/lari-only-20261021` under `docs/lari-handoff/`:

1. `docs/lari-handoff/START_HERE.md`
2. `docs/lari-handoff/CURRENT_PRODUCT_STATE.md`
3. `docs/lari-handoff/COMPLETED_WORK_LEDGER.md`
4. `docs/lari-handoff/OPEN_WORK_AND_DEPENDENCIES.md`
5. `docs/lari-handoff/UI_V2_AND_DESIGN_CONTINUITY.md`
6. `docs/lari-handoff/STAGING_SECURITY_MIGRATIONS_AND_RELEASE.md`
7. `docs/lari-handoff/GITHUB_HISTORY_INDEX.json`
8. `docs/lari-handoff/COVERAGE_AND_PROOF_MANIFEST.json`

Before proposing or executing any action, read those files and adhere to these verified baselines:

- **Canonical Product Repo:** `MertSGI/Randapp-main`
- **Default Branch (Operational Backup Lane):** `staging/supabase-staging-consistency` at `c8dfd3d247c8669b3e21f883451c777a376133ed` (56 migrations + merged Backup PR #1 and PR #2; actual backup dispatch `39397783444` failed at disposable PG17 role restoration; Open PR #3 at `2b238ed66c5ef4f47fd35b613f8dda405c85f60d` fixes role restoration and passed Docker qualification `39485734117`, but is still OPEN/UNMERGED and live backup has not yet been re-dispatched).
- **Converged Product, Security, UI-V2 & Release-Gate Tip:** `staging/ci-lari-release-gate-c1-c4-20261017` at `72911e4fb68dd4f85f7fafef575089104102064e` (898 files, 97 migrations; hosted CI runs `38998120868` and `38998120843` SUCCESS). Strictly contains accepted baseline `06ebf176e411faf6820ded34987f85f7fafef575` (`06ebf176e411faf6820ded34987f894cc5e7dc9e`), UI-V2 marketing a11y `ed3f1232c578ec969fb83e01335ab10659408d1b`, P0 security `87ab5963dce92411db63d4616554eb63ca7f34f8` + PG17 qualification `a2ad98959e9118ef0553609476315282869d2298`, gated UI-V2 storefront `3f6342132ee588fa2ba45fc7fdef6fc2eb36e3cd` + `820315baa94e3f07edcf4c5e1eee1d6f76ae0502`, UI-V2 booking E2E `b02628584d7a6adc3109d84eb06e2ce9381f33a2` + integrity `6f3c04dd292104d2f660ef881f38efc03f060ca4`, interval integrity `70c6f27adbbeaa906b8fc701f972048fca40f511`, Product Convergence L1–L4 `b0abd72536d665aaed334c48f69b68e1d8806942`, and Release Gates C1–C4 (`72911e4fb68dd4f85f7fafef575089104102064e`).
- **Live Staging Database (`rwedeejhjazwjthdjzrt`):** 79 applied migrations. CRITICAL P0: `public.appointment_access_tokens` still has `anon` grants and permissive SELECT policy `Allow public select by token hash` (`qual=true`) on live staging because `20261011155623_appointment_access_tokens_table_access_hardening.sql` is gated on first completing a verified recoverable backup. Never read token rows.
- **No Redevelopment Rule:** Never re-implement completed capabilities listed in `COMPLETED_WORK_LEDGER.md`.
- **Production Status:** `PRODUCTION = NO_GO` until all steps in `OPEN_WORK_AND_DEPENDENCIES.md` are completed and authorized by the owner.

Confirm you have loaded the handoff state from `docs/lari-handoff/` and state the immediate next dependency-ordered action from `OPEN_WORK_AND_DEPENDENCIES.md`.
```
