"use client";

import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import type { Currency, TenderItemDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { HelpCircle, Inbox } from "lucide-react";

function fmtNumber(value: string | null | undefined, decimals = 2): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

interface Props {
  items: TenderItemDetail[];
  currency: Currency;
}

export function ItemsTab({ items, currency }: Props) {
  if (items.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
          <Inbox className="w-6 h-6 text-slate-400" />
        </div>
        <p className="mt-3 font-medium text-brand-900">Kalem yok</p>
        <p className="text-sm text-slate-500 mt-1">
          Bu ihaleye henüz kalem eklenmemiş.
        </p>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-muted text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide w-12">
                #
              </th>
              <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Kalem
              </th>
              <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Miktar
              </th>
              <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Birim
              </th>
              <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Stok Kodu
              </th>
              <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Hedef Fiyat
              </th>
              <th className="px-4 py-3 font-medium text-slate-500 text-xs uppercase tracking-wide">
                Soru
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr
                key={it.id}
                className="border-t border-surface-border hover:bg-surface-muted/40"
              >
                <td className="px-4 py-3 text-slate-400 tabular-nums">
                  {it.orderIndex}
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-brand-900">{it.name}</p>
                  {it.description ? (
                    <p
                      className="text-xs text-slate-500 mt-0.5 max-w-md truncate"
                      title={it.description}
                    >
                      {it.description}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-brand-900 tabular-nums">
                  {fmtNumber(it.quantity, 4)}
                </td>
                <td className="px-4 py-3 text-slate-600">{it.unit}</td>
                <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                  {it.materialCode || "—"}
                </td>
                <td className="px-4 py-3 text-slate-600 tabular-nums">
                  {it.targetUnitPrice
                    ? `${fmtNumber(it.targetUnitPrice)} ${CURRENCY_SYMBOL[currency]}`
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  {it.customQuestion ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs",
                        "bg-brand-50 text-brand-700 border border-brand-200",
                      )}
                      title={it.customQuestion}
                    >
                      <HelpCircle className="h-3 w-3" />
                      Var
                    </span>
                  ) : (
                    <span className="text-slate-400 text-xs">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
