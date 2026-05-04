"use client";

import { CountdownTimer } from "@/components/countdown-timer";
import {
  TenderStatusBadge,
  TenderTypeBadge,
} from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import type { SupplierTenderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Edit, Send } from "lucide-react";
import Link from "next/link";

export function SupplierTenderHeaderCard({
  tender,
}: {
  tender: SupplierTenderDetail;
}) {
  const isOpen = tender.status === "OPEN_FOR_BIDS";
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
    } else if (myBid.status === "SUBMITTED") {
      cta = (
        <Link href={formHref}>
          <Button variant="secondary" className="mt-3">
            <Edit className="w-4 h-4" />
            Teklifi Revize Et (v{myBid.version})
          </Button>
        </Link>
      );
    } else if (myBid.status === "WITHDRAWN") {
      cta = (
        <Link href={formHref}>
          <Button variant="primary" className="mt-3">
            <Send className="w-4 h-4" />
            Yeniden Teklif Ver
          </Button>
        </Link>
      );
    }
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
            <TenderStatusBadge status={tender.status} />
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
          ) : null}
        </div>
      </div>
    </section>
  );
}
