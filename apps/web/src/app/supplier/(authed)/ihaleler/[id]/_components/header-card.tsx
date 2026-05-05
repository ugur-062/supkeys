"use client";

import { CountdownTimer } from "@/components/countdown-timer";
import { TenderTypeBadge } from "@/components/tenders/status-badge";
import { TenderLiveStatusPill } from "@/components/tenders/countdown-full";
import { Button } from "@/components/ui/button";
import type { SupplierTenderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { CheckCircle2, Clock, Edit, Send } from "lucide-react";
import Link from "next/link";

export function SupplierTenderHeaderCard({
  tender,
}: {
  tender: SupplierTenderDetail;
}) {
  const closeDeadlinePassed =
    new Date(tender.bidsCloseAt).getTime() <= Date.now();
  const isOpen = tender.status === "OPEN_FOR_BIDS" && !closeDeadlinePassed;
  const isClosed =
    tender.status === "IN_AWARD" ||
    tender.status === "AWARDED" ||
    tender.status === "CLOSED_NO_AWARD";
  const formHref = `/supplier/ihaleler/${tender.id}/teklif-ver`;
  const myBid = tender.myBid;

  let cta: React.ReactNode = null;
  if (isOpen) {
    if (!myBid) {
      cta = (
        <Link href={formHref}>
          <Button variant="primary" className="mt-3">
            <Send className="w-4 h-4" />
            Teklif Ver
          </Button>
        </Link>
      );
    } else if (myBid.status === "DRAFT") {
      cta = (
        <Link href={formHref}>
          <Button variant="primary" className="mt-3">
            <Edit className="w-4 h-4" />
            Taslağa Devam Et
          </Button>
        </Link>
      );
    } else if (myBid.status === "LOST") {
      // E.5 — alıcı eledi, tedarikçi yeniden teklif verebilir
      cta = (
        <Link href={formHref}>
          <Button variant="primary" className="mt-3">
            <Send className="w-4 h-4" />
            Yeniden Teklif Ver
          </Button>
        </Link>
      );
    }
    // SUBMITTED + WITHDRAWN: header'da CTA yok (revize akışı kaldırıldı)
  }

  return (
    <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 via-white to-indigo-50/40 p-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-5">
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <code className="text-sm text-brand-700 font-mono font-semibold">
              {tender.tenderNumber}
            </code>
            <TenderTypeBadge type={tender.type} />
            <TenderLiveStatusPill status={tender.status} />
          </div>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900 leading-tight">
            {tender.title}
          </h1>
          {tender.description ? (
            <p className="text-slate-600 leading-relaxed max-w-3xl">
              {tender.description}
            </p>
          ) : null}
        </div>

        <div className="flex-shrink-0 md:text-right space-y-2">
          {isOpen ? (
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                Kapanmasına
              </p>
              <CountdownTimer
                deadline={tender.bidsCloseAt}
                className="text-2xl"
              />
              <p className="text-xs text-slate-500 mt-0.5">
                {format(new Date(tender.bidsCloseAt), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
              </p>
              {cta}
            </div>
          ) : tender.status === "IN_AWARD" ? (
            <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-2.5 text-sm text-purple-700 flex items-center gap-2">
              <Clock className="h-4 w-4 flex-shrink-0" />
              <span>İhale kapandı, sonuç bekleniyor</span>
            </div>
          ) : isClosed ? (
            <div className="bg-slate-100 border border-slate-200 rounded-lg px-4 py-2.5 text-sm text-slate-600 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>İhale sonuçlandı</span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
