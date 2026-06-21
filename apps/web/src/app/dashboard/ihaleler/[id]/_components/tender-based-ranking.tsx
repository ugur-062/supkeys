"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import type { TenderBidsResponse } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { useState } from "react";

type SubTab = "complete" | "incomplete";

function formatCurrency(amount: string | number, currency: string): string {
  const num = typeof amount === "string" ? Number(amount) : amount;
  return num.toLocaleString("tr-TR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  });
}

export function TenderBasedRanking({
  tenderId,
  bidsData,
}: {
  tenderId: string;
  bidsData: TenderBidsResponse;
}) {
  const [subTab, setSubTab] = useState<SubTab>(
    bidsData.summary.complete > 0 ? "complete" : "incomplete",
  );
  const visibleBids =
    subTab === "complete" ? bidsData.complete : bidsData.incomplete;

  return (
    <div className="space-y-4">
      {/* Alt-tab'lar */}
      <div className="flex items-center gap-1 border-b border-zinc-950/10">
        <SubTabButton
          active={subTab === "complete"}
          onClick={() => setSubTab("complete")}
        >
          Tamamına Teklif Verenler ({bidsData.summary.complete})
        </SubTabButton>
        <SubTabButton
          active={subTab === "incomplete"}
          onClick={() => setSubTab("incomplete")}
        >
          Eksik Teklif Verenler ({bidsData.summary.incomplete})
        </SubTabButton>
      </div>

      {visibleBids.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
          <p className="text-sm text-slate-500">
            {subTab === "complete"
              ? "Henüz tüm kalemlere teklif veren tedarikçi yok"
              : "Eksik teklif veren tedarikçi yok"}
          </p>
        </div>
      ) : (
        <BidsTable tenderId={tenderId} bids={visibleBids} />
      )}
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition whitespace-nowrap",
        active
          ? "border-zinc-900 text-zinc-900"
          : "border-transparent text-zinc-500 hover:text-zinc-700",
      )}
    >
      {children}
    </button>
  );
}

function BidsTable({
  tenderId,
  bids,
}: {
  tenderId: string;
  bids: TenderBidsResponse["complete"];
}) {
  const router = useRouter();

  return (
    <div className="bg-white ring-1 ring-zinc-950/5 rounded-xl px-3 [--gutter:--spacing(4)]">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader className="w-12">No</TableHeader>
            <TableHeader>Tedarikçi</TableHeader>
            <TableHeader className="text-center w-44">
              Teklif Verilen Kalem Sayısı
            </TableHeader>
            <TableHeader className="text-right w-48">Toplam Fiyat</TableHeader>
            <TableHeader className="text-center w-28">Sıralama</TableHeader>
            <TableHeader className="w-32" />
          </TableRow>
        </TableHead>
        <TableBody>
          {bids.map((bid, idx) => {
            const isBest = bid.rank === 1;
            const navigate = () =>
              router.push(`/dashboard/ihaleler/${tenderId}/teklif/${bid.id}`);
            return (
              <TableRow key={bid.id}>
                <TableCell className="text-zinc-600">{idx + 1}</TableCell>
                <TableCell>
                  <button type="button" onClick={navigate} className="text-left">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-zinc-900 hover:underline">
                        {bid.supplier.companyName}
                      </p>
                      {isBest ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-success-100 text-success-700 rounded font-bold whitespace-nowrap">
                          Güncel en iyi teklif
                        </span>
                      ) : null}
                      {bid.version > 1 ? (
                        <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 text-zinc-700 rounded font-mono">
                          v{bid.version}
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      VKN: {bid.supplier.taxNumber}
                    </p>
                  </button>
                </TableCell>
                <TableCell className="text-center text-zinc-700 font-semibold">
                  {bid.itemsBidCount} / {bid.totalItems}
                </TableCell>
                <TableCell className="text-right">
                  <p
                    className={cn(
                      "font-bold tabular-nums",
                      isBest ? "text-success-700" : "text-zinc-900",
                    )}
                  >
                    {formatCurrency(bid.totalAmount, bid.currency)}
                  </p>
                  {bid.currency !== "TRY" && bid.exchangeRateSnapshot ? (
                    <p className="text-[11px] text-zinc-500 tabular-nums">
                      ≈{" "}
                      {formatCurrency(
                        Number(bid.totalAmount) * bid.exchangeRateSnapshot.rate,
                        "TRY",
                      )}
                      <span className="text-zinc-400 ml-1">
                        (kur: {bid.exchangeRateSnapshot.rate.toFixed(4)})
                      </span>
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-center">
                  {bid.rank ? (
                    <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-zinc-100 text-zinc-900 font-bold text-sm">
                      {bid.rank}
                    </div>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <button
                    type="button"
                    onClick={navigate}
                    className="text-xs text-zinc-900 hover:underline font-semibold whitespace-nowrap"
                  >
                    Teklifi İncele →
                  </button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
