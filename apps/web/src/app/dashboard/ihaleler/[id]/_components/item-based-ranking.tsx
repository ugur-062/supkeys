"use client";

import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import type { BidComparisonResponse } from "@/lib/tenders/types";
import { useRouter } from "next/navigation";
import { NoBidsEmptyState } from "./bids-tab";

function formatNumber(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  return num.toLocaleString("tr-TR", { minimumFractionDigits: 2 });
}

function formatQty(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  return num.toLocaleString("tr-TR");
}

export function ItemBasedRanking({
  tenderId,
  comparison,
}: {
  tenderId: string;
  comparison: BidComparisonResponse;
}) {
  const router = useRouter();
  const primary = comparison.tender.primaryCurrency;

  if (comparison.items.length === 0) return <NoBidsEmptyState />;

  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-700 w-12">
                No
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Kalem Adı
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700 w-32">
                Miktar
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 w-40">
                Hedef Fiyat
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 w-72">
                Tedarikçi / Birim Fiyat
              </th>
            </tr>
          </thead>
          <tbody>
            {comparison.items.map((row, idx) => {
              const target = row.tenderItem.targetUnitPrice;
              return (
                <tr
                  key={row.tenderItem.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50"
                >
                  <td className="px-4 py-4 text-slate-600">{idx + 1}</td>
                  <td className="px-4 py-4">
                    <p className="font-semibold text-brand-900">
                      {row.tenderItem.name}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-slate-600">
                    {formatQty(row.tenderItem.quantity)} {row.tenderItem.unit}
                  </td>
                  <td className="px-4 py-4 text-right text-slate-500">
                    {target ? (
                      <>
                        {CURRENCY_SYMBOL[primary]} {formatNumber(target)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {row.bestBid ? (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(
                            `/dashboard/ihaleler/${tenderId}/teklif/${row.bestBid!.bidId}`,
                          )
                        }
                        className="inline-block bg-success-50 hover:bg-success-100 border border-success-200 rounded-lg px-3 py-2 text-left transition cursor-pointer max-w-full"
                      >
                        <p className="text-xs font-semibold text-success-700 truncate hover:underline">
                          {row.bestBid.supplierName}
                        </p>
                        <p className="text-sm font-bold text-success-800 mt-0.5 tabular-nums">
                          {CURRENCY_SYMBOL[row.bestBid.currency]}{" "}
                          {formatNumber(row.bestBid.unitPrice)}
                        </p>
                        {row.allBids.length > 1 ? (
                          <p className="text-[10px] text-success-600 mt-0.5">
                            +{row.allBids.length - 1} diğer teklif
                          </p>
                        ) : null}
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400 italic">
                        Henüz teklif yok
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
