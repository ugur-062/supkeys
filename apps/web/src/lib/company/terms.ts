import { PORTALS } from "@/lib/company/portals";

/**
 * P2 (frontend denetimi §8.3) — terminoloji TEK kaynak. "İlan" kelimesi
 * üründen kaldırıldı: satış tarafı "satış ihalesi", alış tarafı "alış
 * ihalesi". Rota→etiket sözlüğü sidebar nav'ından (PORTALS) türetilir —
 * sayfa başlığı, breadcrumb ve geri linki aynı adı kullanır; "Satışlarım /
 * ← Siparişler" tarzı kaymalar buradan kapanır.
 */
export const TERMS = {
  TENDER_SELL: "satış ihalesi",
  TENDER_BUY: "alış ihalesi",
} as const;

/** Rota → sidebar etiketi (tam eşleşme). Bulunamazsa null. */
const ROUTE_LABELS: Record<string, string> = Object.fromEntries(
  Object.values(PORTALS).flatMap((p) =>
    p.nav.map((item) => [item.href, item.label]),
  ),
);

export function routeLabel(href: string): string | null {
  return ROUTE_LABELS[href] ?? null;
}
