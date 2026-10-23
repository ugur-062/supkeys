import { COMPANY_AREA, PORTALS, allPortalRoutes } from "@/lib/company/portals";

/**
 * ROTA → MENÜ ETİKETİ sözlüğü (breadcrumb + sayfa başlığı).
 *
 * i18n Faz 2: menü etiketleri artık KATALOG ANAHTARIDIR (`web.panel.nav.*`);
 * burası anahtarı çözer, metni çizim yerindeki `useNavLabel()` basar.
 *
 * Varlık/liste sözcükleri (eski `ENTITY_LABELS` / `LISTING_TERMS`) buradan
 * KALKTI — tek kaynak katalog (`web.domain.entity.satinalma`,
 * `web.domain.listingTerms.*`), okuma yolu `@/i18n/domain` `useEntityLabels`
 * ve `useListingTerms`.
 */

/** Rota → sidebar etiket ANAHTARI (tam eşleşme). Bulunamazsa null. */
const ROUTE_LABELS: Record<string, string> = Object.fromEntries([
  ...Object.values(PORTALS).flatMap((p) =>
    allPortalRoutes(p).map((item) => [item.href, item.label]),
  ),
  ...[...COMPANY_AREA.nav, ...COMPANY_AREA.secondaryNav].map((item) => [item.href, item.label]),
]);

export function routeLabel(href: string): string | null {
  return ROUTE_LABELS[href] ?? null;
}
