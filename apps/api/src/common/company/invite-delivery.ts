import type { Locale } from "@rothern/i18n";
import { countryName, isValidCountryCode, provinceDisplayName } from "@rothern/shared";

/**
 * DAVET E-POSTASI TESLİM DURUMU — tek kaynak (2026-09-27 davet denetimi).
 *
 * Eskiden ekip daveti, dış talep daveti ve "tedarikçini davet et" e-postaları
 * ateşle-unut gönderiliyor, yanıt gönderimden ÖNCE "gönderildi" diyordu:
 * suppress edilmiş (hard-bounce/şikâyet) adrese ya da Resend hatasında
 * kullanıcı yine "gönderildi (7 gün)" görüyordu. Artık gönderim BEKLENİR ve
 * gerçek sonuç döner. Süre sınırı: e-posta sağlayıcısı takılırsa istek
 * sonsuza dek beklemesin — süre dolarsa FAILED (+ `timedOut`), e-posta yine
 * de sonradan gidebilir (bu yüzden çağıran davet kaydını SİLMEZ).
 */
export type InviteDelivery = "SENT" | "FAILED" | "SUPPRESSED";

export const INVITE_SEND_TIMEOUT_MS = 15_000;

export interface InviteDeliveryResult {
  delivery: InviteDelivery;
  /** Süre sınırına takıldı — sonuç bilinmiyor, e-posta geç de olsa gidebilir. */
  timedOut?: boolean;
  error?: string;
}

/** `EmailService.send` sözleşmesi: suppress'te hata ATMAZ, `sent:false` döner. */
export async function deliverInvite(
  send: () => Promise<{ sent: boolean }>,
  timeoutMs = INVITE_SEND_TIMEOUT_MS,
): Promise<InviteDeliveryResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => resolve("timeout"), timeoutMs);
  });
  try {
    const res = await Promise.race([send(), timeout]);
    if (res === "timeout") return { delivery: "FAILED", timedOut: true };
    return { delivery: res.sent ? "SENT" : "SUPPRESSED" };
  } catch (err) {
    return {
      delivery: "FAILED",
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * "Tedarikçini davet et" (referral) frenleri — `invite-by-email` ve `/batch`
 * ORTAK tavanı. Dış talep daveti (20/gün, ilan bağlamlı) AYRI sayılır; o
 * yol tek seferlik ve talep bağlamlı olduğu için daha sıkı. 50: toplu davet
 * diyaloğunun tek seferlik üst sınırıyla aynı — bir firma günde bir tam
 * liste gönderebilir, ikincisi ertesi güne kalır (gönderen itibarı).
 */
export const REFERRAL_DAILY_CAP = 50;
/** Aynı firmadan aynı adrese bu süre içinde ikinci davet GİTMEZ (ALREADY_INVITED). */
export const REFERRAL_RESEND_COOLDOWN_DAYS = 7;
/**
 * Davet bağlantısının ömrü — son gönderimden (kayıt `updatedAt`i; her yeniden
 * gönderimde ilerletilir) itibaren. Süresi geçen token kayıtta YOK sayılır.
 * Şema değişikliği yok: tarih mevcut sütundan hesaplanır.
 */
export const REFERRAL_TTL_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export function isReferralExpired(lastSentAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - lastSentAt.getTime() > REFERRAL_TTL_DAYS * DAY_MS;
}

export function referralCooldownStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - REFERRAL_RESEND_COOLDOWN_DAYS * DAY_MS);
}

/**
 * E-postada son teklif tarihi — HER ZAMAN Europe/Istanbul duvar saatiyle ve
 * alıcının (burada davet edenin) dilinde. Eskiden ham UTC tarihi
 * (`toISOString().slice(0, 10)`) basılıyordu: İstanbul'da 00:00–03:00 arası
 * kapanan talep bir gün ÖNCESİNİ gösteriyordu. Saat de yazılır (kapanış saatli)
 * ve saat dilimi ibaresi eklenir — yabancı alıcı hangi saat olduğunu bilsin.
 */
export const APP_TIME_ZONE = "Europe/Istanbul";

export function formatInviteDeadline(d: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

/**
 * Dış talep davetinde gösterilen kalem sayısı — e-posta cazip olsun ama
 * talebin tamamını dökmesin; kalanı "+N kalem daha" (2026-09-27).
 */
export const INVITE_ITEM_PREVIEW = 10;

/**
 * Dış davetten önce talep çevirisinin (alıcının dili) en fazla ne kadar
 * bekleneceği — kullanıcı kararı "~60 sn"; dolarsa özgün metinle gider.
 */
export const INVITE_TRANSLATION_WAIT_MS = 60_000;

/** Rus/İngiliz adı ISO'da olmayan kodlar (KKTC) — `Intl` tanımaz. */
const NON_ISO_COUNTRY: Partial<Record<Locale, Record<string, string>>> = {
  en: { XN: "Northern Cyprus" },
  ru: { XN: "Северный Кипр" },
};

/**
 * Ülke adı alıcının dilinde: Türkçe paylaşılan statik listeden (web ile
 * aynı ad), diğer diller `Intl.DisplayNames` (web `countryDisplayName`in
 * sunucu karşılığı; e-posta sunucuda üretildiği için ICU farkı sorun değil).
 */
export function inviteCountryName(code: string, locale: Locale): string {
  const cc = code.trim().toUpperCase();
  const override = NON_ISO_COUNTRY[locale]?.[cc];
  if (override) return override;
  if (locale !== "tr" && /^[A-Z]{2}$/.test(cc) && cc !== "XN") {
    try {
      const name = new Intl.DisplayNames([locale], { type: "region" }).of(cc);
      if (name && name !== cc) return name;
    } catch {
      // eski çalışma zamanı — Türkçe ada düş
    }
  }
  return countryName(cc);
}

/**
 * Teslim yeri — YALNIZ şehir + ülke, alıcının dilinde ("Munich, Germany",
 * "Стамбул, Турция"). Tam adres (sokak, posta kodu, ilçe) davet e-postasına
 * ASLA girmez: alıcı henüz tanınmayan bir firma ve adres alıcının kimliğini
 * ele verir (herkese açık talep sayfasıyla aynı ilke — nitelik, kimlik değil).
 */
export function formatInvitePlace(
  city: string | null | undefined,
  country: string | null | undefined,
  locale: Locale,
): string | null {
  const cityLabel = provinceDisplayName(city, locale);
  const cc = (country ?? "").trim().toUpperCase();
  const countryLabel = cc && isValidCountryCode(cc) ? inviteCountryName(cc, locale) : "";
  const parts = [cityLabel, countryLabel].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
