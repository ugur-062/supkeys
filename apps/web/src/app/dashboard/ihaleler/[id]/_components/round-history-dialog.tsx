"use client";

// V2-7+ — "Teklif Tarihçesi" — bu ihalenin tur zincirini gösterir.
// previousTenderId → nextRounds yolu boyunca her turu listeler.

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button as UiButton } from "@/components/ui/button";
import {
  TenderStatusBadge,
  TenderTypeBadge,
} from "@/components/tenders/status-badge";
import { useRoundHistory } from "@/hooks/use-tenant-tenders";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowRight, History, Loader2, PinIcon } from "lucide-react";
import Link from "next/link";

interface Props {
  open: boolean;
  onClose: () => void;
  tenderId: string;
}

export function RoundHistoryDialog({ open, onClose, tenderId }: Props) {
  const query = useRoundHistory(open ? tenderId : null);

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <History className="h-5 w-5 text-zinc-700" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Teklif Tarihçesi</DialogTitle>
          <DialogDescription>Bu ihalenin tur zinciri</DialogDescription>
        </div>
      </div>

      <DialogBody>
        {query.isLoading ? (
          <div className="flex items-center justify-center py-10 text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="ml-2 text-sm">Yükleniyor…</span>
          </div>
        ) : !query.data || query.data.rounds.length === 0 ? (
          <p className="text-center text-sm text-zinc-500 py-10">
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
                    "rounded-xl p-4 transition-colors ring-1",
                    isCurrent
                      ? "ring-zinc-950/15 bg-zinc-50"
                      : "ring-zinc-950/5 bg-white",
                  )}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-800 text-xs font-bold">
                          Tur #{r.roundNumber}
                        </span>
                        <code className="text-xs font-mono text-zinc-700 font-semibold">
                          {r.tenderNumber}
                        </code>
                        <TenderTypeBadge type={r.type} />
                        <TenderStatusBadge status={r.status as never} />
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-zinc-900 font-semibold">
                            <PinIcon className="w-3 h-3" />
                            Şu an buradasınız
                          </span>
                        ) : null}
                      </div>
                      <p className="font-semibold text-zinc-900 mt-1.5 truncate">
                        {r.title}
                      </p>
                      <p className="text-xs text-zinc-500 mt-1">
                        Kapanış:{" "}
                        {format(new Date(r.bidsCloseAt), "d MMM yyyy HH:mm", {
                          locale: tr,
                        })}
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
                        <UiButton variant="ghost" size="sm">
                          Aç
                          <ArrowRight className="w-3.5 h-3.5" />
                        </UiButton>
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose}>
          Kapat
        </Button>
      </DialogActions>
    </Dialog>
  );
}
