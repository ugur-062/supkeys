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
 * KAPSAM: yalnız `NODE_ENV=production`. Dev/test/staging inert — staging kendi
 * alt adresini (`staging@rothern.com`) kullanır ve zaten kanonik alan adındadır.
 */

/** Müşteriye giden posta YALNIZ bu alan adından çıkabilir (alt alan adları dahil). */
export const CANONICAL_EMAIL_DOMAIN = "rothern.com";

export type ProdSenderRejection = "missing" | "not_canonical";

function domainOf(address: string): string {
  const at = address.lastIndexOf("@");
  return at < 0 ? "" : address.slice(at + 1).trim().toLowerCase();
}

/**
 * Canlı gönderen adresi reddedilmeli mi? Kabul → `null`, aksi halde sebep.
 *
 * `rothern.com` ve alt alan adları (`send.rothern.com`) kabul edilir; sağlayıcı
 * test alan adları (`resend.dev`, `example.com` …) ve boş değer reddedilir.
 * Kasıtlı olarak BEYAZ LİSTE: yeni bir sağlayıcının test alan adını tek tek
 * saymak yerine "bizim alan adımız değilse geçmez" kuralı işletilir.
 */
export function checkProdSenderDomain(env: {
  nodeEnv: string | undefined;
  fromAddress: string | undefined;
}): ProdSenderRejection | null {
  if (env.nodeEnv !== "production") return null; // yalnız prod

  const address = (env.fromAddress ?? "").trim();
  if (address === "" || !address.includes("@")) return "missing";

  const domain = domainOf(address);
  if (domain === CANONICAL_EMAIL_DOMAIN) return null;
  if (domain.endsWith(`.${CANONICAL_EMAIL_DOMAIN}`)) return null;

  return "not_canonical";
}

/** Boot guard (fail-closed): reddedilirse THROW → deploy fail. */
export function assertProdEmailSender(config: ConfigService): void {
  const rejection = checkProdSenderDomain({
    nodeEnv: config.get<string>("NODE_ENV"),
    fromAddress: config.get<string>("EMAIL_FROM_ADDRESS"),
  });
  if (rejection === null) return;

  const seen = (config.get<string>("EMAIL_FROM_ADDRESS") ?? "").trim() || "(boş)";
  if (rejection === "missing") {
    throw new Error(
      "EMAIL_FROM_ADDRESS prod'da ZORUNLU — doğrulama kodu, davet ve sipariş " +
        "bildirimleri bu adresten çıkar. Örnek: bildirim@rothern.com",
    );
  }
  throw new Error(
    `EMAIL_FROM_ADDRESS canlıda "${CANONICAL_EMAIL_DOMAIN}" alan adında olmalı (aldı: "${seen}"). ` +
      "Sağlayıcının test alan adından (ör. resend.dev) gönderilen posta kurumsal " +
      "alıcılarda spam'e düşer ve güven kaybettirir. SPF/DKIM kayıtları hazır; " +
      "Render → rothern-api → EMAIL_FROM_ADDRESS=bildirim@rothern.com yapın.",
  );
}
