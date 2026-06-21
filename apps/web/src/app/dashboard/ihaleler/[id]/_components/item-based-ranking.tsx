"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
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
    <div className="bg-white ring-1 ring-zinc-950/5 rounded-xl px-3 [--gutter:--spacing(4)]">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader className="w-12">No</TableHeader>
            <TableHeader>Kalem Adı</TableHeader>
            <TableHeader className="w-32">Miktar</TableHeader>
            <TableHeader className="text-right w-40">Hedef Fiyat</TableHeader>
            <TableHeader className="text-right w-72">
              Tedarikçi / Birim Fiyat
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {comparison.items.map((row, idx) => {
            const target = row.tenderItem.targetUnitPrice;
            return (
              <TableRow key={row.tenderItem.id}>
                <TableCell className="text-zinc-600">{idx + 1}</TableCell>
                <TableCell>
                  <p className="font-semibold text-zinc-900">
                    {row.tenderItem.name}
                  </p>
                </TableCell>
                <TableCell className="text-zinc-600">
                  {formatQty(row.tenderItem.quantity)} {row.tenderItem.unit}
                </TableCell>
                <TableCell className="text-right text-zinc-500">
                  {target ? (
                    <>
                      {CURRENCY_SYMBOL[primary]} {formatNumber(target)}
                    </>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
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
                      {row.bestBid.currency !== "TRY" ? (
                        <p className="text-[10px] text-success-700 tabular-nums">
                          ≈ ₺{formatNumber(row.bestBid.unitPriceTry)}
                          {row.bestBid.exchangeRateDate ? (
                            <span className="text-success-600/80 ml-1">
                              (kur: {row.bestBid.exchangeRate.toFixed(4)} ·{" "}
                              {row.bestBid.exchangeRateDate})
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {row.allBids.length > 1 ? (
                        <p className="text-[10px] text-success-600 mt-0.5">
                          +{row.allBids.length - 1} diğer teklif
                        </p>
                      ) : null}
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-400 italic">
                      Henüz teklif yok
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
