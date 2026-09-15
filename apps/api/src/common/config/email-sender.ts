import type { ConfigService } from "@nestjs/config";

/**
 * GÖNDEREN ADRESİ SAĞLIK KONTROLÜ — saf fonksiyon (test edilebilir) + boot
 * assert (fail-closed). `prod-config-sanity.ts` ve `web-url.ts` ile aynı kalıp.
 *
 * CANLI BUG (2026-09-13, ölçülerek bulundu): canlı `EMAIL_FROM_ADDRESS`
 * `onboarding@resend.dev` idi; DEMO ortamı ise doğru şekilde `@rothern.com`
 * kullanıyordu. Yani kurulum TERSİNE dönmüştü. Sonuç: doğrulama kodu, davet ve
 * sipariş bildirimi dahil MÜŞTERİYE GİDEN HER E-POSTA sağlayıcının test alan
 * adından çıkıyordu.
 *
 * Neden bu kadar önemli: kurumsal posta sunucuları (müşterilerin hepsi kurumsal)
 * tanımadığı bir alan adından gelen toplu postayı spam'e atar; atmasa bile
 * B2B alıcı "resend.dev" gördüğü an güvenmez. Alan adı doğrulaması ZATEN
 * yapılmıştı (SPF + DKIM kayıtları yerinde), yalnız canlı ayarı güncellenmemişti.
 *
 * Hata SESSİZDİ: e-postalar başarıyla gidiyordu, günlükte hata yoktu, testler
 * yeşildi. Tek belirtisi müşterinin kutusunda görülebilirdi. Bu yüzden koruma
 * "uyarı" değil, BOOT KAPISI: canlı yanlış adresle açılmayı reddeder.
 *
 * KAPSAM: `NODE_ENV=production` ile koşan HER ortam (staging dahil — Render'da
 * o da production kipindedir).
 *
 * BEKLENEN ALAN ADI SİTENİN KENDİ ALAN ADIDIR (2026-09-16). Kural önce sabit
 * `rothern.com` idi; staging ayrı bir kayıtlı alan adına taşınınca
 * (`staging.supkeys.com`) doğru gönderen `staging@supkeys.com` oldu ve kapı
 * staging'i AÇILIŞTA ÖLDÜRDÜ ("No open ports detected"). Sabit alan adı yerine
 * `WEB_URL`den türetiyoruz: her ortam kendi alan adından gönderir, sağlayıcı
 * test alan adı (resend.dev) her ortamda reddedilmeye devam eder. Yeni ortam
 * değişkeni EKLENMEDİ — ayrı bir değişken olsaydı biri unutulduğu gün kapı ya
 * gevşer ya da yine boot'u keserdi.
 */

/** `WEB_URL` okunamazsa düşülen alan adı (canlı). */
export const CANONICAL_EMAIL_DOMAIN = "rothern.com";

/** "staging.supkeys.com" → "supkeys.com" (iki etiketlik kayıtlı alan adı; kendi
 *  alan adlarımızın hepsi bu biçimde — `co.uk` gibi çok etiketli son ekler
 *  kullanılmıyor). */
function registrableDomain(host: string): string {
  const parts = host.trim().toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  return parts.length <= 2 ? parts.join(".") : parts.slice(-2).join(".");
}

/** Bu ortamın gönderebileceği alan adı — sitenin kendi alan adı. */
export function expectedSenderDomain(webUrl: string | undefined): string {
  try {
    const host = new URL((webUrl ?? "").trim()).hostname;
    const domain = registrableDomain(host);
    // localhost / tek etiketli host → kanonik alan adına düş (prod'da WEB_URL
    // zaten `assertProdWebUrl` ile doğrulanıyor).
    return domain.includes(".") ? domain : CANONICAL_EMAIL_DOMAIN;
  } catch {
    return CANONICAL_EMAIL_DOMAIN;
  }
}

export type ProdSenderRejection = "missing" | "not_canonical";

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at < 0 ? "" : address.slice(at + 1).trim().toLowerCase();
}

/**
 * Canlı gönderen adresi reddedilmeli mi? Kabul → `null`, aksi halde sebep.
 *
 * Sitenin alan adı ve alt alan adları (`send.rothern.com`) kabul edilir;
 * sağlayıcı test alan adları (`resend.dev`, `example.com` …) ve boş değer
 * reddedilir.
 * Kasıtlı olarak BEYAZ LİSTE: yeni bir sağlayıcının test alan adını tek tek
 * saymak yerine "bizim alan adımız değilse geçmez" kuralı işletilir.
 */
export function checkProdSenderDomain(env: {
  nodeEnv: string | undefined;
  fromAddress: string | undefined;
  /** Bu ortamın site kökü — beklenen alan adı buradan türer. */
  webUrl?: string | undefined;
}): ProdSenderRejection | null {
  if (env.nodeEnv !== "production") return null; // yalnız prod

  const address = (env.fromAddress ?? "").trim();
  if (address === "" || !address.includes("@")) return "missing";

  const expected = expectedSenderDomain(env.webUrl);
  const domain = domainOf(address);
  if (domain === expected) return null;
  if (domain.endsWith(`.${expected}`)) return null;

  return "not_canonical";
}

/** Boot guard (fail-closed): reddedilirse THROW → deploy fail. */
export function assertProdEmailSender(config: ConfigService): void {
  const rejection = checkProdSenderDomain({
    nodeEnv: config.get<string>("NODE_ENV"),
    fromAddress: config.get<string>("EMAIL_FROM_ADDRESS"),
    webUrl: config.get<string>("WEB_URL"),
  });
  if (rejection === null) return;

  const seen = (config.get<string>("EMAIL_FROM_ADDRESS") ?? "").trim() || "(boş)";
  if (rejection === "missing") {
    throw new Error(
      "EMAIL_FROM_ADDRESS prod'da ZORUNLU — doğrulama kodu, davet ve sipariş " +
        "bildirimleri bu adresten çıkar. Örnek: bildirim@rothern.com",
    );
  }
  const expected = expectedSenderDomain(config.get<string>("WEB_URL"));
  throw new Error(
    `EMAIL_FROM_ADDRESS bu ortamın alan adında olmalı: "${expected}" (aldı: "${seen}"). ` +
      "Sağlayıcının test alan adından (ör. resend.dev) gönderilen posta kurumsal " +
      "alıcılarda spam'e düşer ve güven kaybettirir. SPF/DKIM kayıtları hazır; " +
      `Render → ilgili servis → EMAIL_FROM_ADDRESS=bildirim@${expected} yapın.`,
  );
}
