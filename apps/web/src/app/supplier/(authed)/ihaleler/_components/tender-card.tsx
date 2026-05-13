import { CategoryBadge } from "@/components/categories/category-badge";
import { CurrencyBadge } from "@/components/currency-badge";
import { deriveSupplierTenderState } from "@/components/supplier/status-badges";
import type { SupplierTenderListItem } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Building2, Calendar, FileText } from "lucide-react";
import Link from "next/link";

function daysUntil(iso: string): number {
  return Math.ceil(
    (new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
}

export function TenderCard({ tender }: { tender: SupplierTenderListItem }) {
  const state = deriveSupplierTenderState(tender.status, tender.myBidStatus);
  const days = daysUntil(tender.bidsCloseAt);
  const isOpen = tender.status === "OPEN_FOR_BIDS" && days >= 0;

  const urgency =
    !isOpen
      ? "text-slate-500"
      : days <= 1
        ? "text-rose-600"
        : days <= 3
          ? "text-amber-600"
          : "text-slate-500";

  return (
    <Link href={`/supplier/ihaleler/${tender.id}`} className="block group">
      <div className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-brand-300 transition-all h-full flex flex-col">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-slate-500 font-mono">
              {tender.tenderNumber}
            </p>
            <h3 className="font-semibold text-brand-900 line-clamp-2 mt-0.5 leading-snug">
              {tender.title}
            </h3>
          </div>
          <span
            className={cn(
              "flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap",
              state.className,
            )}
          >
            {state.label}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm text-slate-600 mb-3 min-w-0">
          <Building2 className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
          <span className="truncate">{tender.tenant.name}</span>
        </div>

        <div className="flex items-center flex-wrap gap-2 text-xs text-slate-500 mb-3">
          <CurrencyBadge currency={tender.primaryCurrency} />
          {tender.categories && tender.categories.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1">
              {tender.categories.slice(0, 2).map((c) => (
                <CategoryBadge key={c.id} category={c} size="sm" />
              ))}
              {tender.categories.length > 2 ? (
                <span
                  className="text-[10px] font-semibold text-slate-500"
                  title={tender.categories
                    .slice(2)
                    .map((c) => c.breadcrumb)
                    .join("\n")}
                >
                  +{tender.categories.length - 2}
                </span>
              ) : null}
            </div>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" />
            {tender.itemCount} kalem
          </span>
          {tender.myBidVersion && tender.myBidVersion > 1 ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">
              v{tender.myBidVersion}
            </span>
          ) : null}
        </div>

        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <div className={cn("flex items-center gap-1.5", urgency)}>
            <Calendar className="h-3 w-3" />
            <span>
              {format(new Date(tender.bidsCloseAt), "dd MMM HH:mm", {
                locale: tr,
              })}
            </span>
          </div>
          {isOpen ? (
            <span className={cn("font-semibold", urgency)}>
              {days > 0
                ? `${days} gün kaldı`
                : days === 0
                  ? "Bugün biter"
                  : "Süre doldu"}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
