import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Package,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react';
import {
  calculatePosLineTotalsMinor,
  calculateStaffCommissionMinor,
  posInventoryService,
  type PosCapabilityBoundaryItem,
  type PosExecutionAuthority,
} from '../services/posInventoryService';

export interface PosInventoryWorkspacePanelProps {
  modeOverride?: 'supabase' | 'local';
  branchName?: string;
}

const AUTHORITY_BADGE_MAP: Record<
  PosExecutionAuthority,
  { label: string; className: string }
> = {
  DB_AUTHORITATIVE: {
    label: 'DB Yetkili (Supabase RPC)',
    className:
      'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  },
  LOCAL_SIMULATION: {
    label: 'Yerel Simülasyon / Demo',
    className:
      'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800',
  },
  EXTERNAL_HOLD: {
    label: 'EXTERNAL_HOLD (Canlı Kapalı)',
    className:
      'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  },
};

function renderCapabilityIcon(id: PosCapabilityBoundaryItem['capabilityId']) {
  switch (id) {
    case 'product_catalog_inventory_ledger':
      return <Package className="w-4 h-4 text-blue-600 dark:text-blue-400" />;
    case 'suppliers_po_receiving':
      return <Truck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
    case 'pos_mixed_cart_checkout':
      return <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
    case 'staff_commissions_tips_ledger':
      return <Users className="w-4 h-4 text-violet-600 dark:text-violet-400" />;
    default:
      return <Lock className="w-4 h-4 text-slate-500 dark:text-slate-400" />;
  }
}

export const PosInventoryWorkspacePanel: React.FC<PosInventoryWorkspacePanelProps> = ({
  modeOverride,
  branchName = 'Merkez Şube',
}) => {
  const [unitPriceMinor, setUnitPriceMinor] = useState<number>(25000);
  const [quantity, setQuantity] = useState<number>(2);
  const [discountMinor, setDiscountMinor] = useState<number>(0);
  const [taxRateBp, setTaxRateBp] = useState<number>(2000);
  const [commissionBp, setCommissionBp] = useState<number>(1000);

  const boundaryReport = useMemo(() => {
    try {
      return posInventoryService.getCapabilityBoundaryReport(modeOverride);
    } catch {
      return posInventoryService.getCapabilityBoundaryReport('local');
    }
  }, [modeOverride]);

  const previewMath = useMemo(() => {
    try {
      const line = calculatePosLineTotalsMinor({
        unitPriceMinorUnits: Number.isFinite(unitPriceMinor) ? Math.max(0, Math.trunc(unitPriceMinor)) : 0,
        quantity: Number.isFinite(quantity) ? Math.max(1, Math.trunc(quantity)) : 1,
        discountMinorUnits: Number.isFinite(discountMinor) ? Math.max(0, Math.trunc(discountMinor)) : 0,
        taxRateBasisPoints: Number.isFinite(taxRateBp)
          ? Math.min(10000, Math.max(0, Math.trunc(taxRateBp)))
          : 0,
      });
      const comm = calculateStaffCommissionMinor({
        unitPriceMinorUnits: Number.isFinite(unitPriceMinor) ? Math.max(0, Math.trunc(unitPriceMinor)) : 0,
        quantity: Number.isFinite(quantity) ? Math.max(1, Math.trunc(quantity)) : 1,
        discountMinorUnits: Number.isFinite(discountMinor) ? Math.max(0, Math.trunc(discountMinor)) : 0,
        commissionBasisPoints: Number.isFinite(commissionBp)
          ? Math.min(10000, Math.max(0, Math.trunc(commissionBp)))
          : 0,
      });
      return { line, comm };
    } catch {
      return null;
    }
  }, [unitPriceMinor, quantity, discountMinor, taxRateBp, commissionBp]);

  return (
    <section
      aria-label="POS, Envanter, Tedarik ve Prim Yönetimi"
      className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 dark:border-slate-700 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            POS, Ürün Envanteri, Tedarik &amp; Personel Prim-Bahşiş
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Şube: <span className="font-medium text-slate-700 dark:text-slate-200">{branchName}</span> · Veri Modu:{' '}
            <span className="font-mono text-xs">{boundaryReport.dataMode}</span>
          </p>
        </div>

        <span
          className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
            AUTHORITY_BADGE_MAP[boundaryReport.activeAuthority].className
          }`}
        >
          {boundaryReport.activeAuthority === 'DB_AUTHORITATIVE' ? (
            <CheckCircle2 className="w-3.5 h-3.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5" />
          )}
          {AUTHORITY_BADGE_MAP[boundaryReport.activeAuthority].label}
        </span>
      </div>

      {/* Capability Boundary Matrix */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          Yetki &amp; Gerçek/Demo Sınırı Matrisi
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {boundaryReport.capabilities.map((cap) => {
            const badge = AUTHORITY_BADGE_MAP[cap.authority];
            return (
              <div
                key={cap.capabilityId}
                className="rounded-lg border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/70 dark:bg-slate-900/40 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {renderCapabilityIcon(cap.capabilityId)}
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">
                      {cap.label}
                    </span>
                  </div>
                  <span
                    className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium border ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">{cap.notes}</p>
                <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {cap.reasonCode}
                  {cap.rpcContracts.length > 0 ? ` · ${cap.rpcContracts.length} RPC` : ''}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Deterministic Minor-Unit POS & Commission Preview Calculator */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Tamsayı Kuruş (Minor Unit) Sepet &amp; Prim Hesaplama Önizlemesi
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            PostgreSQL POS ödeme defteriyle birebir tam sayı aritmetiği (vergi ve bahşiş prim matrahına dahil edilmez).
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Birim Fiyat (Kuruş)
            <input
              type="number"
              min={0}
              value={unitPriceMinor}
              onChange={(e) => setUnitPriceMinor(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Adet
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            İndirim (Kuruş)
            <input
              type="number"
              min={0}
              value={discountMinor}
              onChange={(e) => setDiscountMinor(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            KDV (Baz Puan)
            <input
              type="number"
              min={0}
              max={10000}
              value={taxRateBp}
              onChange={(e) => setTaxRateBp(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm"
            />
          </label>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
            Prim (Baz Puan)
            <input
              type="number"
              min={0}
              max={10000}
              value={commissionBp}
              onChange={(e) => setCommissionBp(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm"
            />
          </label>
        </div>

        {previewMath && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 text-xs">
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/60">
              <div className="text-slate-500">Vergi</div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white">
                {previewMath.line.taxMinorUnits} minor
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/60">
              <div className="text-slate-500">Satır Toplamı</div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white">
                {previewMath.line.lineTotalMinorUnits} minor
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-900/60">
              <div className="text-slate-500">Prim Matrahı (Vergisiz)</div>
              <div className="font-mono font-semibold text-slate-900 dark:text-white">
                {previewMath.comm.commissionableBaseMinorUnits} minor
              </div>
            </div>
            <div className="p-2.5 rounded bg-emerald-50 dark:bg-emerald-900/20">
              <div className="text-emerald-700 dark:text-emerald-300">Hak Edilen Prim</div>
              <div className="font-mono font-semibold text-emerald-800 dark:text-emerald-200">
                {previewMath.comm.commissionMinorUnits} minor
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default PosInventoryWorkspacePanel;
