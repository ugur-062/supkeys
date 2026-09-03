import { PORTALS, allPortalRoutes } from "@/lib/company/portals";

/**
 * P2 (frontend denetimi §8.3) — terminoloji TEK kaynak. "İlan" kelimesi
 * üründen kaldırıldı: satış tarafı "satış satın alma talebi", alış tarafı "alış
 * ihalesi". Rota→etiket sözlüğü sidebar nav'ından (PORTALS) türetilir —
 * sayfa başlığı, breadcrumb ve geri linki aynı adı kullanır; "Satışlarım /
 * ← Siparişler" tarzı kaymalar buradan kapanır.
 */
export const TERMS = {
  // Satış tarafında kayıt "ilan"dır (orada firma SATAR); alış tarafında
  // "talep". 2026-09-01 yeniden adlandırmasında "ihale"→"satın alma talebi"
  // toptan değiştirildiği için burada "satış satın alma talebi" / "alış satın
  // alma talebi" gibi kendini tekrar eden ibareler kalmıştı.
  TENDER_SELL: "satış ilanı",
  TENDER_BUY: "alım talebi",
} as const;

/** Rota → sidebar etiketi (tam eşleşme). Bulunamazsa null. */
const ROUTE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(PORTALS).flatMap((p) =>
    allPortalRoutes(p).map((item) => [item.href, item.label]),
  ),
);

export function routeLabel(href: string): string | null {
  return ROUTE_LABELS[href] ?? null;
}
