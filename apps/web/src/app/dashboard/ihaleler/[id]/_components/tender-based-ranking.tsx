"use client";

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
      <div className="flex items-center gap-1 border-b border-slate-200">
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
          ? "border-brand-500 text-brand-700"
          : "border-transparent text-slate-500 hover:text-slate-700",
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
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-slate-700 w-12">
                No
              </th>
              <th className="text-left px-4 py-3 font-semibold text-slate-700">
                Tedarikçi
              </th>
              <th className="text-center px-4 py-3 font-semibold text-slate-700 w-44">
                Teklif Verilen Kalem Sayısı
              </th>
              <th className="text-right px-4 py-3 font-semibold text-slate-700 w-48">
                Toplam Fiyat
              </th>
              <th className="text-center px-4 py-3 font-semibold text-slate-700 w-28">
                Sıralama
              </th>
              <th className="px-4 py-3 w-32"></th>
            </tr>
          </thead>
          <tbody>
            {bids.map((bid, idx) => {
              const isBest = bid.rank === 1;
              const navigate = () =>
                router.push(`/dashboard/ihaleler/${tenderId}/teklif/${bid.id}`);
              return (
                <tr
                  key={bid.id}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/50"
                >
                  <td className="px-4 py-4 text-slate-600">{idx + 1}</td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={navigate}
                      className="text-left"
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-brand-700 hover:underline">
                          {bid.supplier.companyName}
                        </p>
                        {isBest ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-success-100 text-success-700 rounded font-bold whitespace-nowrap">
                            Güncel en iyi teklif
                          </span>
                        ) : null}
                        {bid.version > 1 ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-brand-50 text-brand-700 rounded font-mono">
                            v{bid.version}
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">
                        VKN: {bid.supplier.taxNumber}
                      </p>
                    </button>
                  </td>
                  <td className="px-4 py-4 text-center text-slate-700 font-semibold">
                    {bid.itemsBidCount} / {bid.totalItems}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <p
                      className={cn(
                        "font-bold tabular-nums",
                        isBest ? "text-success-700" : "text-brand-900",
                      )}
                    >
                      {formatCurrency(bid.totalAmount, bid.currency)}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {bid.rank ? (
                      <div className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-brand-50 text-brand-700 font-bold text-sm">
                        {bid.rank}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    <button
                      type="button"
                      onClick={navigate}
                      className="text-xs text-brand-600 hover:underline font-semibold whitespace-nowrap"
                    >
                      Teklifi İncele →
                    </button>
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
