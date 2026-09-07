import { Prisma, type PrismaClient } from "@rothern/db";
import {
  categoryAtLevel,
  categoryLevel,
  categoryPrefix,
  EMPLOYEE_BUCKET_KEYS,
  employeeBucket,
  foldSearchText,
  isCompanyActivity,
  isRadiusOption,
  provincesWithin,
  resolveProvince,
  stemPrefix,
  tokenizeQuery,
} from "@rothern/shared";
import { resolveCategoryAttributes } from "./category-attributes";
import { FAST_REPLY_HOURS } from "./reply-time";
import { publicProductWhere } from "./public-profile-gate";

/**
 * ÜRÜN DİZİNİ — where/orderBy/facet TEK KAYNAK (2026-09-04).
 *
 * Herkese açık `/urunler` ile panelin "Ürün Ara"sı aynı süzgeç kümesini
 * (arama, kategori alt ağacı, şehir, faaliyet, doğrulanmış, fiyat, nitelik)
 * ve aynı sıralamayı okur. İki kopya olsaydı üye, ziyaretçiden farklı bir
 * sonuç görürdü (kullanıcı bulgusu: "üye girişiyle tutarsız").
 */
export interface ProductIndexParams {
  q?: string;
  category?: string;
  /** Tek değer ya da virgüllü liste ("İstanbul,İzmir") — ÇOKLU seçim. */
  city?: string;
  /** Tek kod ya da virgüllü liste — ÇOKLU seçim. */
  activity?: string;
  verified?: boolean;
  price?: "has" | "request";
  /** TRY cinsinden birim fiyat aralığı (yalnız fiyatı yazılı ürünler). */
  priceMin?: number;
  priceMax?: number;
  /** "Min. sipariş ≤ X" — MOQ'su bu değerden küçük/eşit ya da hiç olmayanlar. */
  moqMax?: number;
  /**
   * Fiyat aralığı seçiliyken FİYATI BELİRTİLMEMİŞ ürünler de kalsın
   * (2026-09-07). Aralık `priceAmount`a bakar, `ON_REQUEST` ürünlerde o alan
   * boştur ve aralık seçilir seçilmez hepsi düşerdi — envanterin yarısı
   * "teklif isteyin" olduğu için kullanıcı aralığı daraltınca listenin
   * çökmesini bir hata sanıyordu.
   */
  priceUnpriced?: boolean;
  /** Tek değer ya da virgüllü liste — firma sertifikaları (ÇOKLU, OR). */
  cert?: string;
  /** Virgüllü çalışan kovası ALT SINIRLARI ("10,50") — bkz. `employee-bucket`. */
  employees?: string;
  /** "Yakınımda" merkezi: il adı ya da posta kodu. `radius` ile birlikte. */
  near?: string;
  /** Yarıçap (km) — 25 | 50 | 100 | 250. */
  radius?: number;
  /** Bilgi taleplerini ortalama bir iş gününde yanıtlayan firmalar. */
  fastReply?: boolean;
  attr?: string[];
  sort?: "relevance" | "newest" | "price" | "price_desc";
}

/**
 * "Min. sipariş" ön ayarları. Kova sınırı BURADA — `productIndexWhere`
 * (`moqMax`) ile facet sayacı aynı sayıyı kullanmazsa kullanıcı "≤100 (12)"
 * yazan bir kutucuğa tıklayıp 9 ürün görür.
 */
export const MOQ_BUCKETS = [10, 100, 1000] as const;

/** Fiyat histogramı kova sayısı — ray genişliğinde okunur kalan en yüksek değer. */
export const PRICE_HISTOGRAM_BUCKETS = 12;

/** Virgüllü çoklu değer → dizi (boşlar düşer, tavan 10). */
export function multi(v?: string): string[] {
  return (v ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 10);
}

/** Virgüllü çalışan kovası alt sınırları → sayı dizisi (geçersizler düşer). */
export function employeeKeysOf(raw?: string): number[] {
  return multi(raw)
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n) && EMPLOYEE_BUCKET_KEYS.includes(n));
}

/**
 * Seçili kovalara DÜŞEN ham `employeeCount` dizeleri.
 *
 * Serbest metin kolonunda kova SQL'de sorgulanamaz; çağıran distinct
 * değerleri (küçük küme) verir, burada kovalanır ve `where` bir `in`
 * listesine iner. Tek yer olması şart: sayaç bir kuralla, süzgeç başka bir
 * kuralla çalışırsa "50-249 (7)" tıklanınca 4 ürün çıkardı.
 */
export function employeeValuesFor(distinct: (string | null)[], raw?: string): string[] {
  const keys = new Set(employeeKeysOf(raw));
  if (!keys.size) return [];
  return distinct.filter((v): v is string => {
    const b = employeeBucket(v);
    return b != null && keys.has(b);
  });
}

/**
 * `employeeCount` DISTINCT değerleri — 15 dk bellek önbelleği.
 *
 * Serbest metin kolonunda kova SQL'de sorgulanamadığı için her istekte
 * distinct çekmek gerekirdi; değer kümesi firma profili kaydedildikçe
 * değişen küçük bir liste (bugün onlarca satır), bu yüzden süreç içinde
 * tutuluyor. Bayatlık maliyeti: yeni bir yazım biçimi en geç 15 dk sonra
 * süzgece girer — sayaç ile liste yine TUTARLI kalır (ikisi de aynı
 * listeden türer).
 */
let employeeValueCache: { at: number; values: string[] } | null = null;
export const EMPLOYEE_VALUE_TTL_MS = 15 * 60_000;

export async function distinctEmployeeCounts(prisma: Pick<PrismaClient, "company">): Promise<string[]> {
  if (employeeValueCache && Date.now() - employeeValueCache.at < EMPLOYEE_VALUE_TTL_MS) {
    return employeeValueCache.values;
  }
  const rows = await prisma.company.findMany({
    where: { employeeCount: { not: null } },
    select: { employeeCount: true },
    distinct: ["employeeCount"],
    take: 500,
  });
  const values = rows.map((r) => r.employeeCount).filter((v): v is string => !!v);
  employeeValueCache = { at: Date.now(), values };
  return values;
}

/** Test kolaylığı — önbelleği düşürür. */
export function resetEmployeeValueCache(): void {
  employeeValueCache = null;
}

/** Seçim varsa distinct değerleri çekip kovalar; seçim yoksa sorgu ATILMAZ. */
export async function employeeValuesQuery(
  prisma: Parameters<typeof distinctEmployeeCounts>[0],
  employees?: string,
): Promise<string[] | undefined> {
  if (!employeeKeysOf(employees).length) return undefined;
  return employeeValuesFor(await distinctEmployeeCounts(prisma), employees);
}

/**
 * "Yakınımda" → il adları. Merkez çözülemezse ya da yarıçap geçersizse BOŞ
 * döner ve süzgeç HİÇ uygulanmaz — bilinmeyen bir şehir yüzünden listeyi
 * boşaltmak yerine kısıtı yok saymak doğrusu (kullanıcı yazım hatası yapmış
 * olabilir; çipte ne seçildiği zaten görünüyor).
 */
export function nearCities(q: Pick<ProductIndexParams, "near" | "radius">): string[] {
  const origin = resolveProvince(q.near);
  if (!origin || q.radius == null || !isRadiusOption(q.radius)) return [];
  return provincesWithin(origin, q.radius);
}

export const PRODUCT_PAGE_SIZE = 24;
export const PRODUCT_FACET_SCAN_CAP = 5000;

export function productSearchClauses(
  raw?: string,
  opts: { includeCompanyName?: boolean } = {},
): Prisma.CompanyItemWhereInput[] {
  const tokens = raw ? tokenizeQuery(raw) : [];
  // `searchText` = fold(ad + marka + mpn + anahtar kelimeler); tokenler
  // AND'lenir, sıra önemsiz (kategori aramasıyla aynı kural). Token
  // KATLANIR — ham "Çelik" katlanmış "celik" metninde hiç eşleşmiyordu
  // (2026-09-05 düzeltmesi). Firma ADI da aranır: tek kutu "ürün ya da
  // firma" (Europages) — "Trakya Elektrik" yazan o firmanın ürünlerini bulur.
  // Türkçe ek toleransı (`stemPrefix`): "boruları" → "boru", "panosu" → "pano".
  // `includeCompanyName: false` — firma dizininde ÜRÜN metnini aramak için:
  // orada firma adı zaten ayrı bir dalda aranıyor, burada da aransa ada
  // uyan firmanın TÜM ürünleri "aramaya uyan ürün" sayılırdı.
  const withCompany = opts.includeCompanyName ?? true;
  return tokens.map((t) => ({
    OR: [
      { searchText: { contains: stemPrefix(foldSearchText(t)) } },
      ...(withCompany ? [{ company: { name: { contains: t, mode: "insensitive" as const } } }] : []),
    ],
  }));
}

/**
 * Nitelik süzgeci — `attributes` JSON'ı üzerinde. Değer tekli seçimde dize,
 * çoklu seçimde dizi; ikisi OR'lanır (tek biçim aransa kategorinin yarısı
 * sessizce boş dönerdi). `attributes` üzerinde indeks YOK (bilinen sınır).
 */
export function attributeClauses(raw?: string[]): Prisma.CompanyItemWhereInput[] {
  const out: Prisma.CompanyItemWhereInput[] = [];
  for (const entry of raw ?? []) {
    const i = entry.indexOf(":");
    if (i <= 0) continue;
    const key = entry.slice(0, i);
    const value = entry.slice(i + 1).trim();
    if (!value) continue;
    out.push({
      OR: [
        { attributes: { path: [key], equals: value } },
        { attributes: { path: [key], array_contains: [value] } },
      ],
    });
  }
  return out;
}

/** Kategori süzgeci ALT AĞACI kapsar (`categoryPrefix`, seviye × 2 hane). */
export function productCategoryWhere(code?: string): Prisma.CompanyItemWhereInput {
  const prefix = code ? categoryPrefix(code) : null;
  if (!prefix) return {};
  return { categoryId: { startsWith: prefix } };
}

export function productIndexWhere(
  q: ProductIndexParams,
  extra: Prisma.CompanyItemWhereInput[] = [],
  opts: { employeeValues?: string[] } = {},
): Prisma.CompanyItemWhereInput {
  const cities = multi(q.city);
  const activities = multi(q.activity).filter(isCompanyActivity);
  const certs = multi(q.cert);
  const employeeKeys = employeeKeysOf(q.employees);
  const near = nearCities(q);
  const and: Prisma.CompanyItemWhereInput[] = [
    ...productSearchClauses(q.q),
    // Şehir AYRI bir yan koşul: `publicProductWhere` de `company` altında
    // filtreliyor ve tek nesnede aynı anahtar iki kez bulunamaz. Çoklu seçim
    // = OR (İstanbul VEYA İzmir).
    ...(cities.length ? [{ company: { city: { in: cities } } }] : []),
    ...(activities.length ? [{ company: { activities: { hasSome: activities } } }] : []),
    ...(q.verified ? [{ company: { companyVerificationStatus: "VERIFIED" as const } }] : []),
    ...(q.price === "has"
      ? [{ priceMode: { in: ["FIXED" as const, "TIERED" as const] } }]
      : q.price === "request"
        ? [{ priceMode: "ON_REQUEST" as const }]
        : []),
    // "Yakınımda": il MERKEZLERİ arası mesafeden türetilen il listesi. Şehir
    // süzgeciyle birlikte seçilirse ikisi de uygulanır (kesişim) — iki ayrı
    // koşul, çünkü tek `company` nesnesinde aynı anahtar iki kez olamaz.
    ...(near.length ? [{ company: { city: { in: near } } }] : []),
    // Ölçümü OLMAYAN firma (null) dışarıda kalır — "yavaş" saymıyoruz,
    // "bilmiyoruz" diyoruz; kullanıcı hızlı olduğu KANITLI olanı istedi.
    ...(q.fastReply ? [{ company: { medianReplyHours: { lte: FAST_REPLY_HOURS } } }] : []),
    ...(certs.length ? [{ company: { certifications: { hasSome: certs } } }] : []),
    // ÇALIŞAN KOVASI: kolon serbest metin olduğu için SQL'de kova sorgulanamaz —
    // çağıran, veritabanındaki distinct değerleri kovalayıp EŞLEŞEN DİZELERİ
    // `employeeValues` ile geçer (bkz. `employeeValuesFor`). Liste boşsa
    // seçim hiçbir şeyi eşlemiyordur; `in: []` doğru sonucu (0 kayıt) verir.
    ...(employeeKeys.length ? [{ company: { employeeCount: { in: opts.employeeValues ?? [] } } }] : []),
    // Fiyat aralığı yalnız yazılı birim fiyatı olanlara uygulanır (sabit fiyat;
    // kademeli ürünlerin tabanı priceAmount'ta yok — kapsam dışı, bilinçli).
    ...(q.priceMin != null || q.priceMax != null
      ? [
          {
            OR: [
              { priceAmount: { ...(q.priceMin != null ? { gte: q.priceMin } : {}), ...(q.priceMax != null ? { lte: q.priceMax } : {}) } },
              ...(q.priceUnpriced ? [{ priceMode: "ON_REQUEST" as const }] : []),
            ],
          },
        ]
      : []),
    ...(q.moqMax != null ? [{ OR: [{ moq: null }, { moq: { lte: q.moqMax } }] }] : []),
    ...attributeClauses(q.attr),
    ...extra,
  ];
  return {
    ...publicProductWhere(),
    ...productCategoryWhere(q.category),
    ...(and.length ? { AND: and } : {}),
  };
}

/**
 * Varsayılan "uygunluk": PAKETLİ firma önce (2026-09-06 — "görünmek ücretsiz,
 * öne çıkmak paketli"), sonra eksiksiz ürün; `newest` de paketli önce.
 * `price` artan/azalan paketten BAĞIMSIZ (kullanıcı açıkça fiyat istedi),
 * fiyatsız SONDA.
 *
 * Paket sırası DB enum'undan (`CompanyTier` STANDART < SILVER < GOLD →
 * `desc`); süresi dolmuş paket kademe cron'u düşürene dek paketli sıralanır —
 * yalnız SIRA (erişim değil), o pencere kabul.
 */
export function productIndexOrderBy(
  sort?: ProductIndexParams["sort"],
): Prisma.CompanyItemOrderByWithRelationInput[] {
  const paidFirst = { company: { tier: "desc" as const } };
  if (sort === "newest") return [paidFirst, { publishedAt: "desc" }, { completionScore: "desc" }];
  if (sort === "price") return [{ priceAmount: { sort: "asc", nulls: "last" } }, { completionScore: "desc" }];
  if (sort === "price_desc") return [{ priceAmount: { sort: "desc", nulls: "last" } }, { completionScore: "desc" }];
  return [paidFirst, { completionScore: "desc" }, { publishedAt: "desc" }];
}

export interface ProductFacetRow {
  categoryId: string | null;
  priceMode?: string;
  /** Prisma `Decimal` → satır eşlemesinde `.toNumber()` (bkz. `toFacetRow`). */
  moq?: number | null;
  priceAmount?: number | null;
  company: {
    city: string | null;
    activities: string[];
    companyVerificationStatus?: string;
    certifications?: string[];
    employeeCount?: string | null;
    medianReplyHours?: number | null;
  };
}

/** Prisma satırı → `ProductFacetRow` (Decimal → number). İKİ çağıran da bunu
 *  kullanır; ayrı ayrı eşlerlerse biri `.toNumber()`ı unutur ve o boyutun
 *  sayacı sessizce boş döner. */
export function toFacetRow(r: {
  categoryId: string | null;
  priceMode?: string;
  moq?: Prisma.Decimal | null;
  priceAmount?: Prisma.Decimal | null;
  company: {
    city: string | null;
    activities: string[];
    companyVerificationStatus?: string;
    certifications?: string[];
    employeeCount?: string | null;
    medianReplyHours?: number | null;
  };
}): ProductFacetRow {
  return {
    categoryId: r.categoryId,
    priceMode: r.priceMode,
    moq: r.moq != null ? Number(r.moq) : null,
    priceAmount: r.priceAmount != null ? Number(r.priceAmount) : null,
    company: r.company,
  };
}

/**
 * BAĞLAMA DUYARLI facet sayımı (klasik faceted search): her boyutun sayısı,
 * DİĞER seçili süzgeçler uygulanmış küme üzerinden hesaplanır; kendi boyutu
 * hariç tutulur ki çoklu seçimde "İzmir (4)" seçili İstanbul'a rağmen doğru
 * kalsın. Satırlar zaten arama + kategori (sert süzgeçler) ile daraltılmış
 * gelir; şehir/faaliyet/doğrulanmış/fiyat burada bellekte uygulanır.
 */
export function contextualFacetCounts(rows: ProductFacetRow[], sel: ProductIndexParams) {
  const cities = new Set(multi(sel.city));
  const acts = new Set(multi(sel.activity));
  const certs = new Set(multi(sel.cert));
  const empKeys = new Set(employeeKeysOf(sel.employees));
  const okCity = (r: ProductFacetRow) => cities.size === 0 || (!!r.company.city && cities.has(r.company.city));
  const okAct = (r: ProductFacetRow) => acts.size === 0 || r.company.activities.some((a) => acts.has(a));
  const okVer = (r: ProductFacetRow) => !sel.verified || r.company.companyVerificationStatus === "VERIFIED";
  const okPrice = (r: ProductFacetRow) =>
    !sel.price || (sel.price === "has" ? r.priceMode !== "ON_REQUEST" : r.priceMode === "ON_REQUEST");
  const okCert = (r: ProductFacetRow) =>
    certs.size === 0 || (r.company.certifications ?? []).some((c) => certs.has(c.trim()));
  const okFast = (r: ProductFacetRow) =>
    !sel.fastReply || (r.company.medianReplyHours != null && r.company.medianReplyHours <= FAST_REPLY_HOURS);
  const okEmp = (r: ProductFacetRow) => {
    if (!empKeys.size) return true;
    const b = employeeBucket(r.company.employeeCount);
    return b != null && empKeys.has(b);
  };
  const count = (rs: ProductFacetRow[], key: (r: ProductFacetRow) => string[]) => {
    const m = new Map<string, number>();
    for (const r of rs) for (const k of new Set(key(r))) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  // Her boyut KENDİ seçimi hariç, diğer TÜM seçimler uygulanmış küme üzerinde
  // sayılır. Boyut ekledikçe bu listeler uzuyor; biri unutulursa o boyutun
  // sayacı fazla gösterir ve tıklayınca liste beklenenden dar çıkar.
  const base = (r: ProductFacetRow) => okCert(r) && okEmp(r) && okFast(r);
  const forCity = rows.filter((r) => okAct(r) && okVer(r) && okPrice(r) && base(r));
  const forAct = rows.filter((r) => okCity(r) && okVer(r) && okPrice(r) && base(r));
  const forVer = rows.filter((r) => okCity(r) && okAct(r) && okPrice(r) && base(r));
  const forFast = rows.filter((r) => okCity(r) && okAct(r) && okVer(r) && okPrice(r) && okCert(r) && okEmp(r));
  const forPrice = rows.filter((r) => okCity(r) && okAct(r) && okVer(r) && base(r));
  const forCert = rows.filter((r) => okCity(r) && okAct(r) && okVer(r) && okPrice(r) && okEmp(r));
  const forEmp = rows.filter((r) => okCity(r) && okAct(r) && okVer(r) && okPrice(r) && okCert(r));
  const forAll = rows.filter((r) => okCity(r) && okAct(r) && okVer(r) && okPrice(r) && base(r));
  return {
    categories: [...count(forAll, (r) => (r.categoryId && r.categoryId.length === 8 ? [`${r.categoryId.slice(0, 2)}000000`] : [])).entries()],
    cities: [...count(forCity, (r) => (r.company.city?.trim() ? [r.company.city.trim()] : [])).entries()]
      .map(([city, count]) => ({ city, count }))
      .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr")),
    activities: [...count(forAct, (r) => r.company.activities).entries()]
      .map(([activity, count]) => ({ activity, count }))
      .sort((a, b) => b.count - a.count),
    verified: forVer.filter((r) => r.company.companyVerificationStatus === "VERIFIED").length,
    fastReply: forFast.filter(
      (r) => r.company.medianReplyHours != null && r.company.medianReplyHours <= FAST_REPLY_HOURS,
    ).length,
    price: {
      has: forPrice.filter((r) => r.priceMode !== "ON_REQUEST").length,
      request: forPrice.filter((r) => r.priceMode === "ON_REQUEST").length,
    },
    /* SERTİFİKA serbest metin dizisi: kırpılmış TAM dize ile gruplanır.
       "ISO 9001" ile "ISO9001" ayrı satır olur — kaynak veri öyle. Normalize
       etmek (boşluk sökmek, büyük harfe çevirmek) sayıyı toparlar ama süzgeç
       ham değerle sorguladığı için sayılan ile eşleşen ayrışırdı. */
    certifications: [...count(forCert, (r) => (r.company.certifications ?? []).map((c) => c.trim()).filter(Boolean)).entries()]
      .map(([cert, count]) => ({ cert, count }))
      .sort((a, b) => b.count - a.count || a.cert.localeCompare(b.cert, "tr")),
    employees: [...count(forEmp, (r) => {
      const b = employeeBucket(r.company.employeeCount);
      return b != null ? [String(b)] : [];
    }).entries()]
      .map(([key, count]) => ({ key: Number(key), count }))
      .sort((a, b) => a.key - b.key),
    /* MOQ ön ayarları KÜMÜLATİF ("≤100" ≤10'u da kapsar) ve `productIndexWhere`
       ile aynı kuralı uygular: MOQ'su OLMAYAN ürün her kovaya girer (satıcı
       alt sınır koymamış = her miktar olur). */
    moq: Object.fromEntries(
      MOQ_BUCKETS.map((b) => [b, forAll.filter((r) => r.moq == null || r.moq <= b).length]),
    ) as Record<string, number>,
    priceHistogram: priceHistogram(forAll),
  };
}

/**
 * FİYAT HİSTOGRAMI — süzgecin üstündeki çubuklar.
 *
 * KOVALAR LOGARİTMİK. B2B kataloğunda fiyat büyüklük mertebeleri boyunca
 * yayılıyor (canlıda 3 ₺ – 465.000 ₺): doğrusal kovalarda ürünlerin
 * neredeyse tamamı ilk kovaya düşüyor ve histogram tek çubuğa iniyordu —
 * yani hiçbir şey anlatmıyordu. Log ölçekte her kova bir çarpan aralığıdır
 * ve dağılım okunur.
 *
 * Uçlar p5-p95 (tek aykırı değer ölçeği bozmasın); dönen `min`/`max` GERÇEK
 * uçlardır — min/max kutuları ve "≤ X" ön ayarları onları gösterir.
 *
 * `quantiles`: ön ayar aralıkları için üçte birlik sınırlar. Doğrusal
 * bölmede ("min + (max-min)/3") çarpık dağılımda ilk aralık envanterin
 * %95'ini kapsıyor, diğer ikisi boş kalıyordu.
 *
 * Fiyatı yazılı ürün 2'den azsa ya da hepsi aynı fiyattaysa `null` →
 * çağıran histogramı hiç çizmez (boş kutu basmayız).
 */
export function priceHistogram(rows: ProductFacetRow[]): {
  min: number;
  max: number;
  quantiles: { p33: number; p66: number };
  buckets: { from: number; to: number; count: number }[];
} | null {
  const prices = rows.map((r) => r.priceAmount).filter((p): p is number => p != null && p > 0).sort((a, b) => a - b);
  if (prices.length < 2) return null;
  const at = (q: number) => prices[Math.min(prices.length - 1, Math.max(0, Math.round(q * (prices.length - 1))))]!;
  const lo = Math.max(1, at(0.05));
  const hi = at(0.95);
  if (!(hi > lo)) return null;
  // Log ölçek: kova sınırları lo·(hi/lo)^(i/n).
  const ratio = Math.log(hi / lo) / PRICE_HISTOGRAM_BUCKETS;
  const edge = (i: number) => lo * Math.exp(ratio * i);
  const buckets = Array.from({ length: PRICE_HISTOGRAM_BUCKETS }, (_, i) => ({
    from: Math.round(edge(i)),
    to: Math.round(edge(i + 1)),
    count: 0,
  }));
  for (const p of prices) {
    const i = Math.min(
      PRICE_HISTOGRAM_BUCKETS - 1,
      Math.max(0, Math.floor(Math.log(p / lo) / ratio)),
    );
    buckets[i]!.count++;
  }
  return {
    min: Math.round(prices[0]!),
    max: Math.round(prices[prices.length - 1]!),
    quantiles: { p33: Math.round(at(1 / 3)), p66: Math.round(at(2 / 3)) },
    buckets,
  };
}

/** Nitelik facet'i sayılabilir tipler — serbest metin/sayıda her ürün kendi
 *  değerini üretir, sayım anlamsız olurdu. Prisma enum'ıyla BİREBİR: panel
 *  kopyası "SELECT"/"MULTISELECT" yazıyordu ve hiç eşleşmediği için panelin
 *  nitelik süzgeci sessizce HEP boştu (2026-09-07 denetimi). */
export const FACETABLE_ATTRIBUTE_TYPES = new Set(["SINGLE_SELECT", "MULTI_SELECT"]);
export const ATTR_FACET_VALUES = 12;

export interface AttributeFacet {
  key: string;
  nameTr: string;
  unit: string | null;
  values: { value: string; count: number }[];
}

/**
 * NİTELİK facet'leri — yalnız bir kategori seçiliyken. TEK KAYNAK: public
 * `/urunler` ve panel ürün dizini AYNI fonksiyonu çağırır (iki kopya vardı,
 * panelinki tip adını yanlış yazdığı için ölüydü).
 *
 * Tanımlar kategori ağacından MİRASLA gelir (panel ürün formunda sorulanla
 * AYNI kaynak), sayımlar taranan ürünlerden. Değeri OLMAYAN nitelik listeye
 * girmez — hiçbir şeyi daraltmayan süzgeç satırı gösterilmez.
 */
export async function attributeFacets(
  prisma: Parameters<typeof resolveCategoryAttributes>[0],
  category: string | undefined,
  rows: { attributes: unknown }[],
): Promise<AttributeFacet[]> {
  if (!category || !/^\d{8}$/.test(category)) return [];
  const defs = (await resolveCategoryAttributes(prisma, category)).filter((d) =>
    FACETABLE_ATTRIBUTE_TYPES.has(d.type),
  );
  if (defs.length === 0) return [];

  const counts = new Map<string, Map<string, number>>();
  for (const d of defs) counts.set(d.key, new Map());
  for (const r of rows) {
    const a = r.attributes;
    if (!a || typeof a !== "object" || Array.isArray(a)) continue;
    for (const d of defs) {
      const raw = (a as Record<string, unknown>)[d.key];
      // Tekli seçim dize, çoklu seçim dizi — ikisi de aynı sayaca düşer.
      const values = Array.isArray(raw) ? raw : raw == null ? [] : [raw];
      const bucket = counts.get(d.key)!;
      for (const v of values) {
        if (typeof v !== "string" || !v.trim()) continue;
        bucket.set(v, (bucket.get(v) ?? 0) + 1);
      }
    }
  }

  return defs
    .map((d) => ({
      key: d.key,
      nameTr: d.nameTr,
      unit: d.unit,
      values: [...counts.get(d.key)!.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "tr"))
        .slice(0, ATTR_FACET_VALUES),
    }))
    .filter((f) => f.values.length > 0);
}

/**
 * ALT KIRILIM sayaçları — seçili kategorinin BİR ALT seviyesindeki dallar.
 *
 * Kategori sayfası ("Elektrik Sistemleri") altında hangi ailelerin ürünü
 * olduğunu göstermek için. Sektör listesi (`contextualFacetCounts.categories`)
 * hep L1'e yuvarlar; bu, seçili kodun seviyesi + 1'e yuvarlar. Yaprak (L4)
 * seçiliyse alt dal yoktur → boş döner.
 */
/** Yalnız `categoryId` okur — ham Prisma satırı da geçsin diye dar tip
 *  (`ProductFacetRow` istemek çağıranı gereksizce `toFacetRow`a zorlardı). */
export function subCategoryCounts(rows: { categoryId: string | null }[], category?: string): [string, number][] {
  if (!category || !/^\d{8}$/.test(category)) return [];
  const level = categoryLevel(category);
  if (level === 0 || level >= 4) return [];
  const child = (level + 1) as 2 | 3 | 4;
  const prefix = categoryPrefix(category);
  if (!prefix) return [];
  const m = new Map<string, number>();
  for (const r of rows) {
    const id = r.categoryId;
    if (!id || !id.startsWith(prefix)) continue;
    const key = categoryAtLevel(id, child);
    if (!key) continue;
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
