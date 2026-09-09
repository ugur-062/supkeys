import type { ProductReviewStatus } from "@/hooks/use-company-items";

/**
 * ÜRÜN DURUM SÖZLÜĞÜ — liste rozeti, form durum kartı ve sekme adları AYNI
 * sözcükleri kullanır (moderasyon 2026-09-09). Dört durum + bir ara hâl:
 * yayındaki ürünün içerik düzenlemesi PENDING'e düşer ama vitrinde kalır →
 * "Yayında · incelemede". PENDING = İNCELEME KİLİDİ (2026-09-10): firma
 * yalnız önizler; tek çıkış admin kararı (onay ya da "Düzeltme istendi").
 */
export type ProductStatusKey = "draft" | "pending" | "published" | "published_pending" | "rejected";

export function productStatusKey(p: { reviewStatus: ProductReviewStatus; isPublic: boolean }): ProductStatusKey {
  if (p.reviewStatus === "PENDING") return p.isPublic ? "published_pending" : "pending";
  if (p.reviewStatus === "REJECTED") return "rejected";
  if (p.isPublic) return "published";
  return "draft";
}

export const PRODUCT_STATUS: Record<
  ProductStatusKey,
  { label: string; color: "zinc" | "amber" | "emerald" | "red" | "blue"; description: string }
> = {
  draft: {
    label: "Taslak",
    color: "zinc",
    description: "Yalnız siz görüyorsunuz. Onaya gönderdiğinizde ekibimiz inceler.",
  },
  pending: {
    label: "Onay bekliyor",
    color: "amber",
    description:
      "Ekibimiz inceliyor — genellikle 1 iş günü içinde. İnceleme bitene kadar ürün değiştirilemez, yalnız önizlenir; onaylanınca vitrine çıkar, düzeltme gerekirse gerekçesiyle size geri gelir.",
  },
  published: {
    label: "Yayında",
    color: "emerald",
    description: "Vitrinde ve arama motorlarına açık. İçerik değişikliği yeniden incelemeye girer; ürün bu sırada yayında kalır.",
  },
  published_pending: {
    label: "Yayında · incelemede",
    color: "blue",
    description: "Son değişikliğiniz inceleniyor; ürün bu sırada vitrinde kalıyor. İnceleme bitene kadar yeni değişiklik yapılamaz.",
  },
  rejected: {
    label: "Düzeltme istendi",
    color: "red",
    description: "Ekibimiz düzeltme istedi. Gerekçedeki değişikliği yapıp yeniden onaya gönderin.",
  },
};
