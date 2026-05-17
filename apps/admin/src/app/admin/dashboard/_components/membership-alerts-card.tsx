"use client";

import { useMembershipAlerts } from "@/hooks/use-admin-tenants";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { AlertTriangle, Calendar, Clock } from "lucide-react";
import Link from "next/link";

interface AlertRowProps {
  id: string;
  name: string;
  city: string | null;
  taxNumber: string | null;
  membershipEndAt: string;
  variant: "expired" | "soon";
}

function AlertRow({
  id,
  name,
  city,
  taxNumber,
  membershipEndAt,
  variant,
}: AlertRowProps) {
  const end = new Date(membershipEndAt);
  const days = Math.ceil((end.getTime() - Date.now()) / (24 * 3600 * 1000));
  const isUrgent = variant === "soon" && days <= 7;
  const label =
    variant === "expired"
      ? `${Math.abs(days)} gün önce doldu`
      : `${days} gün kaldı`;
  return (
    <Link
      href={`/admin/tenants/${id}`}
      className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-surface-subtle transition-colors"
    >
      <div className="min-w-0">
        <p className="font-semibold text-admin-text truncate">{name}</p>
        <p className="text-xs text-admin-text-muted truncate">
          {[taxNumber, city].filter(Boolean).join(" · ") || "—"}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
            variant === "expired"
              ? "bg-danger-100 text-danger-800 border-danger-300"
              : isUrgent
                ? "bg-danger-50 text-danger-700 border-danger-200"
                : "bg-warning-50 text-warning-700 border-warning-200",
          )}
        >
          <AlertTriangle className="h-3 w-3" />
          {label}
        </span>
        <p className="mt-0.5 text-[11px] text-admin-text-muted whitespace-nowrap">
          {format(end, "d MMM yyyy", { locale: tr })}
        </p>
      </div>
    </Link>
  );
}

export function MembershipAlertsCard() {
  const q = useMembershipAlerts(30, 10);
  if (q.isLoading || !q.data) {
    return (
      <div className="admin-card p-5">
        <div className="h-32 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }
  const { expired, expiringSoon, counts } = q.data;
  const totalAlerts = counts.expired + counts.expiringSoon;

  return (
    <div className="admin-card">
      <div className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-admin-text flex items-center gap-2">
            <Calendar className="h-4 w-4 text-warning-600" />
            Üyelik Bitiş Uyarıları
          </h3>
          <p className="mt-0.5 text-xs text-admin-text-muted">
            {counts.expired} dolmuş · {counts.expiringSoon} yaklaşan
            (30 gün içinde)
          </p>
        </div>
        <Link
          href="/admin/tenants?sort=membershipEndAt:asc"
          className="text-xs text-brand-600 hover:underline font-semibold whitespace-nowrap"
        >
          Tümünü Gör →
        </Link>
      </div>

      {totalAlerts === 0 ? (
        <div className="px-5 py-8 text-center">
          <Clock className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm text-admin-text-muted">
            Yaklaşan veya dolmuş üyelik yok.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-surface-border">
          {expired.length > 0 ? (
            <div>
              <p className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-danger-700 bg-danger-50/40">
                Süresi Dolanlar ({counts.expired})
              </p>
              {expired.map((t) => (
                <AlertRow
                  key={t.id}
                  id={t.id}
                  name={t.name}
                  city={t.city}
                  taxNumber={t.taxNumber}
                  membershipEndAt={t.membershipEndAt}
                  variant="expired"
                />
              ))}
            </div>
          ) : null}
          {expiringSoon.length > 0 ? (
            <div>
              <p className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-warning-700 bg-warning-50/40">
                30 Gün İçinde Doluyor ({counts.expiringSoon})
              </p>
              {expiringSoon.map((t) => (
                <AlertRow
                  key={t.id}
                  id={t.id}
                  name={t.name}
                  city={t.city}
                  taxNumber={t.taxNumber}
                  membershipEndAt={t.membershipEndAt}
                  variant="soon"
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
