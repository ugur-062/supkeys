"use client";

import { Badge } from "@/components/catalyst/badge";
import { EmptyState, ListSkeleton } from "@/components/list";
import {
  TenderStatusBadge,
  TenderTypeBadge,
} from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { closingUrgency } from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Calendar,
  ClipboardList,
  Gavel,
  Globe,
  MapPin,
  User as UserIcon,
  Users,
} from "lucide-react";
import Link from "next/link";

/** Sahip ihalesi kartı — Satın Al / Açık İhaleler kart dilinin sahip sürümü:
 *  numara + başlık + durum rozeti, usul/kapsam rozetleri, davet-teklif
 *  sayaçları, açan kişi, kapanış + aciliyet. */
export function OwnerTenderCard({
  t,
  listingType = "ALIM",
}: {
  t: TenderListItem;
  listingType?: "ALIM" | "SATIS";
}) {
  const isSatis = listingType === "SATIS";
  const urgency = closingUrgency(t.status, t.bidsCloseAt);
  const fromHref = isSatis
    ? "/company/satis/ilanlarim"
    : "/company/satinalma/ihalelerim";
  const fromLabel = isSatis ? "Satış İlanlarım" : "İhalelerim";

  return (
    <Link
      href={`/company/ilan/${t.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`}
      aria-label={`${t.tenderNumber ?? ""} ${t.title}`.trim()}
      className="group block"
    >
      <div className="flex h-full flex-col rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-zinc-500">
              {t.tenderNumber || "—"}
            </p>
            <h3 className="mt-0.5 line-clamp-2 leading-snug font-semibold text-zinc-950">
              {t.title}
            </h3>
          </div>
          <TenderStatusBadge status={t.status} className="shrink-0" />
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <TenderTypeBadge format={t.format} listingType={t.type} />
          <Badge color="zinc">
            {t.isInternational ? (
              <Globe className="size-3" aria-hidden="true" />
            ) : (
              <MapPin className="size-3" aria-hidden="true" />
            )}
            {t.isInternational ? "Uluslararası" : "Yurtiçi"}
          </Badge>
          <span className="inline-flex items-center gap-1">
            <Users className="h-3 w-3" aria-hidden="true" />
            {t.invitationCount} davetli
          </span>
          <span className="inline-flex items-center gap-1">
            <Gavel className="h-3 w-3" aria-hidden="true" />
            {t.bidCount} teklif
          </span>
          <span className="inline-flex items-center gap-1">
            <UserIcon className="h-3 w-3" aria-hidden="true" />
            {t.createdBy.firstName} {t.createdBy.lastName}
          </span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-3 text-xs">
          <div
            className={cn(
              "flex items-center gap-1.5",
              urgency?.className ?? "text-zinc-500",
            )}
          >
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span>
              {t.bidsCloseAt
                ? `Kapanış ${format(new Date(t.bidsCloseAt), "dd MMM HH:mm", { locale: tr })}`
                : "Kapanış belirlenmedi"}
            </span>
          </div>
          {urgency ? (
            <span className={cn("font-semibold", urgency.className)}>
              {urgency.text}
            </span>
          ) : (
            <span className="text-zinc-400">
              {format(new Date(t.createdAt), "dd MMM yyyy", { locale: tr })}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Kart listesi + yükleniyor/hata/boş durumları (Satın Al görünüm dili). */
export function OwnerTenderList({
  items,
  isLoading,
  isError,
  onRetry,
  listingType = "ALIM",
  emptyCtaLabel = "Yeni İhale Aç",
}: {
  items: TenderListItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  listingType?: "ALIM" | "SATIS";
  emptyCtaLabel?: string;
}) {
  if (isError) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={ClipboardList}
          title="Veri alınamadı."
          description="Bir hata oluştu — tekrar deneyin."
          variant="no-results"
        />
        <div className="text-center">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Tekrar dene
          </Button>
        </div>
      </div>
    );
  }
  if (isLoading && items.length === 0) {
    return <ListSkeleton rows={5} />;
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Henüz ihale yok"
        description={`İlk ihalenizi açmak için "${emptyCtaLabel}" butonunu kullanın.`}
        variant="no-data"
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {items.map((t) => (
        <OwnerTenderCard key={t.id} t={t} listingType={listingType} />
      ))}
    </div>
  );
}
