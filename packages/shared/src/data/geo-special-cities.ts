import { slugifyText } from "../helpers/slug";
import { TR_PROVINCE_NAMES_I18N } from "./tr-province-names";
import { TR_PROVINCES } from "./tr-provinces";

/**
 * GeoNames DIŞI şehir kayıtları — dünya şehir listesinin (`geo_cities`) iki
 * özel parçası (2026-09-27):
 *
 *  · TÜRKİYE = 81 İL. GeoNames Türkiye'de ilçe ölçeğinde şehirler de verir
 *    (Gebze, Çorlu…); platformda Türkiye'nin şehri İL'dir (plaka/posta kodu,
 *    mevcut `/urunler/sehir/bursa` adresleri). id = -(1000 + plaka), slug =
 *    bugünkü il slug'ı (DEĞİŞMEZ — gönderilmiş bağlantılar, indeks).
 *  · KKTC (`XN`). GeoNames kuzey Kıbrıs şehirlerini "CY" altında verir; KKTC
 *    kayıtlı firmanın şehri bu listeden. id = -(2000 + sıra), slug `xn-<ad>`.
 *
 * Negatif id GeoNames id'leriyle (pozitif) çakışmaz.
 */
export interface GeoCitySeed {
  id: number;
  countryCode: string;
  name: string;
  nameTr: string;
  nameEn: string;
  nameRu: string;
  lat: number;
  lng: number;
  slug: string;
}

export const TR_PROVINCE_CITIES: readonly GeoCitySeed[] = TR_PROVINCES.map((p) => ({
  id: -(1000 + p.plate),
  countryCode: "TR",
  name: p.name,
  nameTr: p.name,
  nameEn: TR_PROVINCE_NAMES_I18N[p.name]?.en ?? p.name,
  nameRu: TR_PROVINCE_NAMES_I18N[p.name]?.ru ?? p.name,
  lat: p.lat,
  lng: p.lng,
  slug: slugifyText(p.name),
}));

const XN: [string, string, string, number, number][] = [
  ["Lefkoşa", "Nicosia (North)", "Северная Никосия", 35.1856, 33.3823],
  ["Girne", "Kyrenia", "Кирения", 35.3364, 33.3182],
  ["Gazimağusa", "Famagusta", "Фамагуста", 35.125, 33.9417],
  ["Güzelyurt", "Morphou", "Морфу", 35.1983, 32.9933],
  ["İskele", "Trikomo", "Искеле", 35.2869, 33.8914],
  ["Lefke", "Lefka", "Лефка", 35.1106, 32.8497],
];

export const XN_CITIES: readonly GeoCitySeed[] = XN.map(([tr, en, ru, lat, lng], i) => ({
  id: -(2001 + i),
  countryCode: "XN",
  name: tr,
  nameTr: tr,
  nameEn: en,
  nameRu: ru,
  lat,
  lng,
  slug: `xn-${slugifyText(tr)}`,
}));

export const SPECIAL_GEO_CITIES: readonly GeoCitySeed[] = [...TR_PROVINCE_CITIES, ...XN_CITIES];

/** Türk il adından (ya da slug'ından) şehir kaydı id'si; tanınmazsa null. */
export function trProvinceCityId(nameOrSlug: string | null | undefined): number | null {
  if (!nameOrSlug) return null;
  const s = slugifyText(nameOrSlug.trim());
  return TR_PROVINCE_CITIES.find((c) => c.slug === s)?.id ?? null;
}
