"use client";

import type { BidFormValues } from "@/lib/tenders/bid-form-schema";
import type { SupplierTenderDetail } from "@/lib/tenders/types";
import { useFormContext, useWatch } from "react-hook-form";

interface Props {
  tender: SupplierTenderDetail;
}

export function BidTotalsCard({ tender }: Props) {
  const { control } = useFormContext<BidFormValues>();
  const items = useWatch({ control, name: "items" }) ?? [];
  const currency = useWatch({ control, name: "currency" }) ?? tender.primaryCurrency;

  const tenderItemMap = new Map(tender.items.map((it) => [it.id, it] as const));

  const totalAmount = items.reduce((sum, item) => {
    if (item.unitPrice == null) return sum;
    const ti = tenderItemMap.get(item.tenderItemId);
    if (!ti) return sum;
    return sum + item.unitPrice * Number(ti.quantity);
  }, 0);

  const filledCount = items.filter((i) => i.unitPrice != null).length;
  const totalItems = tender.items.length;

  let totalLabel = "—";
  try {
    totalLabel = totalAmount.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    totalLabel = `${totalAmount.toFixed(2)} ${currency}`;
  }

  return (
    <div className="bg-gradient-to-br from-brand-50 via-white to-indigo-50/40 border border-brand-200 rounded-2xl p-5">
      <h3 className="text-sm font-bold text-brand-900 uppercase tracking-wide mb-4">
        Teklif Özeti
      </h3>

      <div className="space-y-3">
        <div>
          <p className="text-xs text-slate-500">Para Birimi</p>
          <p className="font-bold text-brand-900">{currency}</p>
        </div>

        <div>
          <p className="text-xs text-slate-500">Kalem</p>
          <p className="font-bold text-brand-900">
            <strong className="text-brand-700">{filledCount}</strong>
            <span className="text-slate-400 mx-1">/</span>
            {totalItems}
            <span className="text-xs text-slate-500 ml-2 font-normal">
              fiyatlandırıldı
            </span>
          </p>
        </div>

        <div className="pt-3 border-t border-brand-200">
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Toplam Teklif
          </p>
          <p className="text-2xl font-display font-bold text-brand-700 mt-1 tabular-nums">
            {totalLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
