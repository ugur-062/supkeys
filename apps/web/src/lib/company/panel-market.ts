import { slugifyText } from "@rothern/shared";
import { parseCategoryCode } from "@/lib/public/marketplace";

/**
 * PANEL PAZAR BÖLGESİ — rota ve sözcük TEK KAYNAĞI (2026-09-07).
 *
 * Satınalma paneli iki bölgeye ayrıldı: solda uygulama menüsü ve panel
 * sayfaları ("araç" dili), sağda pazar ("katalog" dili). Pazar bölgesinin
 * her keşif durumunun kendi adresi var — eskiden ürün ızgarası anasayfaya
 * gömülüydü ve kategori kartı yalnız sayfayı kaydırıyordu: filtrelenmiş bir
 * listenin bağlantısı paylaşılamıyor, tarayıcı geri tuşu bir önceki
 * süzgece dönmüyordu.
 *
 * Adres şeması herkese açık pazar yeriyle BİREBİR aynı biçimde kurulur
 * (`/urunler`, `/firmalar`, `/urunler/kategori/<kod>-<ad>`) — iki yüzeyin
 * ayrışması, üyeyle ziyaretçinin farklı bir dünya görmesi demektir.
 */
export const PANEL_MARKET = {
  /** Satınalma panelinin anasayfası — pazar GİRİŞİ (ızgara yok). */
  home: "/company/satinalma",
  /** Ürün dizini (kenar süzgeçli tam liste). */
  products: "/company/satinalma/urunler",
  /** Firma dizini — pazar tarafı. İlişki yönetimi Bağlantılar'da kalır. */
  companies: "/company/satinalma/firmalar",
  /** Kategori sayfası kökü. */
  category: "/company/satinalma/kategori",
  /** İlişki yönetimi (bağlantılarım, istekler) — pazar DEĞİL. */
  connections: "/company/satinalma/tedarikcilerim",
} as const;

/**
 * SATIŞ PORTALININ pazar adresleri (2026-09-10, kullanıcı isteği): firma
 * dizini satışta da var — satış paneli "kime satabilirim"i de arar. Ürün
 * dizini/kategori sayfası satışta YOK (onlar alıcının işi).
 */
export const SELLER_MARKET = {
  home: "/company/satis",
  companies: "/company/satis/firmalar",
} as const;

/**
 * Portala göre firma dizini adresi. Bağlantılar › Keşfet "Tüm firmaları ara"
 * eskiden her iki portaldan da satınalma dizinine gidiyordu; satınalmaya
 * erişimi olmayan (yalnız satış koltuklu) kullanıcı PortalGuard'a takılıyordu.
 */
export function marketCompaniesPath(portal: "satinalma" | "satis"): string {
  return portal === "satis" ? SELLER_MARKET.companies : PANEL_MARKET.companies;
}

/** Panel içi ürün detayı — firma ve ürün slug'ı altında (adres değişmedi). */
export function panelProductPath(companySlug: string, productSlug: string): string {
  return `${PANEL_MARKET.products}/${encodeURIComponent(companySlug)}/${encodeURIComponent(productSlug)}`;
}

/**
 * Kategori sayfası — KOD ÖNDE (`<kod>-<ad>`). Ad sonda olsaydı ayrıştırma
 * "…-39000000" ile biten bir kategori adında sessizce yanlış kodu verirdi;
 * kod önde tek regex'e iner. Herkese açık kategori sayfasıyla aynı kural.
 */
export function panelCategoryPath(code: string, name?: string): string {
  const tail = name ? slugifyText(name) : "";
  return `${PANEL_MARKET.category}/${tail ? `${code}-${tail}` : code}`;
}

/** Yol parçasından kategori kodu (public ile aynı ayrıştırıcı). */
export const parsePanelCategoryCode = parseCategoryCode;

/** Firma profili — panelde Rothern ID ile açılır (üyeye kimlik açık). */
export function panelCompanyPath(ref: string): string {
  return `/company/firma/${encodeURIComponent(ref)}`;
}
