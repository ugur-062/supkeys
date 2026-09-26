import type { ProductReviewStatus } from "@/hooks/use-company-items";

/**
 * ÜRÜN DURUM SÖZLÜĞÜ — liste rozeti, form durum kartı ve sekme adları AYNI
 * sözcükleri kullanır (moderasyon 2026-09-09). Dört durum + bir ara hâl:
 * yayındaki ürünün içerik düzenlemesi PENDING'e düşer ama vitrinde kalır →
 * "Yayında · incelemede". PENDING = İNCELEME KİLİDİ (2026-09-10): firma
 * yalnız önizler; tek çıkış admin kararı (onay ya da "Düzeltme istendi").
 *
 * i18n Faz 2: DURUM KODU ve RENGİ burada, METİN katalogda
 * (`web.panel.trade.productStatusLabel.status.<KOD>.{label,description}`) —
 * çizim `components/products/product-status-label.ts` `useProductStatusMeta`.
 */
export type ProductStatusKey = "draft" | "pending" | "published" | "published_pending" | "rejected";

export function productStatusKey(p: { reviewStatus: ProductReviewStatus; isPublic: boolean }): ProductStatusKey {
  if (p.reviewStatus === "PENDING") return p.isPublic ? "published_pending" : "pending";
  if (p.reviewStatus === "REJECTED") return "rejected";
  if (p.isPublic) return "published";
  return "draft";
}

/** Durum → rozet rengi (etiket/açıklama katalogdan). */
export const PRODUCT_STATUS: Record<
  ProductStatusKey,
  { color: "zinc" | "amber" | "emerald" | "red" | "blue" }
> = {
  draft: { color: "zinc" },
  pending: { color: "amber" },
  published: { color: "emerald" },
  published_pending: { color: "blue" },
  rejected: { color: "red" },
};
