// scripts/test-phase4-giftcards-wallet-contracts.mjs
// Phase 4 Node 3: Gift Cards & Client Wallet Foundation Static & Semantic Contract Tests

import fs from 'fs';
import path from 'path';

const migrationPath = path.resolve('supabase/migrations/20260926_phase4_giftcards_wallet_foundation.sql');

console.log('--- Checking Phase 4 Node 3: Gift Cards & Client Wallet Contracts ---');

if (!fs.existsSync(migrationPath)) {
  console.error(`FAIL: Migration file not found at ${migrationPath}`);
  process.exit(1);
}

const sql = fs.readFileSync(migrationPath, 'utf8');

const tests = [
  {
    name: '1. Client wallets table exists with integer minor units, composite foreign key and unique currency constraint',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.client_wallets') &&
                 sql.includes('balance_minor_units INTEGER NOT NULL DEFAULT 0 CHECK (balance_minor_units >= 0)') &&
                 sql.includes('CONSTRAINT fk_client_wallets_customer_tenant FOREIGN KEY (customer_id, tenant_id)') &&
                 sql.includes('CONSTRAINT uq_client_wallet_customer_currency UNIQUE (tenant_id, customer_id, currency)')
  },
  {
    name: '2. Immutable wallet ledger exists with composite foreign keys and database-enforced append-only trigger',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.client_wallet_ledger') &&
                 sql.includes('amount_minor_units INTEGER NOT NULL CHECK (amount_minor_units > 0)') &&
                 sql.includes('CONSTRAINT fk_wallet_ledger_wallet_tenant FOREIGN KEY (wallet_id, tenant_id)') &&
                 sql.includes('CONSTRAINT fk_wallet_ledger_appointment_tenant FOREIGN KEY (appointment_id, tenant_id)') &&
                 sql.includes('trg_prevent_wallet_ledger_mutation') &&
                 sql.includes('BEFORE UPDATE OR DELETE ON public.client_wallet_ledger') &&
                 sql.includes('CONSTRAINT uq_client_wallet_ledger_idempotency UNIQUE (tenant_id, idempotency_key)')
  },
  {
    name: '3. Gift cards table stores hashed codes (no plaintext capability secret)',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.gift_cards') &&
                 sql.includes('code_hash TEXT NOT NULL') &&
                 sql.includes('code_last_four VARCHAR(4) NOT NULL') &&
                 sql.includes('CONSTRAINT uq_gift_cards_code_hash UNIQUE (tenant_id, code_hash)')
  },
  {
    name: '4. Gift card balances enforce minor units bounds',
    check: () => sql.includes('initial_balance_minor_units INTEGER NOT NULL CHECK (initial_balance_minor_units > 0)') &&
                 sql.includes('current_balance_minor_units INTEGER NOT NULL CHECK (current_balance_minor_units >= 0)') &&
                 sql.includes('CONSTRAINT chk_gift_card_balance CHECK (current_balance_minor_units <= initial_balance_minor_units)')
  },
  {
    name: '5. Immutable gift card redemptions table exists with composite FKs and append-only trigger',
    check: () => sql.includes('CREATE TABLE IF NOT EXISTS public.gift_card_redemptions') &&
                 sql.includes('CONSTRAINT fk_gift_card_redemptions_card_tenant FOREIGN KEY (gift_card_id, tenant_id)') &&
                 sql.includes('trg_prevent_gift_card_redemptions_mutation') &&
                 sql.includes('BEFORE UPDATE OR DELETE ON public.gift_card_redemptions') &&
                 sql.includes('CONSTRAINT uq_gift_card_redemptions_idempotency UNIQUE (tenant_id, idempotency_key)')
  },
  {
    name: '6. Wallet transaction RPC verifies customer belongs to tenant, locks wallet row and prevents double-spend',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.transact_wallet_balance') &&
                 sql.includes('customer_not_found_in_tenant') &&
                 sql.includes('FOR UPDATE') &&
                 sql.includes('insufficient_funds')
  },
  {
    name: '7. Wallet transaction RPC supports idempotency replay',
    check: () => sql.includes('is_idempotent_replay') &&
                 sql.includes('public.client_wallet_ledger')
  },
  {
    name: '8. Gift card redemption RPC verifies tenant customer/appointment and locks gift card row',
    check: () => sql.includes('CREATE OR REPLACE FUNCTION public.redeem_gift_card') &&
                 sql.includes('customer_not_found_in_tenant') &&
                 sql.includes('FOR UPDATE') &&
                 sql.includes('gift_card_expired') &&
                 sql.includes('insufficient_balance')
  },
  {
    name: '9. Stored-value financial mutation authority is strictly narrowed',
    check: () => sql.includes('Stored-value financial mutation requires tenant_owner or super_admin') &&
                 sql.includes("v_user.role <> 'super_admin' AND (v_user.role <> 'tenant_owner' OR v_user.tenant_id <> p_tenant_id)")
  },
  {
    name: '10. Search path hardened to pg_catalog, public',
    check: () => (sql.match(/SET search_path = pg_catalog, public/g) || []).length >= 2
  },
  {
    name: '11. RLS enabled on all 4 tables with PUBLIC revoke',
    check: () => sql.includes('ALTER TABLE public.client_wallets ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.client_wallet_ledger ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.gift_cards ENABLE ROW LEVEL SECURITY;') &&
                 sql.includes('ALTER TABLE public.gift_card_redemptions ENABLE ROW LEVEL SECURITY;') &&
                 (sql.match(/REVOKE ALL ON public\..* FROM PUBLIC, anon, authenticated;/g) || []).length >= 4
  }
];

let failed = 0;
tests.forEach((t) => {
  if (t.check()) {
    console.log(`PASS: ${t.name}`);
  } else {
    console.error(`FAIL: ${t.name}`);
    failed++;
  }
});

console.log(`\nResult: ${tests.length - failed}/${tests.length} passed.`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All Phase 4 Node 3 Gift Cards & Client Wallet contracts verified successfully!');
}
