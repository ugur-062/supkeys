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
const FAV_KEY = "satın alma talepleri_favorites";

export function IhaleListView({
  items,
  isLoading,
  isError,
  onRetry,
  emptyCtaLabel = "Satın Alma Talebi Aç",
}: {
  items: TenderListItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  emptyCtaLabel?: string;
}) {
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const canCreate = useHasCompanyPermission("buy:listing:manage");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      if (raw) setFavorites(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* bozuk kayıt → boş başla */
    }
  }, []);

  const toggleFavorite = (id: string) => {
    setFavorites((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(FAV_KEY, JSON.stringify([...next]));
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
    const createHref = "/company/satinalma/taleplerim/yeni";
    return (
      <EmptyState
        icon={ClipboardList}
        title="Henüz satın alma talebi yok."
        description={
          canCreate
            ? "İlk satın alma talebinizi birkaç dakikada oluşturabilirsiniz — davetlileri seçin, kalemleri girin, yayınlayın."
            : "Satın alma talebi açma işlem rolü (Satın Almacı) gerektirir."
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
    <div role="table" aria-label="Satın Alma Talebi listesi" className="space-y-2">
      {/* "Tümünü seç" şeridi KALDIRILDI (kullanıcı isteği, 2026-08-03):
          toplu sunucu işlemi yok — seçim yalnız yer kaplıyordu. */}
      {items.map((t) => (
        <IhaleListRow
          key={t.id}
          t={t}
          favorite={favorites.has(t.id)}
          onToggleFavorite={toggleFavorite}
        />
      ))}
    </div>
  );
}
