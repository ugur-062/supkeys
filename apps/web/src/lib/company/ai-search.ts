import { affixCurrency, tierAtLeast } from "@rothern/shared";
import type { AiSearchIntentResult } from "@rothern/shared";
import { hasAnySeatPermission, type PermissionSubject } from "@/lib/company/permissions";
import { formatNumber } from "@/i18n/format";
import { buildProductFilterQuery, EMPTY_FILTERS } from "@/lib/public/product-filter-params";
import { buildRequestFilterQuery, EMPTY_REQUEST_FILTERS, segmentOf } from "@/lib/company/request-filter-params";
import { visibleCategoryRef } from "@/lib/visible-categories";

/**
 * AI ARAMA — yorum → URL süzgeci (2026-09-05). Model süzgeç önerir, sayfa
 * onu mevcut liste şemasına yazar; her parça çip olarak görünür ve tek tıkla
 * kaldırılır (çipler URL'den okunur — kaldırılan gerçekten kalkmış olur).
 */
export const AI_TENDER_DRAFT_KEY = "ai-tender-draft";

/**
 * Hero "AI ile ara" kapısı — API `assertAiAccess` aynası (Silver+ ∧ herhangi
 * bir koltuk izni). Kilidin NEDENİNİ de verir (arayüz testi O-050): rol
 * kontrolü paket kontrolünün İÇİNDE — paket yetmiyorsa neden "tier" (Paketler
 * bağlantısı), paket yetip koltuk izni yoksa "role" (paket bağlantısı YOK;
 * Gold firmanın Yönetici'sine "Silver ile açılır" deniyordu).
 */
export function aiSearchAccess(
  company: { tier: string } | null | undefined,
  user: PermissionSubject | null | undefined,
): { enabled: boolean; lockedBy?: "tier" | "role" } {
  if (!company || !tierAtLeast(company.tier, "SILVER")) return { enabled: false, lockedBy: "tier" };
  if (!hasAnySeatPermission(user)) return { enabled: false, lockedBy: "role" };
  return { enabled: true };
}

/**
 * AI YORUMU KÖPRÜSÜ — arama kutusu anasayfada, sonuç listesi ayrı sayfada.
 *
 * Yorum ("AI şöyle anladı" + çipler + gevşetme notu) URL'ye sığmaz ve
 * sığdırılmamalı (çipler zaten URL'den okunuyor, bu yalnız AÇIKLAMA).
 * Taslak köprüsüyle aynı desen: `sessionStorage`a yazılır, hedef sayfa
 * bir kez okuyup SİLER — yenilemede bant geri gelmez, çünkü kullanıcı o
 * noktada süzgeci kendi düzenlemiş olabilir.
 */
export const AI_SEARCH_INTENT_KEY = "ai-search-intent";

export function stashAiIntent(intent: AiSearchIntentResult): void {
  try {
    sessionStorage.setItem(AI_SEARCH_INTENT_KEY, JSON.stringify(intent));
  } catch {
    // Gizli sekmede depolama kapalı olabilir — bant çizilmez, liste çalışır.
  }
}

export function takeAiIntent(): AiSearchIntentResult | null {
  try {
    const raw = sessionStorage.getItem(AI_SEARCH_INTENT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(AI_SEARCH_INTENT_KEY);
    return JSON.parse(raw) as AiSearchIntentResult;
  } catch {
    return null;
  }
}

/**
 * Yorumun kategorisi — gizli segmentteyse YOK sayılır (2026-10-09): süzgeç
 * adresine yazılmaz (`?kategori=46…` ayrıştırıcıda zaten yok sayılır, ama
 * adreste durduğu için bantta adı çip olurdu) ve çip çizilmez. API kategoriyi
 * süzülü çözücüden verir; burası ikinci kat.
 */
function intentCategory(r: AiSearchIntentResult): AiSearchIntentResult["category"] {
  return visibleCategoryRef(r.category);
}

/** Satınalma: ürün dizini süzgeci. Adet → "min. sipariş en fazla" (MOQ tavanı). */
export function intentToProductQuery(r: AiSearchIntentResult): string {
  return buildProductFilterQuery({
    ...EMPTY_FILTERS,
    q: r.query ?? undefined,
    category: intentCategory(r)?.id,
    cities: r.city ? [r.city] : [],
    countries: r.country ? [r.country] : [],
    activities: r.activity ? [r.activity] : [],
    verified: r.verifiedOnly,
    priceMax: r.priceMax ?? undefined,
    // Tavanın birimi açıkça yazılır (sunucu hangi birimle saydıysa o) —
    // bağlantı başka dilde/firmada açılınca tavan başka birimde okunmasın.
    currency: r.priceMax != null && r.currency ? r.currency : undefined,
    moqMax: r.quantity != null ? Math.max(1, Math.trunc(r.quantity)) : undefined,
    page: 1,
  });
}

/**
 * Satış: açık talep süzgeci (kategori SEGMENT düzeyinde; ülke = alıcı
 * ülkesi). Alıcı şehri süzgeci yok (2026-10-04) — API satışta şehri zaten
 * alıcı ülkesine çevirip `city: null` döner.
 */
export function intentToRequestQuery(r: AiSearchIntentResult): string {
  return buildRequestFilterQuery({
    ...EMPTY_REQUEST_FILTERS,
    q: r.query ?? undefined,
    categories: intentCategory(r) ? [segmentOf(intentCategory(r)!.id)] : [],
    countries: r.country ? [r.country] : [],
    page: 1,
  });
}

export interface IntentChip {
  /** Kaldırılınca URL'den silinecek anahtar. */
  param: string;
  label: string;
}

/**
 * Çip metinleri için çevirmen — `web.panel.shell.aiIntentBand` ad alanı.
 * Bu modül React DIŞI (saf fonksiyon), hook çağıramaz: çizen bileşen
 * (`AiIntentBand`) kendi `useTranslations`ını PARAMETRE olarak geçirir.
 */
export type IntentChipT = (key: string, values?: Record<string, string | number>) => string;

/**
 * Çip biçimleyicileri — hepsi okuyucunun dilinde; bileşen `@/i18n/domain`
 * hook'larından kurar (faaliyet tipi, birim, şehir, ülke adı). Eskiden
 * Türkçe sözlük ve `"tr-TR"` sayı biçimi sabitti (EN/RU arayüzde Türkçe çip).
 */
export interface IntentChipFormat {
  t: IntentChipT;
  locale: string;
  activityLabel: (code: string) => string;
  /** Miktar + birim, dilin çoğul kuralıyla (`useQuantityLabel`). */
  quantity: (qty: number, unit: string) => string;
  cityLabel: (city: string) => string;
  countryLabel: (code: string) => string;
  /**
   * Kategori çipinin adı — verilirse sunucunun yaprak adı yerine bu basılır.
   * Satışta süzgeç SEGMENT'e iner (`intentToRequestQuery`); çip yaprak adını
   * ("Kollar veya tokmaklar") yazarken uygulanan süzgeç bütün segmentti
   * (arayüz testi D-276). Bant segment adını listeyle aynı kaynaktan verir.
   */
  categoryLabel?: (code: string) => string | undefined;
}

/** Yorumun parçalarından URL'de HÂLÂ duranlar — çip olarak. */
export function intentChips(r: AiSearchIntentResult, sp: URLSearchParams, f: IntentChipFormat): IntentChip[] {
  const { t } = f;
  const out: IntentChip[] = [];
  const has = (k: string) => sp.has(k) && sp.get(k) !== "";
  if (r.query && has("q")) out.push({ param: "q", label: t("chipArama", { query: r.query }) });
  const category = intentCategory(r);
  if (category && has("kategori"))
    out.push({
      param: "kategori",
      label: t("chipKategori", { name: f.categoryLabel?.(category.id) ?? category.name }),
    });
  if (r.city && has("sehir"))
    out.push({ param: "sehir", label: t("chipSehir", { city: r.cityName ?? f.cityLabel(r.city) }) });
  // Ülke: ürün dizininde satıcının, açık taleplerde alıcının ülkesi.
  if (r.country && has("ulke")) out.push({ param: "ulke", label: t("chipUlke", { country: f.countryLabel(r.country) }) });
  if (r.portal === "satinalma") {
    if (r.verifiedOnly && has("dogrulanmis")) out.push({ param: "dogrulanmis", label: t("chipDogrulanmisFirma") });
    if (r.activity && has("faaliyet")) out.push({ param: "faaliyet", label: f.activityLabel(r.activity) });
    if (r.priceMax != null && has("fiyatMax"))
      out.push({
        param: "fiyatMax",
        label: t("chipBirimFiyatMax", {
          value: r.currency
            ? affixCurrency(formatNumber(r.priceMax, f.locale), r.currency, f.locale)
            : formatNumber(r.priceMax, f.locale),
        }),
      });
    if (r.quantity != null && has("moqMax"))
      out.push({
        param: "moqMax",
        label: t("chipMinSiparisMax", {
          value: r.unit
            ? f.quantity(Math.trunc(r.quantity), r.unit)
            : formatNumber(Math.trunc(r.quantity), f.locale),
        }),
      });
  }
  return out;
}
