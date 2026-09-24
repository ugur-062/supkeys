import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locales";

/**
 * YOL PARÇALARI ÜÇ DİLDE — TEK KAYNAK (i18n, 2026-09-24, kullanıcı kararı:
 * "yol parçaları da hangi dilse o dilde olsun").
 *
 * Anahtar = İÇ şablon (Türkçe, ön eksiz, `app/[locale]/**` dosya yolu),
 * değer = dil başına DIŞ şablon (kullanıcının gördüğü adres). Türkçe iç şablonla
 * aynıdır (varsayılan dil, ön eksiz) — bugünkü hiçbir Türkçe adres değişmez.
 * Rusça parçalar LATİN çeviriyazı (kullanıcı kararı; Kiril adres paylaşılınca
 * `%D0%BF…` biçimine dönüyordu, varlık slug'ları da Latin). Panel kökü dile
 * göre: `/company` (TR, EN) · `/kompaniya` (RU).
 *
 * Varlık slug'ları ([slug], [il], [id] …) HİÇBİR dilde değişmez: ürün/firma/
 * talep slug'ı kaynak metinden, kategori kod+Türkçe ad, şehir Türkçe il adı.
 *
 * KULLANANLAR: web next-intl `routing.pathnames` (middleware yeniden yazma +
 * yanlış biçimi 308), web `@/i18n/navigation` (dize adresi şablona eşleyip
 * çevirir), web `@/i18n/href` (`localizePath`/`splitLocale` → kanonik,
 * hreflang, sitemap, robots), API e-posta derin bağlantıları (Faz 3).
 *
 * Yeni sayfa açan geliştirici buraya satır ekler; `pathnames.test.ts` her
 * dilde karşılık ister ve aynı dilde iki iç şablonun aynı dış şablona
 * düşmesini (sessiz çakışma) yasaklar. `/dev/*` ve `[...rest]` bilinçli
 * dışarıda (çevrilmeyen yol olduğu gibi geçer).
 */
export type RoutePathnames = Readonly<Record<string, Readonly<Record<Locale, string>>>>;

const P = (tr: string, en: string, ru: string): Readonly<Record<Locale, string>> => ({ tr, en, ru });

export const ROUTE_PATHNAMES: RoutePathnames = {
  "/": P("/", "/", "/"),
  // ---- herkese açık pazar yeri ------------------------------------------
  "/urunler": P("/urunler", "/products", "/tovary"),
  "/urunler/kategori/[slug]": P("/urunler/kategori/[slug]", "/products/category/[slug]", "/tovary/kategoriya/[slug]"),
  "/urunler/sehir/[il]": P("/urunler/sehir/[il]", "/products/city/[il]", "/tovary/gorod/[il]"),
  "/firmalar": P("/firmalar", "/companies", "/kompanii"),
  "/firma/[slug]": P("/firma/[slug]", "/companies/[slug]", "/kompanii/[slug]"),
  "/firma/[slug]/urun/[urunSlug]": P("/firma/[slug]/urun/[urunSlug]", "/companies/[slug]/products/[urunSlug]", "/kompanii/[slug]/tovary/[urunSlug]"),
  "/alim-talepleri": P("/alim-talepleri", "/buying-requests", "/zayavki"),
  "/talep/[slug]": P("/talep/[slug]", "/buying-requests/[slug]", "/zayavki/[slug]"),
  // ---- pazarlama / statik ------------------------------------------------
  "/hakkimizda": P("/hakkimizda", "/about", "/o-nas"),
  "/iletisim": P("/iletisim", "/contact", "/kontakty"),
  "/sss": P("/sss", "/faq", "/faq"),
  "/nasil-calisir": P("/nasil-calisir", "/how-it-works", "/kak-eto-rabotaet"),
  "/sozlesmeler/aracilik": P("/sozlesmeler/aracilik", "/legal/intermediation", "/dokumenty/posrednichestvo"),
  "/sozlesmeler/gizlilik": P("/sozlesmeler/gizlilik", "/legal/privacy", "/dokumenty/konfidentsialnost"),
  "/sozlesmeler/iade": P("/sozlesmeler/iade", "/legal/returns", "/dokumenty/vozvrat"),
  "/sozlesmeler/kullanici": P("/sozlesmeler/kullanici", "/legal/terms", "/dokumenty/polzovatelskoe-soglashenie"),
  "/sozlesmeler/kvkk": P("/sozlesmeler/kvkk", "/legal/personal-data", "/dokumenty/personalnye-dannye"),
  "/sozlesmeler/mesafeli-satis": P("/sozlesmeler/mesafeli-satis", "/legal/distance-sales", "/dokumenty/distantsionnaya-prodazha"),
  "/talep-onayla": P("/talep-onayla", "/confirm-inquiry", "/podtverdit-zapros"),
  "/davet-kapat": P("/davet-kapat", "/stop-invitations", "/otkaz-ot-priglasheniy"),
  "/reset-password": P("/reset-password", "/reset-password", "/sbros-parolya"),
  // ---- kimlik ----------------------------------------------------------
  "/company/login": P("/company/login", "/company/login", "/kompaniya/vhod"),
  "/company/kayit": P("/company/kayit", "/company/signup", "/kompaniya/registratsiya"),
  "/company/sifremi-unuttum": P("/company/sifremi-unuttum", "/company/forgot-password", "/kompaniya/zabyli-parol"),
  "/company/davet/[token]": P("/company/davet/[token]", "/company/invite/[token]", "/kompaniya/priglashenie/[token]"),
  "/company/onboarding": P("/company/onboarding", "/company/onboarding", "/kompaniya/onboarding"),
  // ---- panel kökü ve ortak sayfalar ------------------------------------
  "/company": P("/company", "/company", "/kompaniya"),
  "/company/premium": P("/company/premium", "/company/plans", "/kompaniya/tarify"),
  "/company/premium/satin-al": P("/company/premium/satin-al", "/company/plans/checkout", "/kompaniya/tarify/oformlenie"),
  "/company/bildirimler": P("/company/bildirimler", "/company/notifications", "/kompaniya/uvedomleniya"),
  "/company/mesajlar": P("/company/mesajlar", "/company/messages", "/kompaniya/soobshcheniya"),
  "/company/onaylar": P("/company/onaylar", "/company/approvals", "/kompaniya/soglasovaniya"),
  "/company/firma/[id]": P("/company/firma/[id]", "/company/companies/[id]", "/kompaniya/kompanii/[id]"),
  "/company/ilan/[id]": P("/company/ilan/[id]", "/company/request/[id]", "/kompaniya/zayavka/[id]"),
  "/company/ilan/[id]/teklif-ver": P("/company/ilan/[id]/teklif-ver", "/company/request/[id]/bid", "/kompaniya/zayavka/[id]/predlozhenie"),
  "/company/ilan/[id]/teklif/[bidId]": P("/company/ilan/[id]/teklif/[bidId]", "/company/request/[id]/bids/[bidId]", "/kompaniya/zayavka/[id]/predlozheniya/[bidId]"),
  "/company/siparis/[id]": P("/company/siparis/[id]", "/company/order/[id]", "/kompaniya/zakaz/[id]"),
  // ---- satınalma portalı -----------------------------------------------
  "/company/satinalma": P("/company/satinalma", "/company/purchasing", "/kompaniya/zakupki"),
  "/company/satinalma/bilgi-taleplerim": P("/company/satinalma/bilgi-taleplerim", "/company/purchasing/my-inquiries", "/kompaniya/zakupki/moi-zaprosy"),
  "/company/satinalma/firmalar": P("/company/satinalma/firmalar", "/company/purchasing/companies", "/kompaniya/zakupki/kompanii"),
  "/company/satinalma/kategori/[slug]": P("/company/satinalma/kategori/[slug]", "/company/purchasing/category/[slug]", "/kompaniya/zakupki/kategoriya/[slug]"),
  "/company/satinalma/mesajlar": P("/company/satinalma/mesajlar", "/company/purchasing/messages", "/kompaniya/zakupki/soobshcheniya"),
  "/company/satinalma/sablonlar": P("/company/satinalma/sablonlar", "/company/purchasing/templates", "/kompaniya/zakupki/shablony"),
  "/company/satinalma/sablonlar/gruplar": P("/company/satinalma/sablonlar/gruplar", "/company/purchasing/templates/groups", "/kompaniya/zakupki/shablony/gruppy"),
  "/company/satinalma/sablonlar/kalemler": P("/company/satinalma/sablonlar/kalemler", "/company/purchasing/templates/items", "/kompaniya/zakupki/shablony/pozitsii"),
  "/company/satinalma/sablonlar/soru-setleri": P("/company/satinalma/sablonlar/soru-setleri", "/company/purchasing/templates/question-sets", "/kompaniya/zakupki/shablony/nabory-voprosov"),
  "/company/satinalma/sablonlar/talep": P("/company/satinalma/sablonlar/talep", "/company/purchasing/templates/request", "/kompaniya/zakupki/shablony/zayavka"),
  "/company/satinalma/sablonlar/talep-sartlari": P("/company/satinalma/sablonlar/talep-sartlari", "/company/purchasing/templates/request-terms", "/kompaniya/zakupki/shablony/usloviya-zayavki"),
  "/company/satinalma/siparisler": P("/company/satinalma/siparisler", "/company/purchasing/orders", "/kompaniya/zakupki/zakazy"),
  "/company/satinalma/taleplerim": P("/company/satinalma/taleplerim", "/company/purchasing/my-requests", "/kompaniya/zakupki/moi-zayavki"),
  "/company/satinalma/taleplerim/yeni": P("/company/satinalma/taleplerim/yeni", "/company/purchasing/my-requests/new", "/kompaniya/zakupki/moi-zayavki/novaya"),
  "/company/satinalma/taleplerim/[id]/duzenle": P("/company/satinalma/taleplerim/[id]/duzenle", "/company/purchasing/my-requests/[id]/edit", "/kompaniya/zakupki/moi-zayavki/[id]/redaktirovat"),
  "/company/satinalma/tedarikcilerim": P("/company/satinalma/tedarikcilerim", "/company/purchasing/my-suppliers", "/kompaniya/zakupki/moi-postavshchiki"),
  "/company/satinalma/urunler": P("/company/satinalma/urunler", "/company/purchasing/products", "/kompaniya/zakupki/tovary"),
  "/company/satinalma/urunler/[firmaSlug]/[urunSlug]": P("/company/satinalma/urunler/[firmaSlug]/[urunSlug]", "/company/purchasing/products/[firmaSlug]/[urunSlug]", "/kompaniya/zakupki/tovary/[firmaSlug]/[urunSlug]"),
  // ---- satış portalı ---------------------------------------------------
  "/company/satis": P("/company/satis", "/company/sales", "/kompaniya/prodazhi"),
  "/company/satis/bilgi-talepleri": P("/company/satis/bilgi-talepleri", "/company/sales/inquiries", "/kompaniya/prodazhi/zaprosy"),
  "/company/satis/firmalar": P("/company/satis/firmalar", "/company/sales/companies", "/kompaniya/prodazhi/kompanii"),
  "/company/satis/mesajlar": P("/company/satis/mesajlar", "/company/sales/messages", "/kompaniya/prodazhi/soobshcheniya"),
  "/company/satis/musterilerim": P("/company/satis/musterilerim", "/company/sales/my-customers", "/kompaniya/prodazhi/moi-klienty"),
  "/company/satis/siparisler": P("/company/satis/siparisler", "/company/sales/orders", "/kompaniya/prodazhi/zakazy"),
  "/company/satis/tekliflerim": P("/company/satis/tekliflerim", "/company/sales/my-bids", "/kompaniya/prodazhi/moi-predlozheniya"),
  "/company/satis/urunlerim": P("/company/satis/urunlerim", "/company/sales/my-products", "/kompaniya/prodazhi/moi-tovary"),
  // ---- şirketim ----------------------------------------------------------
  "/company/sirketim": P("/company/sirketim", "/company/my-company", "/kompaniya/moya-kompaniya"),
  "/company/sirketim/profil": P("/company/sirketim/profil", "/company/my-company/profile", "/kompaniya/moya-kompaniya/profil"),
  "/company/sirketim/raporlar": P("/company/sirketim/raporlar", "/company/my-company/reports", "/kompaniya/moya-kompaniya/otchety"),
  "/company/sirketim/raporlar/genel": P("/company/sirketim/raporlar/genel", "/company/my-company/reports/overview", "/kompaniya/moya-kompaniya/otchety/obzor"),
  "/company/sirketim/raporlar/is-analizi": P("/company/sirketim/raporlar/is-analizi", "/company/my-company/reports/business-insights", "/kompaniya/moya-kompaniya/otchety/biznes-analitika"),
  "/company/sirketim/raporlar/tasarruf": P("/company/sirketim/raporlar/tasarruf", "/company/my-company/reports/savings", "/kompaniya/moya-kompaniya/otchety/ekonomiya"),
  "/company/sirketim/raporlar/teklif-karsilastirma": P("/company/sirketim/raporlar/teklif-karsilastirma", "/company/my-company/reports/bid-comparison", "/kompaniya/moya-kompaniya/otchety/sravnenie-predlozheniy"),
  "/company/sirketim/ziyaretciler": P("/company/sirketim/ziyaretciler", "/company/my-company/visitors", "/kompaniya/moya-kompaniya/posetiteli"),
  // ---- ayarlar -----------------------------------------------------------
  "/company/ayarlar": P("/company/ayarlar", "/company/settings", "/kompaniya/nastroyki"),
  "/company/ayarlar/2fa": P("/company/ayarlar/2fa", "/company/settings/2fa", "/kompaniya/nastroyki/2fa"),
  "/company/ayarlar/adresler": P("/company/ayarlar/adresler", "/company/settings/addresses", "/kompaniya/nastroyki/adresa"),
  "/company/ayarlar/ai-kullanim": P("/company/ayarlar/ai-kullanim", "/company/settings/ai-usage", "/kompaniya/nastroyki/ispolzovanie-ai"),
  "/company/ayarlar/aktivite": P("/company/ayarlar/aktivite", "/company/settings/activity", "/kompaniya/nastroyki/aktivnost"),
  "/company/ayarlar/banka-hesaplari": P("/company/ayarlar/banka-hesaplari", "/company/settings/bank-accounts", "/kompaniya/nastroyki/bankovskie-scheta"),
  "/company/ayarlar/bildirimler": P("/company/ayarlar/bildirimler", "/company/settings/notifications", "/kompaniya/nastroyki/uvedomleniya"),
  "/company/ayarlar/dogrulama": P("/company/ayarlar/dogrulama", "/company/settings/verification", "/kompaniya/nastroyki/verifikatsiya"),
  "/company/ayarlar/firma": P("/company/ayarlar/firma", "/company/settings/company", "/kompaniya/nastroyki/kompaniya"),
  "/company/ayarlar/hesap-bilgileri": P("/company/ayarlar/hesap-bilgileri", "/company/settings/account", "/kompaniya/nastroyki/akkaunt"),
  "/company/ayarlar/kullanicilar": P("/company/ayarlar/kullanicilar", "/company/settings/users", "/kompaniya/nastroyki/polzovateli"),
  "/company/ayarlar/sifre": P("/company/ayarlar/sifre", "/company/settings/password", "/kompaniya/nastroyki/parol"),
};

/* ------------------------------------------------------------------ */
/* Şablon eşleme — saf, edge-safe (middleware de kullanır)             */
/* ------------------------------------------------------------------ */

interface ParsedTemplate {
  internal: string;
  segments: string[]; // iç şablon parçaları
  staticCount: number;
}

function splitSegments(path: string): string[] {
  return path.split("/").filter(Boolean);
}

const TEMPLATES: ParsedTemplate[] = Object.keys(ROUTE_PATHNAMES).map((internal) => {
  const segments = splitSegments(internal);
  return { internal, segments, staticCount: segments.filter((s) => !s.startsWith("[")).length };
});

/** `[ad]` parçaları herhangi bir boş olmayan parçayla eşleşir; sabitler birebir. */
function matchSegments(template: string[], actual: string[]): Record<string, string> | null {
  if (template.length !== actual.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < template.length; i++) {
    const t = template[i]!;
    const a = actual[i]!;
    if (t.startsWith("[") && t.endsWith("]")) {
      if (!a) return null;
      params[t.slice(1, -1)] = a;
    } else if (t !== a) {
      return null;
    }
  }
  return params;
}

function compile(template: string, params: Record<string, string>): string {
  return template.replace(/\[([^\]]+)\]/g, (_, name: string) => params[name] ?? `[${name}]`);
}

/** Yol · sorgu · parça ayrımı — sorgu ve `#` olduğu gibi korunur. */
function splitUrl(href: string): { path: string; rest: string } {
  const m = /^([^?#]*)(.*)$/.exec(href);
  return { path: m?.[1] ?? href, rest: m?.[2] ?? "" };
}

function normalizePath(path: string): string {
  if (!path.startsWith("/")) return path;
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return trimmed || "/";
}

/** En çok sabit parçası olan eşleşme kazanır (`/company/login` > `/company/[x]`). */
function bestMatch(actual: string[], pick: (t: ParsedTemplate) => string): { template: ParsedTemplate; params: Record<string, string> } | null {
  let best: { template: ParsedTemplate; params: Record<string, string> } | null = null;
  for (const t of TEMPLATES) {
    const params = matchSegments(splitSegments(pick(t)), actual);
    if (params && (!best || t.staticCount > best.template.staticCount)) best = { template: t, params };
  }
  return best;
}

/** İç şablonu bulur: `/talep/rot-000042-x` → `{ internal: "/talep/[slug]", params: { slug } }`. */
export function matchInternalRoute(path: string): { internal: string; params: Record<string, string> } | null {
  const hit = bestMatch(splitSegments(normalizePath(path)), (t) => t.internal);
  return hit ? { internal: hit.template.internal, params: hit.params } : null;
}

/**
 * İÇ yol (Türkçe, ön eksiz) → o dilin DIŞ yolu (ön eksiz). Tanınmayan yol,
 * mutlak adres, `mailto:` vb. olduğu gibi döner; sorgu ve `#` korunur.
 *   translateRoutePath("/urunler/kategori/31000000-x?sayfa=2", "en")
 *     → "/products/category/31000000-x?sayfa=2"
 */
export function translateRoutePath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const { path, rest } = splitUrl(href);
  const hit = bestMatch(splitSegments(normalizePath(path)), (t) => t.internal);
  if (!hit) return href;
  return compile(ROUTE_PATHNAMES[hit.template.internal]![locale], hit.params) + rest;
}

/**
 * DIŞ yol (ön eksiz, herhangi bir dilin biçimi) → İÇ yol. Önce verilen dilin
 * şablonları, sonra iç şablonlar (zaten iç biçim), en son diğer diller
 * denenir — middleware kanonik olmayan biçimi 308'lemeden önce de rota
 * kimliğini doğru okur. Tanınmayan yol olduğu gibi döner.
 */
export function internalRoutePath(href: string, locale: Locale): string {
  if (!href.startsWith("/") || href.startsWith("//")) return href;
  const { path, rest } = splitUrl(href);
  const actual = splitSegments(normalizePath(path));
  const order: Locale[] = [locale, ...LOCALES.filter((l) => l !== locale)];
  for (const l of order) {
    const hit = bestMatch(actual, (t) => ROUTE_PATHNAMES[t.internal]![l]);
    if (hit) return compile(hit.template.internal, hit.params) + rest;
  }
  return href;
}

/** Aynı dilde iki iç şablonun aynı dış şablona düşmesi — sessiz çakışma denetimi (test). */
export function findPathnameCollisions(): string[] {
  const out: string[] = [];
  for (const locale of LOCALES) {
    const seen = new Map<string, string>();
    for (const [internal, byLocale] of Object.entries(ROUTE_PATHNAMES)) {
      const key = byLocale[locale].replace(/\[[^\]]+\]/g, "[]");
      const prev = seen.get(key);
      if (prev) out.push(`${locale}: ${prev} ↔ ${internal} → ${byLocale[locale]}`);
      seen.set(key, internal);
    }
  }
  return out;
}

export { DEFAULT_LOCALE as ROUTE_DEFAULT_LOCALE };
