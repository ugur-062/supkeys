import { BUYING_TIER, PAID_TIER, tierAtLeast } from "@rothern/shared";
import { userHasPermission, type PermissionSubject } from "@/lib/company/permissions";

/**
 * ÜYE EYLEM KAPISI — satın alma tarafı eylemlerinin (bilgi talebi, talep açma,
 * satınalma firma dizini) PAKET + İZİN kararı TEK yerde (arayüz testi Y-03,
 * kullanıcı kararı T-02 2026-10-01).
 *
 * Kök neden: herkese açık ve panel düğmeleri firmanın paketine bakmadan sabit
 * `/company/satinalma/*` adreslerine gidiyordu; satınalma bölümü Gold kapısının
 * arkasında olduğu için ücretsiz ve Silver üye "Bu sayfa Gold paketiyle açılır"
 * duvarına SÜRPRİZ olarak çarpıyordu. Kural (CLAUDE.md): rol denetimi paket
 * denetiminin İÇİNDE — önce paket (Gold), sonra izin.
 *
 * Saf modül: herkese açık istemci adacıkları da panel sayfaları da okur
 * (`web.panel` kataloğuna ve panel modüllerine bağımlılık YOK).
 */
export type BuyingAction = "inquiry" | "listing" | "browse";

export type BuyingGate =
  /** Oturum yok — misafir akışı (giriş/kayıt) aynen kalır. */
  | "guest"
  /** Gold ∧ izin — eylem açık. */
  | "ok"
  /** Gold değil ve firma doğrulanmamış/reddedilmiş — önce ücretsiz doğrulama. */
  | "verify"
  /** Gold değil (doğrulanmış ya da incelemede) — Gold'a geçiş. */
  | "upgrade"
  /** Gold ama üyede eylemin izni yok. */
  | "noPermission";

/** Eylemin API'deki izni (any-of değil, tek izin). */
export const BUYING_ACTION_PERMISSION: Record<BuyingAction, string> = {
  inquiry: "buy:inquiry:send",
  listing: "buy:listing:manage",
  browse: "buy:view",
};

/** Doğrulama sayfası — paket satın almanın tek şartı. */
export const VERIFY_HREF = "/company/ayarlar/dogrulama";
/** Panel içi paket sayfası (`PRICING_HREF` ile aynı adres). */
export const GOLD_HREF = "/company/premium";

export interface GateCompany {
  tier?: string | null;
  companyVerificationStatus?: string | null;
}

export function buyingGate(
  user: PermissionSubject | null | undefined,
  company: GateCompany | null | undefined,
  action: BuyingAction,
): BuyingGate {
  if (!user) return "guest";
  if (!tierAtLeast(company?.tier ?? "STANDART", BUYING_TIER)) return lockedGate(company);
  return userHasPermission(user, BUYING_ACTION_PERMISSION[action]) ? "ok" : "noPermission";
}

/** Paket dışı kapının dalı (Gold için de Silver için de aynı kural). */
function lockedGate(company: GateCompany | null | undefined): "verify" | "upgrade" {
  // SilverLockCard ile aynı kural: incelemedeki (PENDING) firmaya yeniden
  // doğrulama denmez; paket sayfası gerisini söyler.
  const status = company?.companyVerificationStatus;
  return status && status !== "VERIFIED" && status !== "PENDING" ? "verify" : "upgrade";
}

/** Herkese açık talebe teklifin API izni. */
export const PUBLIC_BID_PERMISSION = "sell:bid:submit";

/**
 * HERKESE AÇIK TALEBE TEKLİF KAPISI (arayüz testi webA-02 yeniden doğrulama):
 * PUBLIC talebi görmek ve ona tanımadan teklif vermek Silver ister (CLAUDE.md
 * paket tablosu; API `listingBidEligibility` ücretsiz firmaya bağsız/davetsiz
 * PUBLIC talebi hiç göstermez). Herkese açık "Teklif ver" düğmeleri oturumlu
 * ama Silver olmayan üyeye bunu TIKLAMADAN önce söyler — eskiden "ücretsiz
 * kaydol, teklif ver" deyip paneldeki Silver kilidine düşürüyordu. Sıra
 * aynı: önce paket (Silver), sonra izin (`sell:bid:submit`).
 */
export function publicBidGate(
  user: PermissionSubject | null | undefined,
  company: GateCompany | null | undefined,
): BuyingGate {
  if (!user) return "guest";
  if (!tierAtLeast(company?.tier ?? "STANDART", PAID_TIER)) return lockedGate(company);
  return userHasPermission(user, PUBLIC_BID_PERMISSION) ? "ok" : "noPermission";
}

/** Bağlantı davetinin API izni (Bağlantılar sayfası ve panel firma kartıyla aynı). */
export const CONNECT_PERMISSION = "connections:manage";

/**
 * BAĞLANTI DAVETİ KAPISI (arayüz testi kapanış S-PUB-ADMIN): herkese açık firma
 * profilindeki "Bağlantı isteği gönder" eskiden oturuma bakmıyordu — ücretsiz
 * üye düğmeye basıp ancak panel firma kartında Silver kilidini görüyordu.
 * Davet Silver ister (API invite aynası, kullanıcı kararı T-02); sıra aynı:
 * önce paket, sonra izin (`connections:manage`).
 */
export function connectGate(
  user: PermissionSubject | null | undefined,
  company: GateCompany | null | undefined,
): BuyingGate {
  if (!user) return "guest";
  if (!tierAtLeast(company?.tier ?? "STANDART", PAID_TIER)) return lockedGate(company);
  return userHasPermission(user, CONNECT_PERMISSION) ? "ok" : "noPermission";
}

/** Kapalı kapının birincil eylemi (verify → doğrulama, upgrade → paketler). */
export function gateHref(gate: BuyingGate): string | null {
  if (gate === "verify") return VERIFY_HREF;
  if (gate === "upgrade") return GOLD_HREF;
  return null;
}

/**
 * Üyenin ürün sayfası — paket bilmeyen TEK iniş adresi. Herkese açık sayfadaki
 * giriş/kayıt dönüşü ve panel kartları buraya gider; sayfa Gold ∧ satınalma
 * görüntüleme yetkilisini satınalma ürün sayfasına geçirir, diğerlerine ürünü
 * panel kabuğunda Gold uyarısıyla gösterir (yüzeyde Gold duvarı YOK).
 */
export function memberProductPath(companySlug: string, productSlug: string): string {
  return `/company/urun/${encodeURIComponent(companySlug)}/${encodeURIComponent(productSlug)}`;
}

/**
 * Paneldeki ürün kartının hedefi: Gold ∧ satınalma görüntüleme doğrudan
 * satınalma ürün sayfasına (ara sıçrama yok), diğerleri üyenin ürün sayfasına.
 */
export function memberProductHref(
  user: PermissionSubject | null | undefined,
  company: GateCompany | null | undefined,
  companySlug: string,
  productSlug: string,
): string {
  return buyingGate(user, company, "browse") === "ok"
    ? `/company/satinalma/urunler/${encodeURIComponent(companySlug)}/${encodeURIComponent(productSlug)}`
    : memberProductPath(companySlug, productSlug);
}

/** Üyenin firma dizini — paket/izne göre satınalma ya da satış dizinine yönlendiren iniş adresi. */
export const MEMBER_DIRECTORY_PATH = "/company/firma-dizini";

/**
 * Firma dizini hedefi: Gold ∧ buy:view → satınalma dizini; satış görüntüleme
 * izni → satış dizini (Gold olmayan firmalar için zaten var); ikisi de yoksa
 * satınalma dizini (paket kapısı ne gerektiğini söyler).
 */
export function memberDirectoryTarget(
  user: PermissionSubject | null | undefined,
  company: GateCompany | null | undefined,
): string {
  if (buyingGate(user, company, "browse") === "ok") return "/company/satinalma/firmalar";
  if (userHasPermission(user, "sell:view")) return "/company/satis/firmalar";
  return "/company/satinalma/firmalar";
}
