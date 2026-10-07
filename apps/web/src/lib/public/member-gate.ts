import { BUYING_TIER, PAID_TIER, tierAtLeast } from "@rothern/shared";
import { userHasPermission, type PermissionSubject } from "@/lib/company/permissions";

/**
 * ÜYE EYLEM KAPISI — satın alma tarafı eylemlerinin (bilgi talebi, talep açma,
 * satınalma firma dizini) YETKİ + İZİN kararı TEK yerde (arayüz testi Y-03,
 * kullanıcı kararı T-02 2026-10-01).
 *
 * ÜCRETSİZ DÖNEM (kullanıcı kararı 2026-10-07): satın alınacak bir şey yok;
 * DOĞRULANMIŞ her firma tam yetkilidir. API `company.tier` alanında EFEKTİF
 * kademeyi taşır (tek kaynak `apps/api/.../effective-tier.ts`), bu yüzden
 * kademe karşılaştırması burada AYNEN durur — ücretli dönem geri geldiğinde
 * makine hazır. Değişen yalnız kapalı kapının anlamı ve hedefi: kullanıcıya
 * kademe adı ya da fiyat söylenmez, "firma doğrulaması gerekir" denir ve
 * doğrulama sayfasına gidilir.
 *
 * Kural (CLAUDE.md): rol denetimi yetki (kademe) denetiminin İÇİNDE — önce
 * firmanın yetkisi, sonra kullanıcının izni.
 *
 * Saf modül: herkese açık istemci adacıkları da panel sayfaları da okur
 * (`web.panel` kataloğuna ve panel modüllerine bağımlılık YOK).
 */
export type BuyingAction = "inquiry" | "listing" | "browse";

export type BuyingGate =
  /** Oturum yok — misafir akışı (giriş/kayıt) aynen kalır. */
  | "guest"
  /** Tam yetki ∧ izin — eylem açık. */
  | "ok"
  /** Yetki yok ve firma doğrulanmamış/reddedilmiş — doğrulama (yeniden başvuru). */
  | "verify"
  /**
   * Yetki yok ama doğrulama başvurusu YAPILAMAZ: inceleme sürüyor (PENDING).
   * Değerin adı ücretli dönemden kalma iç tanımlayıcıdır (panel bileşenleri
   * de okur); kullanıcıya "doğrulamanız inceleniyor" denir.
   */
  | "upgrade"
  /** Tam yetkili firma ama üyede eylemin izni yok. */
  | "noPermission";

/** Eylemin API'deki izni (any-of değil, tek izin). */
export const BUYING_ACTION_PERMISSION: Record<BuyingAction, string> = {
  inquiry: "buy:inquiry:send",
  listing: "buy:listing:manage",
  browse: "buy:view",
};

/** Doğrulama sayfası — tam yetkinin tek şartı (başvuru, inceleme durumu, yeniden başvuru). */
export const VERIFY_HREF = "/company/ayarlar/dogrulama";
/**
 * Kapalı kapının kullanıcıya anlatılacak aşaması (metin seçimi için):
 * başvurulmamış → "doğrulayın", incelemede → "doğrulamanız inceleniyor",
 * reddedilmiş → "yeniden başvurun".
 */
export type VerificationStage = "verify" | "pending" | "reapply";

export function verificationStage(company: GateCompany | null | undefined): VerificationStage {
  const status = company?.companyVerificationStatus;
  if (status === "PENDING") return "pending";
  if (status === "REJECTED") return "reapply";
  return "verify";
}

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

/** Yetkisiz kapının dalı (her eylem için aynı kural). */
function lockedGate(company: GateCompany | null | undefined): "verify" | "upgrade" {
  // İncelemedeki (PENDING) firmaya yeniden doğrulama denmez; doğrulama sayfası
  // inceleme durumunu gösterir.
  const status = company?.companyVerificationStatus;
  return status && status !== "VERIFIED" && status !== "PENDING" ? "verify" : "upgrade";
}

/** Herkese açık talebe teklifin API izni. */
export const PUBLIC_BID_PERMISSION = "sell:bid:submit";

/**
 * HERKESE AÇIK TALEBE TEKLİF KAPISI (arayüz testi webA-02 yeniden doğrulama):
 * PUBLIC talebi tam görmek ve ona tanımadan teklif vermek yetki ister (API
 * `listingBidEligibility` doğrulanmamış firmaya bağsız/davetsiz PUBLIC talebin
 * tam detayını açmaz — yalnız alıcı gizli maskeli satır/görünüm, 2026-10-03).
 * Herkese açık "Teklif ver" düğmeleri oturumlu ama yetkisiz üyeye bunu
 * TIKLAMADAN önce söyler — eskiden "ücretsiz kaydol, teklif ver" deyip
 * paneldeki kilide düşürüyordu. Sıra aynı: önce firmanın yetkisi, sonra izin
 * (`sell:bid:submit`).
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
 * profilindeki "Bağlantı isteği gönder" eskiden oturuma bakmıyordu — yetkisiz
 * üye düğmeye basıp ancak panel firma kartında kilidi görüyordu. Davet yetki
 * ister (API invite aynası, kullanıcı kararı T-02); sıra aynı: önce firmanın
 * yetkisi, sonra izin (`connections:manage`).
 */
export function connectGate(
  user: PermissionSubject | null | undefined,
  company: GateCompany | null | undefined,
): BuyingGate {
  if (!user) return "guest";
  if (!tierAtLeast(company?.tier ?? "STANDART", PAID_TIER)) return lockedGate(company);
  return userHasPermission(user, CONNECT_PERMISSION) ? "ok" : "noPermission";
}

/**
 * Kapalı kapının birincil eylemi — iki dal da doğrulama sayfasına gider
 * (başvuru / inceleme durumu / yeniden başvuru aynı sayfada).
 */
export function gateHref(gate: BuyingGate): string | null {
  return gate === "verify" || gate === "upgrade" ? VERIFY_HREF : null;
}

/**
 * Üyenin ürün sayfası — yetki bilmeyen TEK iniş adresi. Herkese açık sayfadaki
 * giriş/kayıt dönüşü ve panel kartları buraya gider; sayfa tam yetkili ∧
 * satınalma görüntüleme izinlisini satınalma ürün sayfasına geçirir,
 * diğerlerine ürünü panel kabuğunda doğrulama uyarısıyla gösterir.
 */
export function memberProductPath(companySlug: string, productSlug: string): string {
  return `/company/urun/${encodeURIComponent(companySlug)}/${encodeURIComponent(productSlug)}`;
}

/**
 * Paneldeki ürün kartının hedefi: tam yetki ∧ satınalma görüntüleme doğrudan
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

/** Üyenin firma dizini — yetki/izne göre satınalma ya da satış dizinine yönlendiren iniş adresi. */
export const MEMBER_DIRECTORY_PATH = "/company/firma-dizini";

/**
 * Firma dizini hedefi: tam yetki ∧ buy:view → satınalma dizini; satış
 * görüntüleme izni → satış dizini; ikisi de yoksa satınalma dizini (kapı ne
 * gerektiğini söyler).
 */
export function memberDirectoryTarget(
  user: PermissionSubject | null | undefined,
  company: GateCompany | null | undefined,
): string {
  if (buyingGate(user, company, "browse") === "ok") return "/company/satinalma/firmalar";
  if (userHasPermission(user, "sell:view")) return "/company/satis/firmalar";
  return "/company/satinalma/firmalar";
}
