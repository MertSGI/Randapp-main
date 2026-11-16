import { supabase } from './supabaseClient';
import { getDataSourceMode } from './dataSourceConfig';

export type PosExecutionAuthority = 'DB_AUTHORITATIVE' | 'LOCAL_SIMULATION' | 'EXTERNAL_HOLD';

export type PosPaymentMethod =
  | 'cash'
  | 'card_present'
  | 'card_terminal_adapter'
  | 'customer_wallet'
  | 'external';

export type PosCartItemType = 'service' | 'product' | 'package' | 'custom';

export interface PosCapabilityBoundaryItem {
  capabilityId:
    | 'product_catalog_inventory_ledger'
    | 'suppliers_po_receiving'
    | 'pos_mixed_cart_checkout'
    | 'staff_commissions_tips_ledger'
    | 'card_terminal_hardware_psp'
    | 'customer_wallet_settlement'
    | 'staff_payroll_bank_payout';
  label: string;
  authority: PosExecutionAuthority;
  reasonCode: string;
  rpcContracts: string[];
  notes: string;
}

export interface PosCapabilityBoundaryReport {
  dataMode: 'supabase' | 'local';
  activeAuthority: 'DB_AUTHORITATIVE' | 'LOCAL_SIMULATION';
  productionReady: false;
  capabilities: PosCapabilityBoundaryItem[];
}

export interface PosLineCalculationInput {
  unitPriceMinorUnits: number;
  quantity: number;
  discountMinorUnits?: number;
  taxRateBasisPoints?: number;
}

export interface PosLineCalculationResult {
  grossMinorUnits: number;
  discountMinorUnits: number;
  taxMinorUnits: number;
  lineTotalMinorUnits: number;
}

export interface PosRpcResult<T = Record<string, unknown>> {
  success: boolean;
  authority: PosExecutionAuthority;
  reasonCode: string;
  data?: T;
  error?: string;
}

export interface PosRpcClient {
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
}

/**
 * Validates uppercase 3-letter ISO 4217 currency code.
 */
export function validateIsoCurrency(currency: string): string {
  const normalized = (currency || '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`INVALID_INPUT: Currency '${currency}' must be a 3-letter uppercase ISO code.`);
  }
  return normalized;
}

/**
 * Validates integer minor units (>= 0, or > 0 when strictlyPositive is true).
 */
export function validateMinorUnits(value: number, fieldName: string, strictlyPositive = false): number {
  if (!Number.isInteger(value)) {
    throw new Error(`INVALID_INPUT: ${fieldName} must be an integer in minor units.`);
  }
  if (strictlyPositive ? value <= 0 : value < 0) {
    throw new Error(
      `INVALID_INPUT: ${fieldName} must be ${strictlyPositive ? 'greater than zero' : 'non-negative'}.`
    );
  }
  return value;
}

/**
 * Validates integer basis points within [0, 10000].
 */
export function validateBasisPoints(basisPoints: number, fieldName = 'basisPoints'): number {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) {
    throw new Error(`INVALID_INPUT: ${fieldName} must be an integer between 0 and 10000.`);
  }
  return basisPoints;
}

/**
 * Computes integer minor-unit POS line totals with exact parity to PostgreSQL
 * `pos_add_cart_item` arithmetic:
 *   tax = trunc((unit_price * quantity * tax_rate_bp) / 10000)
 *   line_total = max(0, (unit_price * quantity) - discount + tax)
 */
export function calculatePosLineTotalsMinor(input: PosLineCalculationInput): PosLineCalculationResult {
  const unitPrice = validateMinorUnits(input.unitPriceMinorUnits, 'unitPriceMinorUnits', false);
  const quantity = validateMinorUnits(input.quantity, 'quantity', true);
  const discount = validateMinorUnits(input.discountMinorUnits ?? 0, 'discountMinorUnits', false);
  const taxRateBp = validateBasisPoints(input.taxRateBasisPoints ?? 0, 'taxRateBasisPoints');

  const gross = unitPrice * quantity;
  const tax = Math.trunc((gross * taxRateBp) / 10000);
  const rawTotal = gross - discount + tax;
  const lineTotal = rawTotal < 0 ? 0 : rawTotal;

  return {
    grossMinorUnits: gross,
    discountMinorUnits: discount,
    taxMinorUnits: tax,
    lineTotalMinorUnits: lineTotal,
  };
}

/**
 * Computes integer staff commission in minor units with exact parity to PostgreSQL
 * `pos_checkout_order` (Node 4):
 *   commissionable_base = max(0, unit_price * quantity - discount)  -- excludes tax & tips
 *   commission = trunc((commissionable_base * commission_basis_points) / 10000)
 */
export function calculateStaffCommissionMinor(params: {
  unitPriceMinorUnits: number;
  quantity: number;
  discountMinorUnits?: number;
  commissionBasisPoints: number;
}): { commissionableBaseMinorUnits: number; commissionMinorUnits: number } {
  const unitPrice = validateMinorUnits(params.unitPriceMinorUnits, 'unitPriceMinorUnits', false);
  const quantity = validateMinorUnits(params.quantity, 'quantity', true);
  const discount = validateMinorUnits(params.discountMinorUnits ?? 0, 'discountMinorUnits', false);
  const bp = validateBasisPoints(params.commissionBasisPoints, 'commissionBasisPoints');

  const base = Math.max(unitPrice * quantity - discount, 0);
  const commission = Math.trunc((base * bp) / 10000);

  return {
    commissionableBaseMinorUnits: base,
    commissionMinorUnits: commission,
  };
}

/**
 * Classifies Phase 6 capabilities cleanly between DB-authoritative RPC surfaces,
 * local sandbox simulation, and EXTERNAL_HOLD boundaries.
 */
export function getPosCapabilityBoundaryReport(modeOverride?: 'supabase' | 'local'): PosCapabilityBoundaryReport {
  const dataMode = modeOverride ?? getDataSourceMode();
  const activeAuthority: 'DB_AUTHORITATIVE' | 'LOCAL_SIMULATION' =
    dataMode === 'supabase' ? 'DB_AUTHORITATIVE' : 'LOCAL_SIMULATION';

  return {
    dataMode,
    activeAuthority,
    productionReady: false,
    capabilities: [
      {
        capabilityId: 'product_catalog_inventory_ledger',
        label: 'Ürün Kataloğu & Şube Stok Defteri',
        authority: activeAuthority,
        reasonCode: dataMode === 'supabase' ? 'DB_RPC_AUTHORITATIVE' : 'LOCAL_SIMULATION_ONLY',
        rpcContracts: [
          'pos_create_product',
          'pos_record_stock_receipt',
          'pos_decrement_stock_for_sale',
          'pos_adjust_stock',
          'pos_return_restock',
          'pos_get_branch_inventory',
        ],
        notes:
          dataMode === 'supabase'
            ? 'PostgreSQL append-only inventory_movements + advisory-locked inventory_balances.'
            : 'Yerel demo/simülasyon modu: gerçek DB stok kilidi veya kalıcılığı yoktur.',
      },
      {
        capabilityId: 'suppliers_po_receiving',
        label: 'Tedarikçi, Satınalma Siparişi (PO) & Mal Kabul',
        authority: activeAuthority,
        reasonCode: dataMode === 'supabase' ? 'DB_RPC_AUTHORITATIVE' : 'LOCAL_SIMULATION_ONLY',
        rpcContracts: [
          'pos_create_supplier',
          'pos_create_purchase_order',
          'pos_approve_purchase_order',
          'pos_cancel_purchase_order',
          'pos_receive_purchase_order_items',
          'pos_get_purchase_order',
        ],
        notes:
          dataMode === 'supabase'
            ? 'PO durum makinesi ve atomik kısmi/tam mal kabulü PostgreSQL RPC üzerinden yürütülür.'
            : 'Yerel demo/simülasyon modu: uzak tedarikçi/ERP bağlantısı yoktur.',
      },
      {
        capabilityId: 'pos_mixed_cart_checkout',
        label: 'Karma Sepet POS & Atomik Ödeme Kaydı',
        authority: activeAuthority,
        reasonCode: dataMode === 'supabase' ? 'DB_RPC_AUTHORITATIVE' : 'LOCAL_SIMULATION_ONLY',
        rpcContracts: ['pos_create_order', 'pos_add_cart_item', 'pos_checkout_order', 'pos_get_order'],
        notes:
          dataMode === 'supabase'
            ? 'Hizmet/ürün/özel kalem karması ve atomik stok düşümü DB yetkili (nakit/harici POS kaydı).'
            : 'Yerel demo/simülasyon modu: fiziksel yazar kasa veya canlı tahsilat yoktur.',
      },
      {
        capabilityId: 'staff_commissions_tips_ledger',
        label: 'Personel Prim Kuralları, Bahşiş Dağıtımı & Hak Ediş Defteri',
        authority: activeAuthority,
        reasonCode: dataMode === 'supabase' ? 'DB_RPC_AUTHORITATIVE' : 'LOCAL_SIMULATION_ONLY',
        rpcContracts: [
          'pos_set_staff_commission_rule',
          'pos_set_tip_allocation',
          'pos_get_staff_earnings',
        ],
        notes:
          dataMode === 'supabase'
            ? 'Yalnız dahili hak ediş muhasebesidir (vergi ve bahşiş hariç net matrah); bordro/banka ödemesi yapmaz.'
            : 'Yerel demo/simülasyon modu: dahili simülasyon hesaplamasıdır.',
      },
      {
        capabilityId: 'card_terminal_hardware_psp',
        label: 'Fiziksel Kart Terminali / Canlı PSP Tahsilatı',
        authority: 'EXTERNAL_HOLD',
        reasonCode: 'LIVE_POS_TERMINAL_CREDENTIALS_REQUIRED',
        rpcContracts: [],
        notes:
          'Canlı POS terminali / iyzico kart-mevcut entegrasyonu EXTERNAL_HOLD kapsamındadır; 0 TL kuralı gereği canlı tahsilat yapılmaz.',
      },
      {
        capabilityId: 'customer_wallet_settlement',
        label: 'Müşteri Cüzdanı / Hediye Kartı Tahsilatı',
        authority: 'EXTERNAL_HOLD',
        reasonCode: 'WALLET_LEDGER_DEFERRED_TO_FAZ_D3',
        rpcContracts: [],
        notes:
          'Cüzdan ve paket defteri Faz D3 (ADIM-035) kapsamında eklenecektir; canlı cüzdan bakiyesi düşümü kapalıdır.',
      },
      {
        capabilityId: 'staff_payroll_bank_payout',
        label: 'Otomatik Banka / Bordro Ödeme Dağıtımı',
        authority: 'EXTERNAL_HOLD',
        reasonCode: 'INTERNAL_EARNINGS_ACCOUNTING_ONLY',
        rpcContracts: [],
        notes:
          'Banka EFT, Stripe Connect, iyzico alt-üye işyeri ödemesi ve vergi kesintisi kapsam dışıdır (EXTERNAL_HOLD).',
      },
    ],
  };
}

async function callPosRpc<T>(
  rpcName: string,
  params: Record<string, unknown>,
  deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
): Promise<PosRpcResult<T>> {
  const mode = deps?.mode ?? getDataSourceMode();
  if (mode !== 'supabase') {
    return {
      success: false,
      authority: 'LOCAL_SIMULATION',
      reasonCode: 'LOCAL_SIMULATION_DB_RPC_UNAVAILABLE',
      error: `RPC '${rpcName}' requires supabase data mode; current mode is local simulation.`,
    };
  }

  const client: PosRpcClient = deps?.rpcClient ?? (supabase as unknown as PosRpcClient);
  const { data, error } = await client.rpc(rpcName, params);
  if (error) {
    return {
      success: false,
      authority: 'DB_AUTHORITATIVE',
      reasonCode: 'RPC_EXECUTION_ERROR',
      error: error.message || String(error),
    };
  }

  return {
    success: true,
    authority: 'DB_AUTHORITATIVE',
    reasonCode: 'OK',
    data: data as T,
  };
}

export const posInventoryService = {
  getCapabilityBoundaryReport(modeOverride?: 'supabase' | 'local'): PosCapabilityBoundaryReport {
    return getPosCapabilityBoundaryReport(modeOverride);
  },

  async createProduct(
    input: {
      name: string;
      sku: string;
      priceMinorUnits: number;
      currency: string;
      category?: string;
      barcode?: string | null;
      description?: string | null;
      brand?: string | null;
      unitOfMeasure?: string;
      costMinorUnits?: number;
      taxRateBasisPoints?: number;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    if (!input.name?.trim() || !input.sku?.trim()) {
      return {
        success: false,
        authority: 'DB_AUTHORITATIVE',
        reasonCode: 'INVALID_INPUT',
        error: 'Product name and SKU are required.',
      };
    }

    const price = validateMinorUnits(input.priceMinorUnits, 'priceMinorUnits', false);
    const cost = validateMinorUnits(input.costMinorUnits ?? 0, 'costMinorUnits', false);
    const taxBp = validateBasisPoints(input.taxRateBasisPoints ?? 0, 'taxRateBasisPoints');
    const currency = validateIsoCurrency(input.currency);

    return callPosRpc(
      'pos_create_product',
      {
        p_name: input.name.trim(),
        p_sku: input.sku.trim().toUpperCase(),
        p_price_minor_units: price,
        p_currency: currency,
        p_category: input.category?.trim() || 'general',
        p_barcode: input.barcode ?? null,
        p_description: input.description ?? null,
        p_brand: input.brand ?? null,
        p_unit_of_measure: input.unitOfMeasure?.trim() || 'piece',
        p_cost_minor_units: cost,
        p_tax_rate_basis_points: taxBp,
      },
      deps
    );
  },

  async getBranchInventory(
    branchId: string,
    category?: string | null,
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    if (!branchId?.trim()) {
      return {
        success: false,
        authority: 'DB_AUTHORITATIVE',
        reasonCode: 'INVALID_INPUT',
        error: 'branchId is required.',
      };
    }

    return callPosRpc(
      'pos_get_branch_inventory',
      {
        p_branch_id: branchId,
        p_category: category ?? null,
      },
      deps
    );
  },

  async recordStockReceipt(
    input: {
      branchId: string;
      productId: string;
      quantity: number;
      costMinorUnits?: number;
      referenceId?: string | null;
      idempotencyKey?: string | null;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    const quantity = validateMinorUnits(input.quantity, 'quantity', true);
    const cost = validateMinorUnits(input.costMinorUnits ?? 0, 'costMinorUnits', false);

    return callPosRpc(
      'pos_record_stock_receipt',
      {
        p_branch_id: input.branchId,
        p_product_id: input.productId,
        p_quantity: quantity,
        p_cost_minor_units: cost,
        p_reference_id: input.referenceId ?? null,
        p_idempotency_key: input.idempotencyKey ?? null,
      },
      deps
    );
  },

  async createSupplier(
    input: {
      name: string;
      contactPerson?: string | null;
      email?: string | null;
      phone?: string | null;
      taxIdentifier?: string | null;
      address?: string | null;
      isActive?: boolean;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    if (!input.name?.trim()) {
      return {
        success: false,
        authority: 'DB_AUTHORITATIVE',
        reasonCode: 'INVALID_INPUT',
        error: 'Supplier name is required.',
      };
    }

    return callPosRpc(
      'pos_create_supplier',
      {
        p_name: input.name.trim(),
        p_contact_person: input.contactPerson ?? null,
        p_email: input.email ?? null,
        p_phone: input.phone ?? null,
        p_tax_identifier: input.taxIdentifier ?? null,
        p_address: input.address ?? null,
        p_is_active: input.isActive ?? true,
      },
      deps
    );
  },

  async createPurchaseOrder(
    input: {
      supplierId: string;
      destinationBranchId: string;
      currency: string;
      items: Array<{ product_id: string; quantity: number; unit_cost_minor_units: number }>;
      notes?: string | null;
      poNumber?: string | null;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    if (!Array.isArray(input.items) || input.items.length === 0) {
      return {
        success: false,
        authority: 'DB_AUTHORITATIVE',
        reasonCode: 'INVALID_INPUT',
        error: 'At least one purchase order item is required.',
      };
    }

    const currency = validateIsoCurrency(input.currency);
    for (const item of input.items) {
      validateMinorUnits(item.quantity, 'item.quantity', true);
      validateMinorUnits(item.unit_cost_minor_units, 'item.unit_cost_minor_units', false);
    }

    return callPosRpc(
      'pos_create_purchase_order',
      {
        p_supplier_id: input.supplierId,
        p_destination_branch_id: input.destinationBranchId,
        p_currency: currency,
        p_items: input.items,
        p_notes: input.notes ?? null,
        p_po_number: input.poNumber ?? null,
      },
      deps
    );
  },

  async receivePurchaseOrderItems(
    input: {
      purchaseOrderId: string;
      receipts: Array<{ po_item_id: string; quantity_received: number }>;
      idempotencyKey?: string | null;
      notes?: string | null;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    if (!Array.isArray(input.receipts) || input.receipts.length === 0) {
      return {
        success: false,
        authority: 'DB_AUTHORITATIVE',
        reasonCode: 'INVALID_INPUT',
        error: 'At least one receipt line is required.',
      };
    }

    for (const r of input.receipts) {
      validateMinorUnits(r.quantity_received, 'receipt.quantity_received', true);
    }

    return callPosRpc(
      'pos_receive_purchase_order_items',
      {
        p_purchase_order_id: input.purchaseOrderId,
        p_receipts: input.receipts,
        p_idempotency_key: input.idempotencyKey ?? null,
        p_notes: input.notes ?? null,
      },
      deps
    );
  },

  async createOrder(
    input: { branchId: string; currency: string; customerId?: string | null; notes?: string | null },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    const currency = validateIsoCurrency(input.currency);
    return callPosRpc(
      'pos_create_order',
      {
        p_branch_id: input.branchId,
        p_currency: currency,
        p_customer_id: input.customerId ?? null,
        p_notes: input.notes ?? null,
      },
      deps
    );
  },

  async addCartItem(
    input: {
      orderId: string;
      itemType: PosCartItemType;
      quantity: number;
      productId?: string | null;
      serviceId?: string | null;
      packageId?: string | null;
      appointmentId?: string | null;
      performingStaffId?: string | null;
      customName?: string | null;
      customPriceMinorUnits?: number | null;
      discountMinorUnits?: number;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    const quantity = validateMinorUnits(input.quantity, 'quantity', true);
    const discount = validateMinorUnits(input.discountMinorUnits ?? 0, 'discountMinorUnits', false);

    if (input.itemType === 'package') {
      // Package ledger is deferred to Faz D3 unless DB explicitly provisions service_package_definitions
      const mode = deps?.mode ?? getDataSourceMode();
      if (mode !== 'supabase') {
        return {
          success: false,
          authority: 'EXTERNAL_HOLD',
          reasonCode: 'PACKAGE_CATALOG_DEFERRED_TO_FAZ_D3',
          error: 'Service package catalog is deferred to Faz D3 (ADIM-035).',
        };
      }
    }

    return callPosRpc(
      'pos_add_cart_item',
      {
        p_order_id: input.orderId,
        p_item_type: input.itemType,
        p_quantity: quantity,
        p_product_id: input.productId ?? null,
        p_service_id: input.serviceId ?? null,
        p_package_id: input.packageId ?? null,
        p_appointment_id: input.appointmentId ?? null,
        p_performing_staff_id: input.performingStaffId ?? null,
        p_custom_name: input.customName ?? null,
        p_custom_price_minor_units: input.customPriceMinorUnits ?? null,
        p_discount_minor_units: discount,
      },
      deps
    );
  },

  async checkoutOrder(
    input: {
      orderId: string;
      paymentMethod: PosPaymentMethod;
      amountPaidMinorUnits: number;
      referenceIdentifier?: string | null;
      idempotencyKey?: string | null;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    const amountPaid = validateMinorUnits(input.amountPaidMinorUnits, 'amountPaidMinorUnits', true);

    // Fail-closed EXTERNAL_HOLD guards for live terminal PSP and deferred customer wallet
    if (input.paymentMethod === 'card_terminal_adapter') {
      return {
        success: false,
        authority: 'EXTERNAL_HOLD',
        reasonCode: 'LIVE_POS_TERMINAL_CREDENTIALS_REQUIRED',
        error:
          'Live card terminal adapter is classified EXTERNAL_HOLD (zero live charge permitted). Use cash, offline card_present, or external reference recording.',
      };
    }

    if (input.paymentMethod === 'customer_wallet') {
      return {
        success: false,
        authority: 'EXTERNAL_HOLD',
        reasonCode: 'WALLET_LEDGER_DEFERRED_TO_FAZ_D3',
        error:
          'Customer wallet tender settlement is deferred until Faz D3 (ADIM-035) provisions the wallet ledger.',
      };
    }

    return callPosRpc(
      'pos_checkout_order',
      {
        p_order_id: input.orderId,
        p_payment_method: input.paymentMethod,
        p_amount_paid_minor_units: amountPaid,
        p_reference_identifier: input.referenceIdentifier ?? null,
        p_idempotency_key: input.idempotencyKey ?? null,
      },
      deps
    );
  },

  async setStaffCommissionRule(
    input: {
      staffId: string;
      itemType: PosCartItemType;
      commissionBasisPoints: number;
      active?: boolean;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    const bp = validateBasisPoints(input.commissionBasisPoints, 'commissionBasisPoints');

    return callPosRpc(
      'pos_set_staff_commission_rule',
      {
        p_staff_id: input.staffId,
        p_item_type: input.itemType,
        p_commission_basis_points: bp,
        p_active: input.active ?? true,
      },
      deps
    );
  },

  async setTipAllocation(
    input: {
      orderId: string;
      staffId: string;
      tipMinorUnits: number;
    },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    const tip = validateMinorUnits(input.tipMinorUnits, 'tipMinorUnits', false);

    return callPosRpc(
      'pos_set_tip_allocation',
      {
        p_order_id: input.orderId,
        p_staff_id: input.staffId,
        p_tip_minor_units: tip,
      },
      deps
    );
  },

  async getStaffEarnings(
    input: { staffId: string; fromIso?: string | null; toIso?: string | null },
    deps?: { mode?: 'supabase' | 'local'; rpcClient?: PosRpcClient }
  ): Promise<PosRpcResult> {
    return callPosRpc(
      'pos_get_staff_earnings',
      {
        p_staff_id: input.staffId,
        p_from: input.fromIso ?? null,
        p_to: input.toIso ?? null,
      },
      deps
    );
  },

  /**
   * Explicitly rejects automated bank/PSP payroll disbursement as EXTERNAL_HOLD.
   */
  requestStaffPayout(): PosRpcResult {
    return {
      success: false,
      authority: 'EXTERNAL_HOLD',
      reasonCode: 'INTERNAL_EARNINGS_ACCOUNTING_ONLY',
      error:
        'Automated bank payouts, Stripe Connect, iyzico sub-merchant disbursements, and payroll tax withholding are EXTERNAL_HOLD.',
    };
  },
};
