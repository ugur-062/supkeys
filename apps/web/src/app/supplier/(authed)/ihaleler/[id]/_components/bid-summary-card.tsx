"use client";

import { BidStatusBadge } from "@/components/tenders/status-badge";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import type { Currency, MyBidDetail } from "@/lib/tenders/types";
import { Download, FileText } from "lucide-react";

interface Props {
  bid: MyBidDetail;
}

// Backend her zaman items + attachments dolduruyor olsa da, query cache hızla
// güncellenirken stale bir response (örn. taslak ilk save sonrası) eksik
// alanlarla gelebilir. Render'da `?? []` ile null-safe oluyoruz.

function formatMoney(value: string | number, currency: Currency): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "—";
  try {
    return num.toLocaleString("tr-TR", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    });
  } catch {
    return `${num.toFixed(2)} ${currency}`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BidSummaryCard({ bid }: Props) {
  const items = bid.items ?? [];
  const attachments = bid.attachments ?? [];
  return (
    <div className="bg-white ring-1 ring-zinc-950/5 rounded-2xl p-6 space-y-6">
      {/* Üst özet */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Statü
          </p>
          <div className="mt-1">
            <BidStatusBadge status={bid.status} />
          </div>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Versiyon
          </p>
          <p className="font-bold text-zinc-900 mt-1">v{bid.version}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide">
            Toplam
          </p>
          <p className="text-xl font-semibold text-zinc-700 mt-1">
            {formatMoney(bid.totalAmount, bid.currency)}
          </p>
        </div>
      </div>

      {/* Kalemler */}
      {items.length > 0 ? (
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wide text-zinc-900">
            Fiyatlandırılan Kalemler ({items.length})
          </h4>
          <ul className="divide-y divide-zinc-100 rounded-xl ring-1 ring-zinc-950/5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-start justify-between gap-4 p-3.5"
              >
                <div className="min-w-0">
                  <p className="font-medium text-zinc-900">
                    {item.tenderItem.name}
                  </p>
                  <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
                    {Number(item.tenderItem.quantity).toLocaleString("tr-TR")}{" "}
                    {item.tenderItem.unit} ×{" "}
                    {Number(item.unitPrice).toLocaleString("tr-TR")}{" "}
                    {CURRENCY_SYMBOL[item.currency]}
                  </p>
                  {item.customAnswer ? (
                    <p className="mt-1 text-xs italic text-zinc-600">
                      <span className="font-semibold text-warning-700">
                        Cevap:
                      </span>{" "}
                      {item.customAnswer}
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 font-bold tabular-nums text-zinc-900">
                  {formatMoney(item.totalPrice, item.currency)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Notlar */}
      {bid.notes ? (
        <div>
          <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wide mb-2">
            Genel Not
          </h4>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">
            {bid.notes}
          </p>
        </div>
      ) : null}

      {/* Dosyalar */}
      {attachments.length > 0 ? (
        <div>
          <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wide mb-2">
            Dosyalar ({attachments.length})
          </h4>
          <ul className="space-y-2">
            {attachments.map((att) => (
              <li key={att.id}>
                <a
                  href={att.fileUrl}
                  download={att.fileName}
                  className="flex items-center gap-3 p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-zinc-50 flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-zinc-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-zinc-900 truncate">
                      {att.fileName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatBytes(att.fileSize)}
                    </p>
                  </div>
                  <Download className="w-4 h-4 text-slate-400" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
