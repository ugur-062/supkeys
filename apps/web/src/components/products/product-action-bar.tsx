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
}) {
  const t = useTranslations("web.panel.trade.productActionBar");
  const statusMeta = useProductStatusMeta()(status);
  const accent = useButtonAccent();
  const hasMenu = !!draftSave || !!unpublish || !!publicHref;
  return (
    <div className="sticky top-14 z-20 -mx-1 mb-6 rounded-2xl bg-white/95 px-4 py-3 shadow-sm ring-1 ring-zinc-950/5 backdrop-blur supports-[backdrop-filter]:bg-white/85">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-lg font-semibold text-zinc-950">{name.trim() || (isNew ? t("yeniUrun") : t("urun"))}</h1>
            <Badge color={isNew ? "zinc" : statusMeta.color}>{isNew ? t("yeni") : statusMeta.label}</Badge>
            {dirty ? <span className="text-xs font-medium text-amber-700">{t("kaydedilmemisDegisiklik")}</span> : null}
          </div>
          {publishLocked ? (
            <p className="mt-0.5 text-xs text-amber-800">
              {t("ucretsizPaketteYayindaOnaydaUrun")}
            </p>
          ) : null}
        </div>
        {canManage ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={busy || primaryDisabled}
              onClick={onPrimary}
              className={cn(
                "rounded-full px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-50",
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
                </DropdownMenu>
              </Dropdown>
            ) : null}
          </div>
        ) : (
          <p className="text-xs text-zinc-500">{t("kaydetmekIcinUrunVeVitrin")}</p>
        )}
      </div>
    </div>
  );
}
