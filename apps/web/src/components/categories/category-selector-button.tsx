"use client";

import { useState } from "react";
import { ChevronRight, Plus, Tag, X as XIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useCategoriesByIds } from "@/hooks/use-categories";

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
  modalTitle = "Kategori Seç",
  modalDescription,
  disabled,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: selectedCategories } = useCategoriesByIds(value);

  const defaultPlaceholder =
    mode === "single"
      ? "Satın Alma Talebi kategorisini seçin"
      : "Tedarik kategorilerinizi seçin";

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
                    ? "Tek kategori seçin"
                    : `En fazla ${maxSelection} kategori seçebilirsiniz`}
                </p>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-slate-400" />
          </button>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              {value.map((id) => {
                const cat = selectedCategories?.find((c) => c.id === id);
                const label = cat?.nameTr ?? "…";
                const breadcrumb = cat?.breadcrumb ?? "";
                return (
                  <div
                    key={id}
                    className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-semibold text-zinc-700"
                    title={breadcrumb}
                  >
                    <Tag className="h-3 w-3" />
                    <span className="max-w-[220px] truncate">{label}</span>
                    {!disabled ? (
                      <button
                        type="button"
                        onClick={() => onChange(value.filter((x) => x !== id))}
                        className="ml-1 rounded hover:text-rose-600"
                        aria-label={`${label} kategorisini kaldır`}
                      >
                        <XIcon className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
            {!disabled ? (
              <button
                type="button"
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-1 text-sm font-semibold text-zinc-600 hover:text-zinc-700"
              >
                <Plus className="h-4 w-4" />
                {mode === "single"
                  ? "Değiştir"
                  : "Kategori Ekle / Düzenle"}
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
        `useCategoryTree()` (enabled kapısı yok) ~180 KB'lık `/categories/all`
        çağrısını, kullanıcı kategoriye hiç dokunmasa bile yapıyordu.
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
          title={modalTitle}
          description={modalDescription}
        />
      ) : null}
    </>
  );
}
