/**
 * Mobil uygulama ↔ alan adı bağı (Android App Links + iOS Universal Links).
 *
 * İki mağaza da `https://www.rothern.com/.well-known/…` altındaki dosyadan
 * "bu alan adı şu uygulamaya güveniyor" beyanını okur; beyan varsa e-postadaki
 * rothern.com bağlantıları tarayıcı yerine uygulamada açılır.
 *
 * Kimlikler env'den gelir (Vercel): imza parmak izi ve Apple takım kimliği
 * mağaza hesapları açılınca belli olur, ortama göre de değişebilir. Env yoksa
 * ya da biçimi bozuksa rota 404 döner — yarım beyan yayınlanmaz.
 *
 * `MOBILE_APP_ID` kabuğun `mobile/capacitor.config.ts` `appId`si ile AYNI
 * olmalı; yayından sonra değiştirilemez.
 */
export const MOBILE_APP_ID = "com.rothern.app";

/** SHA-256 imza parmak izi: iki noktayla ayrılmış 32 bayt (AA:BB:…). */
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
/** Apple takım kimliği: 10 büyük harf/rakam. */
const APPLE_TEAM_ID = /^[A-Z0-9]{10}$/;

type Env = Record<string, string | undefined>;

/** Virgüllü `MOBILE_ANDROID_SHA256` → geçerli parmak izleri (yükleme + Play imzası). */
export function androidFingerprints(env: Env): string[] {
  return (env.MOBILE_ANDROID_SHA256 ?? "")
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => SHA256_FINGERPRINT.test(part));
}

export function appleTeamId(env: Env): string | null {
  const value = (env.MOBILE_IOS_TEAM_ID ?? "").trim().toUpperCase();
  return APPLE_TEAM_ID.test(value) ? value : null;
}

/** `/.well-known/assetlinks.json` gövdesi; parmak izi yoksa null. */
export function androidAssetLinks(env: Env): object[] | null {
  const fingerprints = androidFingerprints(env);
  if (fingerprints.length === 0) return null;
  return [
    {
      relation: [
        "delegate_permission/common.handle_all_urls",
        "delegate_permission/common.get_login_creds",
      ],
      target: {
        namespace: "android_app",
        package_name: MOBILE_APP_ID,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

/**
 * `/.well-known/apple-app-site-association` gövdesi; takım kimliği yoksa null.
 * Rota işleyicileri (`/api/*`: tek tık e-posta çıkışı, SEO tazeleme) ve Next
 * varlıkları uygulamaya DEVREDİLMEZ — sayfa değiller, tarayıcıda kalmalılar.
 */
export function appleAppSiteAssociation(env: Env): object | null {
  const teamId = appleTeamId(env);
  if (!teamId) return null;
  const appId = `${teamId}.${MOBILE_APP_ID}`;
  return {
    applinks: {
      details: [
        {
          appIDs: [appId],
          components: [
            { "/": "/api/*", exclude: true },
            { "/": "/_next/*", exclude: true },
            { "/": "*" },
          ],
        },
      ],
    },
    webcredentials: { apps: [appId] },
  };
}

/** İki rota aynı yanıt biçimini kullanır: JSON, bir saat önbellek, yoksa 404. */
export function appLinkResponse(body: object | null): Response {
  if (!body) return new Response(null, { status: 404 });
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
