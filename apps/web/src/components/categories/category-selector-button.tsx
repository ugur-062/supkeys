"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ChevronRight, Plus, Tag, X as XIcon } from "lucide-react";
import dynamic from "next/dynamic";
import type { CategoryCatalog } from "@rothern/shared";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { plainBreadcrumb } from "./category-breadcrumb";
import { LoadError } from "./category-load-error";

// Performans audit P-4 — Modal 808 satır, kullanıcı açana kadar bundle'a
// girmesin. dynamic + ssr:false ile route'un First Load JS'i ~30KB azalır.
const CategorySelectorModal = dynamic(
  () => import("./category-selector-modal").then((m) => m.CategorySelectorModal),
  { ssr: false },
);

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  mode?: "single" | "multi";
  maxSelection?: number;
  placeholder?: string;
  error?: string;
  modalTitle?: string;
  modalDescription?: string;
  disabled?: boolean;
  /**
   * Hangi Ariba kataloğu: talep/ilan formlarında `"discovery"`, firma
   * kategori seçiminde `"full"` (varsayılan). Modal'a geçer; asıl kapı
   * backend'de (`company-listings.service.ts`).
   */
  catalog?: CategoryCatalog;
}

/**
 * V2-6 — Form alanı kategori seçici. Boşken dashed CTA; doluyken chip listesi
 * + "Değiştir" linki. Modal'ı tetikler. value/onChange controlled state.
 */
export function CategorySelectorButton({
  value,
  onChange,
  mode = "multi",
  maxSelection = 20,
  placeholder,
  error,
  modalTitle,
  modalDescription,
  disabled,
  catalog = "full",
}: Props) {
  const t = useTranslations("web.shared.categorySelectorButton");
  // Ad hatası metni pencereyle ortak (aynı durum, aynı cümle).
  const tm = useTranslations("web.shared.categorySelectorModal");
  const [isOpen, setIsOpen] = useState(false);
  const {
    data: selectedCategories,
    isError: namesError,
    isFetching: namesFetching,
    refetch: refetchNames,
  } = useCategoriesByIds(value, { inlineError: true });
  // Yeniden deneme yoldayken hata sayılmaz (çip "…" gösterir).
  const namesFailed = !!namesError && !namesFetching;

  const defaultPlaceholder =
    mode === "single"
      ? t("satinAlmaTalebiKategorisiniSecin")
      : t("tedarikKategorileriniziSecin");

  return (
    <>
      <div>
        {value.length === 0 ? (
          <button
            type="button"
            onClick={() => !disabled && setIsOpen(true)}
            disabled={disabled}
            className={`flex w-full items-center justify-between rounded-lg border-2 border-dashed px-4 py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
              error
                ? "border-rose-300 bg-rose-50 hover:bg-rose-100"
                : "border-slate-300 bg-white hover:border-zinc-400 hover:bg-zinc-50/30"
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  error ? "bg-rose-100" : "bg-slate-100"
                }`}
              >
                <Tag
                  className={`h-4 w-4 ${
                    error ? "text-rose-600" : "text-slate-500"
                  }`}
                />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-zinc-900">
                  {placeholder ?? defaultPlaceholder}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {mode === "single"
                    ? t("tekKategoriSecin")
                    : t("enFazlaKategoriSecebilirsiniz", { maxSelection: maxSelection })}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-zinc-500" />
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {value.map((id) => {
                const cat = selectedCategories?.find((c) => c.id === id);
                // Ad isteği düştüyse "…" kalıcı kalmasın — kod gösterilir.
                const label = cat?.nameTr ?? (namesFailed ? id : "…");
                // Baştaki segment harfi ("P. ") iç koddur, gösterilmez.
                const breadcrumb = plainBreadcrumb(cat?.breadcrumb);
                return (
                  <div
                    key={id}
                    className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700"
                    title={breadcrumb || undefined}
                  >
                    <Tag className="h-3 w-3 shrink-0" />
                    {/* Adın tamamı: sabit piksel tavanı yok, uzun ad sarılır. */}
                    <span className="min-w-0 break-words">{label}</span>
                    {!disabled ? (
                      // Dokunma hedefi 32 px; eksi kenar boşluğu çipi büyütmez.
                      <button
                        type="button"
                        onClick={() => onChange(value.filter((x) => x !== id))}
                        className="-my-2 -mr-2 -ml-2 inline-flex size-8 shrink-0 items-center justify-center rounded hover:text-rose-600"
                        aria-label={t("kategorisiniKaldir", { label: cat?.nameTr ?? id })}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {namesFailed ? (
              <LoadError
                compact
                message={tm("secimAdlariYuklenemedi")}
                retryLabel={tm("yenidenDene")}
                onRetry={() => void refetchNames?.()}
              />
            ) : null}
            {!disabled ? (
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-700"
              >
                <Plus className="h-4 w-4" />
                {mode === "single"
                  ? t("degistir")
                  : t("kategoriEkleDuzenle")}
              </button>
            ) : null}
          </div>
        )}

        {error ? (
          <p className="mt-1.5 text-xs text-rose-600">{error}</p>
        ) : null}
      </div>

      {/*
        Denetim 2026-08-26 Parça 10: modal KOŞULSUZ render ediliyordu. `isOpen`
        yalnız Headless Dialog'u kapalı tutuyor, bileşen gövdesi yine koşuyor →
        `useCategoryTree()` (enabled kapısı yok) `/categories/all` çağrısını,
        kullanıcı kategoriye hiç dokunmasa bile yapıyordu.
        `next/dynamic` de parçayı render anında indiriyordu.
      */}
      {isOpen ? (
        <CategorySelectorModal
          isOpen={isOpen}
          onClose={() => setIsOpen(false)}
          value={value}
          onConfirm={onChange}
          mode={mode}
          maxSelection={maxSelection}
          title={modalTitle ?? t("kategoriSec")}
          description={modalDescription}
          catalog={catalog}
        />
      ) : null}
    </>
  );
}
