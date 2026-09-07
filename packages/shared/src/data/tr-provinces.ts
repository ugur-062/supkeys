/**
 * TÜRKİYE İLLERİ — plaka kodu, ad ve İL MERKEZİ koordinatı (2026-09-07).
 *
 * NEDEN VAR: ürün dizinindeki "Yakınımda" süzgeci. Şemada enlem/boylam YOK
 * ve `Company.city` serbest metin bir il adı; koordinatı firmadan değil
 * İLİNDEN türetiyoruz. Bu KAMUYA AÇIK COĞRAFİ OLGU — uydurulmuş veri değil,
 * migration da gerektirmiyor.
 *
 * GRANÜLERLİK İL DÜZEYİNDE ve bu bilinçli bir sınır: "İstanbul'daki bir
 * firma" ile "İstanbul'un merkezi" aynı noktadır, dolayısıyla 10 km gibi bir
 * yarıçap "aynı il" demeye denk gelirdi — o yüzden en küçük seçenek 25 km
 * (bkz. `RADIUS_OPTIONS`) ve arayüz bunu açıkça yazar. Adres düzeyinde
 * geocode istenirse ayrı bir iştir.
 *
 * POSTA KODU: TR posta kodları 5 hanedir ve İLK İKİ HANE plaka kodudur.
 * "34110" → 34 → İstanbul. Bu da bir olgu, tablo gerektirmez.
 */
export interface TrProvince {
  /** Plaka kodu = posta kodunun ilk iki hanesi. */
  plate: number;
  name: string;
  lat: number;
  lng: number;
}

export const TR_PROVINCES: readonly TrProvince[] = [
  { plate: 1, name: "Adana", lat: 37.0, lng: 35.32 },
  { plate: 2, name: "Adıyaman", lat: 37.76, lng: 38.28 },
  { plate: 3, name: "Afyonkarahisar", lat: 38.76, lng: 30.54 },
  { plate: 4, name: "Ağrı", lat: 39.72, lng: 43.05 },
  { plate: 5, name: "Amasya", lat: 40.65, lng: 35.83 },
  { plate: 6, name: "Ankara", lat: 39.93, lng: 32.86 },
  { plate: 7, name: "Antalya", lat: 36.9, lng: 30.71 },
  { plate: 8, name: "Artvin", lat: 41.18, lng: 41.82 },
  { plate: 9, name: "Aydın", lat: 37.85, lng: 27.84 },
  { plate: 10, name: "Balıkesir", lat: 39.65, lng: 27.89 },
  { plate: 11, name: "Bilecik", lat: 40.14, lng: 29.98 },
  { plate: 12, name: "Bingöl", lat: 38.88, lng: 40.5 },
  { plate: 13, name: "Bitlis", lat: 38.4, lng: 42.11 },
  { plate: 14, name: "Bolu", lat: 40.74, lng: 31.61 },
  { plate: 15, name: "Burdur", lat: 37.72, lng: 30.29 },
  { plate: 16, name: "Bursa", lat: 40.19, lng: 29.06 },
  { plate: 17, name: "Çanakkale", lat: 40.15, lng: 26.41 },
  { plate: 18, name: "Çankırı", lat: 40.6, lng: 33.62 },
  { plate: 19, name: "Çorum", lat: 40.55, lng: 34.95 },
  { plate: 20, name: "Denizli", lat: 37.78, lng: 29.09 },
  { plate: 21, name: "Diyarbakır", lat: 37.91, lng: 40.24 },
  { plate: 22, name: "Edirne", lat: 41.68, lng: 26.56 },
  { plate: 23, name: "Elazığ", lat: 38.68, lng: 39.22 },
  { plate: 24, name: "Erzincan", lat: 39.75, lng: 39.49 },
  { plate: 25, name: "Erzurum", lat: 39.9, lng: 41.27 },
  { plate: 26, name: "Eskişehir", lat: 39.78, lng: 30.52 },
  { plate: 27, name: "Gaziantep", lat: 37.07, lng: 37.38 },
  { plate: 28, name: "Giresun", lat: 40.91, lng: 38.39 },
  { plate: 29, name: "Gümüşhane", lat: 40.46, lng: 39.48 },
  { plate: 30, name: "Hakkâri", lat: 37.57, lng: 43.74 },
  { plate: 31, name: "Hatay", lat: 36.2, lng: 36.16 },
  { plate: 32, name: "Isparta", lat: 37.76, lng: 30.55 },
  { plate: 33, name: "Mersin", lat: 36.8, lng: 34.63 },
  { plate: 34, name: "İstanbul", lat: 41.01, lng: 28.98 },
  { plate: 35, name: "İzmir", lat: 38.42, lng: 27.14 },
  { plate: 36, name: "Kars", lat: 40.6, lng: 43.09 },
  { plate: 37, name: "Kastamonu", lat: 41.39, lng: 33.78 },
  { plate: 38, name: "Kayseri", lat: 38.73, lng: 35.49 },
  { plate: 39, name: "Kırklareli", lat: 41.74, lng: 27.22 },
  { plate: 40, name: "Kırşehir", lat: 39.15, lng: 34.16 },
  { plate: 41, name: "Kocaeli", lat: 40.77, lng: 29.92 },
  { plate: 42, name: "Konya", lat: 37.87, lng: 32.48 },
  { plate: 43, name: "Kütahya", lat: 39.42, lng: 29.98 },
  { plate: 44, name: "Malatya", lat: 38.35, lng: 38.31 },
  { plate: 45, name: "Manisa", lat: 38.61, lng: 27.43 },
  { plate: 46, name: "Kahramanmaraş", lat: 37.58, lng: 36.94 },
  { plate: 47, name: "Mardin", lat: 37.31, lng: 40.74 },
  { plate: 48, name: "Muğla", lat: 37.22, lng: 28.36 },
  { plate: 49, name: "Muş", lat: 38.74, lng: 41.49 },
  { plate: 50, name: "Nevşehir", lat: 38.63, lng: 34.71 },
  { plate: 51, name: "Niğde", lat: 37.97, lng: 34.68 },
  { plate: 52, name: "Ordu", lat: 40.98, lng: 37.88 },
  { plate: 53, name: "Rize", lat: 41.02, lng: 40.52 },
  { plate: 54, name: "Sakarya", lat: 40.78, lng: 30.4 },
  { plate: 55, name: "Samsun", lat: 41.29, lng: 36.33 },
  { plate: 56, name: "Siirt", lat: 37.93, lng: 41.94 },
  { plate: 57, name: "Sinop", lat: 42.03, lng: 35.15 },
  { plate: 58, name: "Sivas", lat: 39.75, lng: 37.02 },
  { plate: 59, name: "Tekirdağ", lat: 40.98, lng: 27.51 },
  { plate: 60, name: "Tokat", lat: 40.31, lng: 36.55 },
  { plate: 61, name: "Trabzon", lat: 41.0, lng: 39.72 },
  { plate: 62, name: "Tunceli", lat: 39.11, lng: 39.55 },
  { plate: 63, name: "Şanlıurfa", lat: 37.16, lng: 38.79 },
  { plate: 64, name: "Uşak", lat: 38.68, lng: 29.41 },
  { plate: 65, name: "Van", lat: 38.49, lng: 43.38 },
  { plate: 66, name: "Yozgat", lat: 39.82, lng: 34.81 },
  { plate: 67, name: "Zonguldak", lat: 41.46, lng: 31.79 },
  { plate: 68, name: "Aksaray", lat: 38.37, lng: 34.03 },
  { plate: 69, name: "Bayburt", lat: 40.26, lng: 40.23 },
  { plate: 70, name: "Karaman", lat: 37.18, lng: 33.22 },
  { plate: 71, name: "Kırıkkale", lat: 39.85, lng: 33.52 },
  { plate: 72, name: "Batman", lat: 37.88, lng: 41.13 },
  { plate: 73, name: "Şırnak", lat: 37.52, lng: 42.46 },
  { plate: 74, name: "Bartın", lat: 41.64, lng: 32.34 },
  { plate: 75, name: "Ardahan", lat: 41.11, lng: 42.7 },
  { plate: 76, name: "Iğdır", lat: 39.92, lng: 44.04 },
  { plate: 77, name: "Yalova", lat: 40.65, lng: 29.28 },
  { plate: 78, name: "Karabük", lat: 41.2, lng: 32.63 },
  { plate: 79, name: "Kilis", lat: 36.72, lng: 37.12 },
  { plate: 80, name: "Osmaniye", lat: 37.07, lng: 36.25 },
  { plate: 81, name: "Düzce", lat: 40.84, lng: 31.16 },
];

/**
 * "Yakınımda" yarıçap seçenekleri (km).
 *
 * 10 km YOK: koordinat il merkezinin olduğu için 10 km "yalnız o il"
 * sonucunu verirdi ve kullanıcı seçtiği sayının karşılığını görmezdi
 * (kullanıcı kararı, 2026-09-07).
 */
export const RADIUS_OPTIONS = [25, 50, 100, 250] as const;
export type RadiusOption = (typeof RADIUS_OPTIONS)[number];

export function isRadiusOption(n: number): n is RadiusOption {
  return (RADIUS_OPTIONS as readonly number[]).includes(n);
}

/** TR aksanlarını da eleyerek karşılaştırma anahtarı (İ/I/ı tuzağı yok). */
function fold(v: string): string {
  return v
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .toLowerCase()
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .trim();
}

const BY_FOLDED = new Map(TR_PROVINCES.map((p) => [fold(p.name), p]));
const BY_PLATE = new Map(TR_PROVINCES.map((p) => [p.plate, p]));

/**
 * Serbest giriş → il. Ad ("izmir", "İZMİR", "Afyonkarahisar") ya da POSTA
 * KODU ("35100" → 35 → İzmir; "35" de kabul). Çözülemezse `null`.
 */
export function resolveProvince(raw?: string | null): TrProvince | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^\d{2,5}$/.test(v)) return BY_PLATE.get(Number(v.slice(0, 2))) ?? null;
  return BY_FOLDED.get(fold(v)) ?? null;
}

/** İki nokta arası büyük çember mesafesi (km). */
export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Merkezleri `km` içinde kalan illerin ADLARI (seçilen il DAHİL).
 *
 * Süzgeç bu adları `company.city IN (...)` olarak uygular. Firmanın şehri
 * serbest metin olduğu için farklı yazılmış bir değer eşleşmez — kanonik ad
 * kullanan kayıtlar (kayıt akışının ürettiği hâl) eşleşir.
 */
export function provincesWithin(origin: TrProvince, km: number): string[] {
  return TR_PROVINCES.filter((p) => haversineKm(origin, p) <= km).map((p) => p.name);
}
