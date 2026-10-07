"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/catalyst/badge";
import { Dropdown, DropdownButton, DropdownItem, DropdownMenu } from "@/components/catalyst/dropdown";
import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
import type { ProductStatusKey } from "@/lib/company/product-status";
import { useProductStatusMeta } from "./product-status-label";
import { cn } from "@/lib/utils";
import { ArrowTopRightOnSquareIcon, EllipsisVerticalIcon } from "@heroicons/react/20/solid";

/**
 * YAPIŞKAN EYLEM ÇUBUĞU (2026-09-18): ürün adı + durum + kaydedilmemiş
 * işareti solda, portal renginde birincil eylem + ⋮ menüsü sağda. Sayfa ne
 * kadar uzun olursa olsun eylem hep görünür; panel kabuğunun üst çubuğu
 * `h-14` olduğu için `top-14`.
 */
export function ProductActionBar({
  name,
  status,
  isNew,
  dirty,
  busy,
  canManage,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  draftSave,
  unpublish,
  publicHref,
  publishLocked,
  archive,
  blockedNotice,
  blockedCount,
  onShowMissing,
}: {
  name: string;
  /** Durum KODU — etiket/renk okuyucunun dilinde `useProductStatusMeta` ile çizilir. */
  status: ProductStatusKey;
  isNew: boolean;
  dirty: boolean;
  busy: boolean;
  canManage: boolean;
  primaryLabel: string;
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
  /** Kaydı kesen eksik sayısı — "Eksikleri göster (N)" düğmesinde. */
  blockedCount?: number;
  /** "Eksikleri göster": ilk eksik alanın bölümüne kaydırır (mobilde ray sayfanın en altında). */
  onShowMissing?: () => void;
}) {
  const t = useTranslations("web.panel.trade.productActionBar");
  const statusMeta = useProductStatusMeta()(status);
  const accent = useButtonAccent();
  const hasMenu = !!draftSave || !!unpublish || !!publicHref || !!archive;
  return (
    <div className="sticky top-14 z-20 -mx-1 mb-6 rounded-2xl bg-white/95 px-4 py-3 shadow-sm ring-1 ring-zinc-950/5 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="min-w-0 max-w-full truncate text-lg font-semibold text-zinc-950">{name.trim() || (isNew ? t("yeniUrun") : t("urun"))}</h1>
            <Badge color={isNew ? "zinc" : statusMeta.color}>{isNew ? t("yeni") : statusMeta.label}</Badge>
            {dirty ? <span className="text-xs font-medium text-amber-700">{t("kaydedilmemisDegisiklik")}</span> : null}
          </div>
        </div>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={busy || primaryDisabled}
              onClick={onPrimary}
              className={cn(
                "rounded-full px-4 py-2 text-sm sm:px-5 sm:py-2.5 font-semibold text-white shadow-sm transition disabled:opacity-50",
                accentFillClass(accent),
              )}
            >
              {busy ? t("kaydediliyor") : primaryLabel}
            </button>
            {hasMenu ? (
              <Dropdown>
                <DropdownButton plain aria-label={t("digerIslemler")}>
                  <EllipsisVerticalIcon className="size-5" />
                </DropdownButton>
                <DropdownMenu anchor="bottom end">
                  {draftSave ? (
                    <DropdownItem onClick={draftSave} disabled={busy}>
                      {t("taslakOlarakKaydet")}
                    </DropdownItem>
                  ) : null}
                  {publicHref ? (
                    <DropdownItem href={publicHref} target="_blank" rel="noopener">
                      <ArrowTopRightOnSquareIcon data-slot="icon" />
                      {t("herkeseAcikSayfayiAc")}
                    </DropdownItem>
                  ) : null}
                  {unpublish ? (
                    <DropdownItem onClick={unpublish} disabled={busy}>
                      {t("vitrindenCek")}
                    </DropdownItem>
                  ) : null}
                  {archive ? (
                    <DropdownItem onClick={archive} disabled={busy}>
                      {t("arsivle")}
                    </DropdownItem>
                  ) : null}
                </DropdownMenu>
              </Dropdown>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">{t("kaydetmekIcinUrunVeVitrin")}</p>
        )}
      </div>
      {/* NOTLAR ayrı, TAM GENİŞLİK satırda (arayüz testi webC-03 yeniden doğrulama):
          eskiden başlık sütununun içindeydi; mobilde Kaydet düğmesinin yanındaki
          dar sütunda satır satır kırılıp yapışkan çubuğu ~240 px'e (ekranın
          ~%30'u) çıkarıyordu. Mobilde eksik notu KISA metin + "Eksikleri göster"
          düğmesi — ray mobilde sayfanın en altında, eksikler yakında görünmüyordu. */}
      {publishLocked || blockedNotice ? (
        <div className="mt-2 space-y-1 text-xs text-amber-800" data-testid="product-action-bar-notes">
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
                    className="font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-950"
                  >
                    {t("eksikleriGoster", { count: blockedCount ?? 0 })}
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
