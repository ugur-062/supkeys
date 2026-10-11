import { foldSearchText } from "./search-fold";
import { trProvinceCityId } from "../data/geo-special-cities";

/**
 * SERBEST METİN ŞEHİR → ŞEHİR KAYDI (2026-09-27, dünya şehir listesi).
 *
 * Tek kural, iki yerde: API yazma yolu (istemci `cityId` göndermediyse ya da
 * eski istemci) ve `backfill-city-ids` betiği. Türkiye'de il adı doğrudan
 * (`trProvinceCityId`); diğer ülkelerde aynı ülkenin adaylarından TAM ad
 * eşleşmesi (herhangi bir dildeki ad ya da yerel yazım: "München" = "Munich"
 * = "Münih"), yoksa en kalabalık aday — ama yalnız girdi en az 4 harfse
 * (kısa girdide yanlış eşleme şehir sayfasını kirletir).
 */
export interface GeoCityCandidate {
  id: number;
  name: string;
  nameTr: string | null;
  nameEn: string | null;
  nameRu: string | null;
  searchText: string;
  population: number;
}

export function pickGeoCity(
  country: string | null | undefined,
  cityText: string | null | undefined,
  candidates: readonly GeoCityCandidate[],
): number | null {
  const text = (cityText ?? "").trim();
  if (!text) return null;
  const cc = (country ?? "TR").toUpperCase();
  if (cc === "TR") return trProvinceCityId(text);
  const q = foldSearchText(text);
  if (!q) return null;
  const exact = candidates.find((c) =>
    [c.name, c.nameTr, c.nameEn, c.nameRu].some((n) => n && foldSearchText(n) === q),
  );
  if (exact) return exact.id;
  // Yerel yazım/diğer adlar arama metninde tam sözcük olarak.
  const word = new RegExp(`(^|\\s)${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\s|$)`);
  const byWord = [...candidates].filter((c) => word.test(c.searchText)).sort((a, b) => b.population - a.population);
  if (byWord[0]) return byWord[0].id;
  return null;
}
