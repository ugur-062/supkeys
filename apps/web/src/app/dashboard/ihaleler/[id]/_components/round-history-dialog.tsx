"use client";

// V2-7+ — "Teklif Tarihçesi" — bu ihalenin tur zincirini gösterir.
// previousTenderId → nextRounds yolu boyunca her turu listeler.

import { TenderStatusBadge, TenderTypeBadge } from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import { useRoundHistory } from "@/hooks/use-tenant-tenders";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowRight,
  History,
  Loader2,
  PinIcon,
  X,
} from "lucide-react";
import Link from "next/link";

interface Props {
  open: boolean;
  onClose: () => void;
  tenderId: string;
}

export function RoundHistoryDialog({ open, onClose, tenderId }: Props) {
  const query = useRoundHistory(open ? tenderId : null);

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-2xl bg-white rounded-2xl shadow-2xl outline-none",
            "max-h-[85vh] flex flex-col",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                <History className="w-5 h-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Teklif Tarihçesi
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500">
                  Bu ihalenin tur zinciri
                </Dialog.Description>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Kapat"
              className="text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {query.isLoading ? (
              <div className="flex items-center justify-center py-10 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="ml-2 text-sm">Yükleniyor…</span>
              </div>
            ) : !query.data || query.data.rounds.length === 0 ? (
              <p className="text-center text-sm text-slate-500 py-10">
                Tur zinciri yüklenemedi.
              </p>
            ) : (
              <ol className="space-y-3">
                {query.data.rounds.map((r) => {
                  const isCurrent = r.id === query.data.currentId;
                  return (
                    <li
                      key={r.id}
                      className={cn(
                        "rounded-xl border p-4 transition-colors",
                        isCurrent
                          ? "border-brand-300 bg-brand-50/60"
                          : "border-surface-border bg-white",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-xs font-bold">
                              Tur #{r.roundNumber}
                            </span>
                            <code className="text-xs font-mono text-brand-700 font-semibold">
                              {r.tenderNumber}
                            </code>
                            <TenderTypeBadge type={r.type} />
                            <TenderStatusBadge status={r.status as never} />
                            {isCurrent ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-brand-700 font-semibold">
                                <PinIcon className="w-3 h-3" />
                                Şu an buradasınız
                              </span>
                            ) : null}
                          </div>
                          <p className="font-semibold text-brand-900 mt-1.5 truncate">
                            {r.title}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            Kapanış:{" "}
                            {format(
                              new Date(r.bidsCloseAt),
                              "d MMM yyyy HH:mm",
                              { locale: tr },
                            )}
                            {r.publishedAt
                              ? ` · Yayın: ${format(
                                  new Date(r.publishedAt),
                                  "d MMM yyyy",
                                  { locale: tr },
                                )}`
                              : ""}
                          </p>
                        </div>
                        {!isCurrent ? (
                          <Link href={`/dashboard/ihaleler/${r.id}`}>
                            <Button variant="ghost" size="sm">
                              Aç
                              <ArrowRight className="w-3.5 h-3.5" />
                            </Button>
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <footer className="px-5 py-3 border-t border-surface-border flex items-center justify-end">
            <Button variant="ghost" size="sm" onClick={onClose}>
              Kapat
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
