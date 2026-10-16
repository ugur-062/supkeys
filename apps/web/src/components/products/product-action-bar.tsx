"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/catalyst/badge";
import { Dropdown, DropdownButton, DropdownItem, DropdownLabel, DropdownMenu } from "@/components/catalyst/dropdown";
import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
import type { ProductStatusKey } from "@/lib/company/product-status";
import { useProductStatusMeta } from "./product-status-label";
import { cn } from "@/lib/utils";
import { ArrowTopRightOnSquareIcon, EllipsisVerticalIcon, ExclamationTriangleIcon } from "@heroicons/react/20/solid";

/**
 * YAPIŞKAN EYLEM ÇUBUĞU (2026-09-18): ürün adı + durum + kaydedilmemiş
 * işareti solda, portal renginde birincil eylem + ⋮ menüsü sağda. Sayfa ne
 * kadar uzun olursa olsun eylem hep görünür; ofset panel kabuğunun üst
 * çubuğu kadar: `top-(--topbar-h)` (56 px + güvenli alanın üst payı).
 *
 * TELEFON DÜZENİ (mobil denetim g09, 2026-10-15): sm altında çubuk İKİ kutuya
 * ayrılır — ad + durum + kaydedilmemiş işareti akışta duran kartta (sayfayla
 * kayar), yalnız EYLEM ŞERİDİ (eksikler çipi + birincil düğme + ⋮) yapışkan
 * kalır; eksik notu şeridin ALTINDA akışta durur. Eskiden tek yapışkan kartta
 * `shrink-0` birincil düğme ad sütununu 22 px'e indiriyor ("Q..") ve durum
 * rozetinin üstüne biniyordu; not satırıyla kart 116–140 px'e çıkıp klavye
 * açıkken formun yarısını örtüyordu. Kök ve satır telefonda `contents`: şerit
 * DOM'da aynı yerde kalır ama yapışkanlığı formun tamamına göre çalışır
 * (yapışkan öğe yalnız ebeveyninin kutusu içinde yapışır). sm ve üstü tek
 * kart, eskisi gibi; ad sütununun gerçek bir tabanı var (`flex-[1_1_12rem]`),
 * sığmayınca eylemler alt satıra kayar, adı ezmez.
 */
export function ProductActionBar({
  name,
  status,
  isNew,
  dirty,
  busy,
  canManage,
  primaryLabel,
  primaryShortLabel,
  onPrimary,
  primaryDisabled,
  draftSave,
  unpublish,
  publicHref,
  publishLocked,
  archive,
  blockedNotice,
  missingCount,
  onShowMissing,
  onHeightChange,
}: {
  name: string;
  /** Durum KODU — etiket/renk okuyucunun dilinde `useProductStatusMeta` ile çizilir. */
  status: ProductStatusKey;
  isNew: boolean;
  dirty: boolean;
  busy: boolean;
  canManage: boolean;
  primaryLabel: string;
  /**
   * Telefondaki kısa düğme metni ("Düzelt ve yeniden gönder" → "Yeniden
   * gönder"): uzun metin dar şeritte eksikler çipiyle sığmıyordu. Erişilebilir
   * ad her zaman tam metin (kısa metin onun parçası — görünen ad, adın içinde).
   */
  primaryShortLabel?: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  /** Taslak/düzeltme durumunda "Taslak olarak kaydet" menü satırı. */
  draftSave?: () => void;
  /** Yayındaki üründe "Vitrinden çek". */
  unpublish?: () => void;
  publicHref?: string | null;
  publishLocked?: boolean;
  /** "Arşivle" menü satırı (arayüz testi O-039); incelemedeki üründe verilmez. */
  archive?: () => void;
  /** Yayındaki ürün eksik içerikle kaydedilemez — birincil düğme kapalıyken neden (O-009). */
  blockedNotice?: boolean;
  /**
   * Onaya göndermeyi / kaydı kesen eksik sayısı. lg altında ray sayfanın en
   * altında kaldığı için çubukta "Eksikler (N)" çipi çizilir — taslakta da
   * (mobil denetim g09: taslak eksiklerini ancak "Onaya gönder"in hata
   * toast'ından öğreniyordu).
   */
  missingCount?: number;
  /** İlk eksik alanın bölümüne kaydırır (çip ve notun "Eksikleri göster" düğmesi). */
  onShowMissing?: () => void;
  /**
   * Yapışkan çubuğun GERÇEK yüksekliği (px) — değiştikçe bildirilir. Çubuk
   * notlarla ya da sarılan eylemlerle 64 px'ten 80–88 px'e çıkınca altındaki
   * yapışkan ray sabit `7.5rem` ofsetle çubuğun ALTINDA kalıyordu (masaüstü,
   * mobil denetim g09 doğrulama turu); form bu değeri rayın ofsetine yazar.
   * Kutusu olmayan (telefonda `contents`) çubuk bildirilmez.
   */
  onHeightChange?: (px: number) => void;
}) {
  const t = useTranslations("web.panel.trade.productActionBar");
  const statusMeta = useProductStatusMeta()(status);
  const accent = useButtonAccent();
  const hasMenu = !!draftSave || !!unpublish || !!publicHref || !!archive;
  const hasNotes = !!publishLocked || !!blockedNotice;
  const showMissing = !!onShowMissing && (missingCount ?? 0) > 0;
  const shortLabel = primaryShortLabel && primaryShortLabel !== primaryLabel ? primaryShortLabel : null;
  // Telefonda kök kutusuz (`contents`): alt boşluğu akıştaki SON parça verir.
  const phoneGap = hasNotes ? "max-sm:mb-2" : "max-sm:mb-6";
  const rootRef = useRef<HTMLDivElement>(null);
  const heightCb = useRef(onHeightChange);
  heightCb.current = onHeightChange;
  const reportsHeight = !!onHeightChange;
  useEffect(() => {
    const el = rootRef.current;
    if (!el || !reportsHeight) return;
    let last = -1;
    const report = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h <= 0 || h === last) return;
      last = h;
      heightCb.current?.(h);
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [reportsHeight]);
  return (
    <div
      ref={rootRef}
      className="max-sm:contents sm:sticky sm:top-(--topbar-h) sm:z-20 sm:-mx-1 sm:mb-6 sm:rounded-2xl sm:bg-white/95 sm:px-4 sm:py-3 sm:shadow-sm sm:ring-1 sm:ring-zinc-950/5 sm:backdrop-blur sm:supports-[backdrop-filter]:bg-white/85">
      <div className="max-sm:contents sm:flex sm:flex-wrap sm:items-center sm:gap-x-4 sm:gap-y-2">
        <div
          data-testid="product-action-bar-title"
          className="min-w-0 max-sm:-mx-1 max-sm:mb-3 max-sm:rounded-2xl max-sm:bg-white max-sm:px-4 max-sm:py-3 max-sm:shadow-sm max-sm:ring-1 max-sm:ring-zinc-950/5 sm:flex-[1_1_12rem]"
        >
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {/* Telefonda ad iki satıra kadar SARAR (benzer ürünler sonda ayrışır); sm'den itibaren tek satır. */}
            <h1 className="min-w-0 max-w-full text-lg font-semibold text-zinc-950 max-sm:line-clamp-2 max-sm:break-words sm:truncate">
              {name.trim() || (isNew ? t("yeniUrun") : t("urun"))}
            </h1>
            <Badge color={isNew ? "zinc" : statusMeta.color}>{isNew ? t("yeni") : statusMeta.label}</Badge>
            {dirty ? <span className="text-xs font-medium text-amber-700">{t("kaydedilmemisDegisiklik")}</span> : null}
          </div>
        </div>
        {canManage ? (
          <div
            data-testid="product-action-bar-actions"
            className={cn(
              "flex items-center gap-2 sm:ml-auto sm:shrink-0",
              // Telefon: yapışkan tek satırlık şerit (uzun dilde sarar, sayfayı taşırmaz).
              "max-sm:sticky max-sm:top-(--topbar-h) max-sm:z-20 max-sm:-mx-1 max-sm:flex-wrap max-sm:justify-end max-sm:rounded-2xl max-sm:bg-white/95 max-sm:px-2.5 max-sm:py-2 max-sm:shadow-sm max-sm:ring-1 max-sm:ring-zinc-950/5 max-sm:backdrop-blur max-sm:supports-[backdrop-filter]:bg-white/85",
              phoneGap,
            )}
          >
            {showMissing ? (
              // lg'de ray formun yanında görünür (kendi çipleriyle) — çip yalnız altında.
              <button
                type="button"
                onClick={onShowMissing}
                className="relative mr-auto inline-flex min-h-8 items-center gap-1 rounded-full bg-amber-50 px-2.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-600/20 ring-inset after:absolute after:inset-x-0 after:-inset-y-1 hover:bg-amber-100 sm:mr-0 lg:hidden"
              >
                <ExclamationTriangleIcon aria-hidden className="size-3.5 shrink-0" />
                {t("eksikler", { count: missingCount ?? 0 })}
              </button>
            ) : null}
            <button
              type="button"
              disabled={busy || primaryDisabled}
              onClick={onPrimary}
              aria-label={!busy && shortLabel ? primaryLabel : undefined}
              className={cn(
                "relative inline-flex min-h-10 items-center justify-center rounded-full px-4 py-2 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50 sm:min-h-0 sm:px-5 sm:py-2.5",
                accentFillClass(accent),
              )}
            >
              {busy ? (
                t("kaydediliyor")
              ) : shortLabel ? (
                <>
                  <span className="sm:hidden">{shortLabel}</span>
                  <span className="hidden sm:inline">{primaryLabel}</span>
                </>
              ) : (
                primaryLabel
              )}
              {/* Telefonda "kaydedilmemiş" yazısı kayan kartta kalır; yapışkan şeritte nokta (yazı kartta okunur). */}
              {dirty && !busy ? (
                <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-white sm:hidden" />
              ) : null}
            </button>
            {hasMenu ? (
              <Dropdown>
                <DropdownButton plain aria-label={t("digerIslemler")}>
                  <EllipsisVerticalIcon className="size-5" />
                </DropdownButton>
                {/* Etiketler `DropdownLabel` içinde (Catalyst ızgarası: ikon 1., etiket 2. sütun) —
                    düz metin ikon sütununa düşüp menüyü 349 px'e genişletiyor, ikonlu satırın
                    etiketini ~100 px sağa itiyordu (mobil denetim g09). */}
                <DropdownMenu anchor="bottom end" className="max-w-[calc(100vw-2rem)]">
                  {draftSave ? (
                    <DropdownItem onClick={draftSave} disabled={busy}>
                      <DropdownLabel>{t("taslakOlarakKaydet")}</DropdownLabel>
                    </DropdownItem>
                  ) : null}
                  {publicHref ? (
                    <DropdownItem href={publicHref} target="_blank" rel="noopener">
                      <ArrowTopRightOnSquareIcon data-slot="icon" />
                      <DropdownLabel>{t("herkeseAcikSayfayiAc")}</DropdownLabel>
                    </DropdownItem>
                  ) : null}
                  {unpublish ? (
                    <DropdownItem onClick={unpublish} disabled={busy}>
                      <DropdownLabel>{t("vitrindenCek")}</DropdownLabel>
                    </DropdownItem>
                  ) : null}
                  {archive ? (
                    <DropdownItem onClick={archive} disabled={busy}>
                      <DropdownLabel>{t("arsivle")}</DropdownLabel>
                    </DropdownItem>
                  ) : null}
                </DropdownMenu>
              </Dropdown>
            ) : null}
          </div>
        ) : (
          <p className={cn("text-xs text-zinc-500 max-sm:px-1", phoneGap)}>{t("kaydetmekIcinUrunVeVitrin")}</p>
        )}
      </div>
      {/* NOTLAR ayrı, TAM GENİŞLİK satırda (arayüz testi webC-03 yeniden doğrulama):
          eskiden başlık sütununun içindeydi; mobilde Kaydet düğmesinin yanındaki
          dar sütunda satır satır kırılıp yapışkan çubuğu ~240 px'e (ekranın
          ~%30'u) çıkarıyordu. Telefonda not yapışkan şeridin ALTINDA, akışta
          (mobil denetim g09); "Eksikleri göster" lg altında şeritteki çipte. */}
      {hasNotes ? (
        <div className="mt-2 space-y-1 text-xs text-amber-800 max-sm:mt-0 max-sm:mb-6 max-sm:px-1" data-testid="product-action-bar-notes">
          {publishLocked ? <p>{t("yayindaOnaydaUrunTavaniDoldu")}</p> : null}
          {blockedNotice ? (
            <p>
              <span className="sm:hidden">{t("yayindakiUrunEksikKisa")}</span>
              <span className="hidden sm:inline">{t("yayindakiUrunEksik")}</span>
              {onShowMissing ? (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={onShowMissing}
                    className="hidden font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950 lg:inline"
                  >
                    {t("eksikleriGoster", { count: missingCount ?? 0 })}
                  </button>
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
