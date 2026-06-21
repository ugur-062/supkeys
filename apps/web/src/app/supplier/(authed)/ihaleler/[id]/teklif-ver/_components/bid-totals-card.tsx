"use client";

import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import type { BidFormValues } from "@/lib/tenders/bid-form-schema";
import type { SupplierTenderDetail } from "@/lib/tenders/types";
import { useFormContext, useWatch } from "react-hook-form";

interface Props {
  tender: SupplierTenderDetail;
}

export function BidTotalsCard({ tender }: Props) {
  const { control } = useFormContext<BidFormValues>();
  const items = useWatch({ control, name: "items" }) ?? [];
  const currency =
    useWatch({ control, name: "currency" }) ?? tender.primaryCurrency;

  const tenderItemMap = new Map(tender.items.map((it) => [it.id, it] as const));

  const totalAmount = items.reduce((sum, item) => {
    if (item.unitPrice == null) return sum;
    const ti = tenderItemMap.get(item.tenderItemId);
    if (!ti) return sum;
    return sum + item.unitPrice * Number(ti.quantity);
  }, 0);

  const filledCount = items.filter((i) => i.unitPrice != null).length;
  const totalItems = tender.items.length;
  const pct = totalItems > 0 ? Math.round((filledCount / totalItems) * 100) : 0;

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
    <div className="overflow-hidden rounded-2xl ring-1 ring-zinc-950/5">
      {/* Toplam — siyah blok, ana odak */}
      <div className="bg-zinc-900 p-5 text-white">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          Toplam Teklif
        </p>
        <p className="mt-1.5 text-2xl font-bold tabular-nums">{totalLabel}</p>
      </div>

      {/* Detay */}
      <div className="space-y-3 bg-white p-5">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Para Birimi</span>
          <span className="font-semibold text-zinc-900">
            {currency} {CURRENCY_SYMBOL[currency]}
          </span>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Fiyatlandırılan kalem</span>
            <span className="font-semibold tabular-nums text-zinc-900">
              {filledCount} / {totalItems}
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-zinc-900 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
