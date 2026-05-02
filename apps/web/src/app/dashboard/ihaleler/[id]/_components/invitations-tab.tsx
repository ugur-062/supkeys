"use client";

import { InvitationStatusBadge } from "@/components/tenders/status-badge";
import type { TenderInvitationDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { Building2, CheckCircle2, Clock, Users2 } from "lucide-react";

const MEMBERSHIP_BADGE: Record<"STANDARD" | "PREMIUM", string> = {
  STANDARD: "bg-slate-100 text-slate-600 border-slate-200",
  PREMIUM: "bg-yellow-50 text-yellow-700 border-yellow-200",
};

export function InvitationsTab({
  invitations,
}: {
  invitations: TenderInvitationDetail[];
}) {
  if (invitations.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
          <Users2 className="w-6 h-6 text-slate-400" />
        </div>
        <p className="mt-3 font-medium text-brand-900">
          Davet edilen tedarikçi yok
        </p>
        <p className="text-sm text-slate-500 mt-1">
          Bu ihaleye henüz tedarikçi davet edilmedi.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invitations.map((inv) => (
        <article
          key={inv.id}
          className="card p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
              <Building2 className="h-5 w-5 text-slate-400" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-brand-900 truncate">
                {inv.supplier.companyName}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border",
                    MEMBERSHIP_BADGE[inv.supplier.membership],
                  )}
                >
                  {inv.supplier.membership === "PREMIUM"
                    ? "Premium"
                    : "Standart"}
                </span>
                <span className="text-xs text-slate-500 font-mono">
                  VKN: {inv.supplier.taxNumber}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <InvitationStatusBadge status={inv.status} />
            {inv.emailOpenedAt ? (
              <span className="inline-flex items-center gap-1 text-[11px] text-success-700">
                <CheckCircle2 className="h-3 w-3" />
                E-posta açıldı
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Clock className="h-3 w-3" />
                Açılmadı
              </span>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
