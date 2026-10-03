/**
 * TALEP DİZİNİ — "TEKLİF VEREBİLECEK TEDARİKÇİ ÜLKESİ" SEÇENEKLERİ (2026-09-27).
 *
 * `?ulke=` talep dizininde GÖRÜNÜRLÜK ülkesidir (ürün/firma dizininde satıcı
 * ülkesi — iki ayrı soru, iki ayrı etiket). Kural API facet'iyle AYNI
 * (`public-marketplace.service` `facets`): HER ülke seçilebilir ve C ülkesinin
 * sayısı = tüm ülkelere açık talepler (`openToAll`) + C'yi açıkça hedefleyen
 * talepler (`countries`). Liste yalnız açıkça hedeflenen ülkeleri (+ seçili
 * olanı) sayar; kalan her ülke aranabilir seçiciden seçilir ve `openToAll`
 * sayısını alır.
 *
 * Eskiden grup yalnız hedeflenen ülkelerden kuruluyordu: her talep tüm
 * ülkelere açıkken grup hiç çizilmiyor, Alman ziyaretçi "Almanya"yı
 * seçemiyordu.
 */
export interface ListingCountryFacetInput {
  openToAll?: number;
  countries?: { code: string; count: number }[];
}

export interface ListingCountryOption {
  code: string;
  count: number;
}

/** C ülkesindeki tedarikçinin teklif verebileceği talep sayısı. */
export function listingCountryCount(facets: ListingCountryFacetInput, code: string): number {
  const explicit = (facets.countries ?? []).find((c) => c.code === code)?.count ?? 0;
  return (facets.openToAll ?? 0) + explicit;
}

/**
 * Listede gösterilecek ülkeler: açıkça hedeflenenler + seçili olan (hedefte
 * yoksa da — çip ve sayaç "tüm ülkelere açık" talepleri göstersin). Sayıya
 * göre azalan, eşitlikte kod sırası (etiket dili değişince sıra oynamasın).
 */
export function listingCountryOptions(
  facets: ListingCountryFacetInput,
  selected?: string,
): ListingCountryOption[] {
  const codes = new Set((facets.countries ?? []).map((c) => c.code));
  if (selected) codes.add(selected);
  return [...codes]
    .map((code) => ({ code, count: listingCountryCount(facets, code) }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Grup ancak süzülecek bir talep varken çizilir. */
export function hasListingCountryFacet(facets: ListingCountryFacetInput, selected?: string): boolean {
  return !!selected || (facets.openToAll ?? 0) > 0 || (facets.countries ?? []).length > 0;
}
