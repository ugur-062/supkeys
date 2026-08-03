"use client";

import { EmptyState } from "@/components/list";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { cn } from "@/lib/utils";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { IHALE_VIEW_FOCUS, IhaleListRow } from "./IhaleListRow";

/**
 * Yoğun liste görünümü — kart görünümüyle AYNI props/veri (TenderListItem,
 * yeni API yok); arama/filtre/sıralama üst bileşenden süzülmüş gelir.
 * Seçim + favori yalnız istemci durumudur (favori localStorage'da kalıcı —
 * sunucu alanı yok; toplu sunucu işlemi de yok, bar seçimle sınırlı).
 */
function favKey(listingType: "ALIM" | "SATIS") {
  return listingType === "SATIS"
    ? "satis_ihaleler_favorites"
    : "ihaleler_favorites";
}

export function IhaleListView({
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
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const canCreate = useHasCompanyPermission(
    listingType === "SATIS" ? "sell:listing:create" : "buy:listing:create",
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(favKey(listingType));
      if (raw) setFavorites(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* bozuk kayıt → boş başla */
    }
  }, [listingType]);

  const toggleFavorite = (id: string) => {
    setFavorites((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(favKey(listingType), JSON.stringify([...next]));
      } catch {
        /* kalıcılık olmadan devam */
      }
      return next;
    });
  };

  if (isError) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Veri alınamadı."
        description="Bir hata oluştu — tekrar deneyin."
        variant="no-results"
        action={
          <button
            type="button"
            onClick={onRetry}
            className={cn(
              "inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50",
              IHALE_VIEW_FOCUS,
            )}
          >
            Tekrar dene
          </button>
        }
      />
    );
  }

  if (isLoading && items.length === 0) {
    return (
      <div className="space-y-2" aria-hidden>
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-[76px] animate-pulse rounded-lg bg-slate-100 ring-1 ring-slate-200"
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    const createHref =
      listingType === "SATIS"
        ? "/company/satis/ilanlarim/yeni"
        : "/company/satinalma/ihalelerim/yeni";
    return (
      <EmptyState
        icon={ClipboardList}
        title="Henüz ihale yok"
        description={
          canCreate
            ? "İlk ihaleni birkaç dakikada oluşturabilirsin — davetlileri seç, kalemleri gir, yayınla."
            : "İhale açma işlem rolü (Satın Almacı/Satışçı) gerektirir."
        }
        variant="no-data"
        action={
          canCreate ? (
            <Link
              href={createHref}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800",
                IHALE_VIEW_FOCUS,
              )}
            >
              <Plus className="size-4" aria-hidden />
              {emptyCtaLabel}
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div role="table" aria-label="İhale listesi" className="space-y-2">
      {/* "Tümünü seç" şeridi KALDIRILDI (kullanıcı isteği, 2026-08-03):
          toplu sunucu işlemi yok — seçim yalnız yer kaplıyordu. */}
      {items.map((t) => (
        <IhaleListRow
          key={t.id}
          t={t}
          listingType={listingType}
          favorite={favorites.has(t.id)}
          onToggleFavorite={toggleFavorite}
        />
      ))}
    </div>
  );
}
