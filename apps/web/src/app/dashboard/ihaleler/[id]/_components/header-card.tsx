"use client";

import { CountdownTimer } from "@/components/countdown-timer";
import {
  TenderStatusBadge,
  TenderTypeBadge,
} from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import type { TenderDetail } from "@/lib/tenders/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Award } from "lucide-react";

export function TenderHeaderCard({ tender }: { tender: TenderDetail }) {
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

        <div className="flex-shrink-0 md:text-right">
          {tender.status === "OPEN_FOR_BIDS" ? (
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
            </div>
          ) : tender.status === "IN_AWARD" ? (
            <Button variant="primary" disabled title="E.5'te aktif olacak">
              <Award className="h-4 w-4" />
              Kazandırmayı Tamamla
              <span className="ml-1 px-1.5 py-0.5 bg-warning-100 text-warning-700 text-[10px] rounded-md font-semibold uppercase tracking-wide">
                Yakında
              </span>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
