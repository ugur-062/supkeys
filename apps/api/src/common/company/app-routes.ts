import { DEFAULT_LOCALE, translateRoutePath, type Locale } from "@rothern/i18n";

/**
 * Web uygulamasının derin bağlantıları — TEK KAYNAK (denetim Dalga B-2, P10).
 *
 * E-posta ve bildirim CTA'ları 51 çağrı yerinde elle şablon-literal olarak
 * kuruluyordu (`${this.webUrl()}/company/ilan/${id}` gibi). Bir rota değişince
 * (ör. `/company/siparis` → `/company/siparisler`) hepsini bulmak grep'e
 * kalıyor ve kaçırılan biri KIRIK bir CTA olarak kullanıcıya gidiyordu —
 * e-posta gönderildikten sonra düzeltilemez.
 *
 * Kullanım: `appRoutes.listing(this.webUrl(), listingId)`.
 *
 * DİL (i18n Faz 3): her yardımcının SON parametresi `locale` (varsayılan
 * `tr` → bugünkü adresler birebir korunur). Bildirim ve e-posta ALICININ
 * dilini kullandığı için CTA adresi de o dilin biçiminde üretilmeli:
 * yol parçaları `@rothern/i18n` `ROUTE_PATHNAMES` ile çevrilir
 * (`/company/ilan/<id>` → `/company/request/<id>` → `/kompaniya/zayavka/<id>`)
 * ve Türkçe dışındaki diller `/<dil>` ön eki alır. Sorgu dizesi korunur.
 */

/**
 * İÇ (Türkçe, ön eksiz) yol → o dilin DIŞ adresi. Web'deki `localizePath`in
 * aynısı; ayrışmasınlar diye ikisi de `ROUTE_PATHNAMES`ten okur.
 */
const ABSOLUTE_URL = /^(https?:\/\/[^/]+)(\/[\s\S]*)?$/i;

/**
 * TEK KAYNAK: iç (Türkçe, ön eksiz) yol → o dilin DIŞ adresi. Bildirim CTA'sı
 * ve e-posta bağlantıları da bunu kullanır (üç ayrı kopya vardı, birleştirildi).
 * Mutlak adres verilirse köken ayrılır, yalnız yol çevrilir ve köken geri eklenir.
 * `mailto:`, protokol-göreli (`//…`) ve göreli adresler OLDUĞU GİBİ döner.
 */
export function localizeAppPath(path: string, locale: Locale): string {
  const abs = ABSOLUTE_URL.exec(path);
  const origin = abs ? abs[1]! : "";
  const inner = abs ? (abs[2] ?? "/") : path;
  if (!inner.startsWith("/") || inner.startsWith("//")) return path;
  const outer = translateRoutePath(inner, locale);
  if (locale === DEFAULT_LOCALE) return `${origin}${outer}`;
  return `${origin}${outer === "/" ? `/${locale}` : `/${locale}${outer}`}`;
}

const localize = localizeAppPath;

export const appRoutes = {
  home: (base: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize("/company", locale)}`,
  listing: (base: string, listingId: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize(`/company/ilan/${listingId}`, locale)}`,
  order: (base: string, orderId: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize(`/company/siparis/${orderId}`, locale)}`,
  approvals: (base: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize("/company/onaylar", locale)}`,
  premium: (base: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize("/company/premium", locale)}`,
  messagesWith: (
    base: string,
    companyId: string,
    locale: Locale = DEFAULT_LOCALE,
  ) => `${base}${localize(`/company/mesajlar?with=${companyId}`, locale)}`,
  /** Ürünlerime GELEN bilgi talepleri (satıcı gözü). */
  inquiriesReceived: (base: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize("/company/satis/bilgi-talepleri", locale)}`,
  /** GÖNDERDİĞİM bilgi talepleri (alıcı gözü) — ayrı portal, ayrı rota. */
  inquiriesSent: (base: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize("/company/satinalma/bilgi-taleplerim", locale)}`,

  // ── Jetonlu bağlantılar (alıcısı henüz üye olmayabilir) ────────────────
  // Dil, E-POSTANIN dilidir: bağlantı metinle aynı dilde açılsın. Alıcının
  // kayıtlı dili yoksa çağıran DEFAULT_LOCALE geçer (bugünkü davranış).
  /** Ekip daveti kabul sayfası. */
  invite: (base: string, token: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize(`/company/davet/${token}`, locale)}`,
  /** Referans/dış davetten kayıt (token sorgu dizesinde). */
  signupWithRef: (base: string, token: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize(`/company/kayit?ref=${token}`, locale)}`,
  /** Davet e-postalarından çıkış (opt-out). */
  optOut: (base: string, token: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize(`/davet-kapat?token=${token}`, locale)}`,
  /** Misafir bilgi talebi e-posta doğrulaması. */
  inquiryVerify: (base: string, token: string, locale: Locale = DEFAULT_LOCALE) =>
    `${base}${localize(`/talep-onayla?t=${token}`, locale)}`,
} as const;
