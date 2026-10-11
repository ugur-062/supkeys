"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/list";
import { ErrorState } from "@/components/ui/error-state";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { BUYING_TIER, tierAtLeast } from "@rothern/shared";
import { cn } from "@/lib/utils";
import { CircleSlash, ClipboardList, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
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
  emptyCtaLabel,
  isFiltered = false,
  onClearFilters,
  fromHref,
}: {
  items: TenderListItem[];
  /**
   * Henüz yanıt yok — çağıran sorgunun `isPending`ini verir (`isLoading` DEĞİL:
   * çevrimdışıyken sorgu duraklar, `isLoading` false kalır ve "henüz talep yok"
   * yanlışlıkla çizilirdi).
   */
  isLoading: boolean;
  /**
   * Liste HİÇ okunamadı — çağıran `isError && data === undefined` verir. Verisi
   * olan listenin arka plan yoklaması düştüğünde `false` kalmalı: satırlar
   * ekranda kalır (canlı doğrulama 2026-10-09, OUTR-5 — eskiden 15 sn'lik
   * yoklama düşünce satırlar "Veri alınamadı."ya dönüyordu).
   */
  isError: boolean;
  onRetry: () => void;
  emptyCtaLabel?: string;
  /** Arama/süzgeç etkin — boş sonuç "henüz yok" değil "eşleşen yok" (O-086). */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  /** Satır → detay dönüş adresi (süzgeç sorgusu dahil; bkz. IhaleListRow). */
  fromHref?: string;
}) {
  const tr = useTranslations("web.panel.requests.ihalelistview");
  const ctaLabel = emptyCtaLabel ?? tr("satinAlmaTalebiAc");
  const accent = useButtonAccent();
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  // Rol kontrolü paket kontrolünün İÇİNDE: Gold altına düşen firma listeyi
  // görür (mevcut işini bitirir) ama yeni talep açamaz (T-06, O-008).
  const hasCreatePermission = useHasCompanyPermission("buy:listing:manage");
  const { company } = useCompanyAuth();
  const tierAllowsCreate = tierAtLeast(company?.tier ?? "STANDART", BUYING_TIER);
  const canCreate = hasCreatePermission && tierAllowsCreate;

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
      <ErrorState
        title={tr("veriAlinamadi")}
        message={tr("birHataOlustuTekrarDeneyin")}
        onRetry={onRetry}
        retryLabel={tr("tekrarDene")}
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

  if (items.length === 0 && isFiltered) {
    // O-086: süzgeç yüzünden boş — oluşturma CTA'sı değil, tek tık temizleme.
    return (
      <EmptyState
        icon={CircleSlash}
        title={tr("eslesenTalepYok")}
        description={tr("filtreleriDegistiripTekrarDene")}
        variant="no-results"
        action={
          onClearFilters ? (
            <button
              type="button"
              onClick={onClearFilters}
              className={cn(
                "inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50",
                IHALE_VIEW_FOCUS,
              )}
            >
              {tr("filtreleriTemizle")}
            </button>
          ) : undefined
        }
      />
    );
  }

  if (items.length === 0) {
    const createHref = "/company/satinalma/taleplerim/yeni";
    return (
      <EmptyState
        icon={ClipboardList}
        title={tr("henuzSatinAlmaTalebiYok")}
        description={
          // Neden sırası API ile aynı (rol denetimi paket denetiminin İÇİNDE):
          // önce firma doğrulaması, sonra rol. Doğrulanmamış firmanın
          // Kurucusuna "Satın Almacı rolü gerekir" deniyordu — üstteki bant
          // doğrulama derken (kayıt denetimi 2026-10 resignup-8); rolü
          // verilse de doğrulamasız talep açamaz.
          canCreate
            ? tr("ilkSatinAlmaTalebiniziBirkac")
            : !tierAllowsCreate
              ? tr("yeniTalepDogrulamaGerektirir")
              : tr("satinAlmaTalebiAcmaIslem")
        }
        variant="no-data"
        action={
          canCreate ? (
            <Link
              href={createHref}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition",
                accentFillClass(accent),
                IHALE_VIEW_FOCUS,
              )}
            >
              <Plus className="size-4" aria-hidden />
              {ctaLabel}
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    /* `role="table"` KALDIRILDI (a11y 2026-09-12): sütun başlığı ve hücre yok,
       satırlar da kart; ARIA tablosu çocuk olarak `row` şart koşuyor ve KRİTİK
       ihlal veriyordu. `<section>` + ad = erişilebilir bölge, zorunlu çocuk yok. */
    <section aria-label={tr("satinAlmaTalebiListesi")} className="space-y-2">
      {/* "Tümünü seç" şeridi KALDIRILDI (kullanıcı isteği, 2026-08-03):
          toplu sunucu işlemi yok — seçim yalnız yer kaplıyordu. */}
      {items.map((t) => (
        <IhaleListRow
          key={t.id}
          t={t}
          favorite={favorites.has(t.id)}
          onToggleFavorite={toggleFavorite}
          fromHref={fromHref}
        />
      ))}
    </section>
  );
}
