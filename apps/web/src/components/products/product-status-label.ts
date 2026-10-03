"use client";

import { useTranslations } from "next-intl";
import { PRODUCT_STATUS, type ProductStatusKey } from "@/lib/company/product-status";

/**
 * ÜRÜN DURUM SÖZLÜĞÜ — okuyucunun dilinde (i18n Faz 2).
 *
 * Durum KODU ve rengi `lib/company/product-status.ts`ten (tek kaynak, Türkçe
 * etiketleri orada duruyor); metin katalogdan gelir
 * (`web.panel.trade.productStatusLabel.status.<KOD>.{label,description}`).
 * Ürünlerim listesi/sekmeleri, önizleme bandı ve eylem çubuğu AYNI hook'u
 * çizer — üç yüzey aynı sözcükleri kullansın (moderasyon 2026-09-09 kuralı).
 */
export interface ProductStatusView {
  key: ProductStatusKey;
  label: string;
  description: string;
  color: (typeof PRODUCT_STATUS)[ProductStatusKey]["color"];
}

export function useProductStatusMeta(): (key: ProductStatusKey) => ProductStatusView {
  const t = useTranslations("web.panel.trade.productStatusLabel");
  return (key) => ({
    key,
    label: t(`status.${key}.label`),
    description: t(`status.${key}.description`),
    color: PRODUCT_STATUS[key].color,
  });
}
