/**
 * ALICI İZİN LİSTESİ — STAGING E-POSTA FRENİ (2026-10-05, sahip kararı).
 *
 * Staging (e2e koşuları, zamanlayıcılar) ORTAK `rothern.com` gönderenden
 * sahibin Gmail artı-adreslerine her gün yüzlerce test e-postası yolluyordu;
 * Gmail bunları toplu posta saydı ve Rothern e-postalarını Promosyonlar'a
 * atmaya başladı — canlı alan adının itibarı açılıştan önce zedelendi.
 *
 * `EMAIL_ALLOWLIST` (virgülle ayrılmış) doluysa listede OLMAYAN alıcıya giden
 * e-posta sağlayıcıya GİTMEZ: `EmailService` satırı yine yazar ve çizer
 * (konu + payload günlükte kalır — e2e içeriği oradan okur), sonra FAILED +
 * `suppressed: allowlist …` ile kapatır; `sent:false`, yeniden deneme/alarm
 * yok. Boş ya da tanımsız (canlı) = kapı yok, davranış birebir aynı.
 *
 * SÖZDİZİMİ (büyük/küçük harf duyarsız, boşluk yok sayılır):
 * - tam adres: `uguray156@gmail.com` — artı adresi dahil BİREBİR eşleşir;
 *   `uguray156@gmail.com` girdisi `uguray156+x@gmail.com`u KAPSAMAZ.
 * - `*` joker: adresin yerel kısmında ya da alan adında herhangi bir dizi
 *   (boş dahil) yerine geçer, `@` işaretini aşmaz: `*@firma.com`,
 *   `uguray156+qa-kayit-*@gmail.com`.
 * Her girdide tam bir `@` olmalı; geçersiz girdi yok sayılır ve açılışta
 * uyarı yazılır. Değişken dolu ama geçerli girdi yoksa kapı KAPALI kalır
 * (hiçbir alıcıya gönderilmez): yanlış yazılmış bir değer staging'i sessizce
 * herkese göndermeye döndürmesin.
 *
 * Saf modül: DB'ye gitmez; değer süreç açılışında bir kez okunur.
 */

export const EMAIL_ALLOWLIST_ENV = "EMAIL_ALLOWLIST";

export interface EmailAllowlist {
  /** Geçerli girdi sayısı (açılış günlüğü — girdilerin kendisi yazılmaz). */
  readonly size: number;
  /** Geçersiz sayılıp atlanan girdi sayısı. */
  readonly invalid: number;
  /** Alıcı listede mi? */
  allows(email: string): boolean;
}

function normalize(value: string): string {
  // Sondaki kök noktası ("firma.com.") aynı alan adıdır.
  return value.trim().toLowerCase().replace(/\.+$/, "");
}

function isValidEntry(entry: string): boolean {
  const at = entry.indexOf("@");
  return at > 0 && at === entry.lastIndexOf("@") && at < entry.length - 1;
}

function globToRegExp(entry: string): RegExp {
  const body = entry
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join("[^@]*");
  return new RegExp(`^${body}$`);
}

/**
 * Ham env değerinden izin listesi. Yalnız boş / tanımsız / yalnız boşluk →
 * `null` (kapı yok). Girdiler virgülle ayrılır; adreste boşluk olamayacağı
 * için satır sonu ve boşluk da ayraç sayılır. Yalnız ayraçtan oluşan dolu
 * değer (",", " ; ,") geçerli girdisi olmayan değer gibi KAPALI kapıdır
 * (`size` 0) — panelde yarım düzenlenmiş değer herkese göndermeye dönmesin.
 */
export function parseEmailAllowlist(raw: string | null | undefined): EmailAllowlist | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return null;
  const entries = trimmed
    .split(/[,;\s]+/)
    .map(normalize)
    .filter((e) => e !== "");

  const exact = new Set<string>();
  const patterns: RegExp[] = [];
  let invalid = 0;
  for (const entry of entries) {
    if (!isValidEntry(entry)) {
      invalid++;
      continue;
    }
    if (entry.includes("*")) patterns.push(globToRegExp(entry));
    else exact.add(entry);
  }

  return {
    size: exact.size + patterns.length,
    invalid,
    allows(email: string): boolean {
      const value = normalize(email ?? "");
      if (exact.has(value)) return true;
      return patterns.some((re) => re.test(value));
    },
  };
}
