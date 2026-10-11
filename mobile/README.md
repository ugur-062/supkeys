# Rothern mobil kabuğu (Android + iOS)

Capacitor kabuğu: uygulama canlı `https://www.rothern.com` sitesini kendi WebView'inde açar
(başlangıç `/company`). Web'e çıkan her değişiklik mağaza güncellemesi olmadan uygulamaya yansır;
mağazaya yeni sürüm yalnız bu klasör değişince gönderilir.

Bu klasör pnpm çalışma alanının **dışındadır** (Render / Vercel derlemelerini etkilemez) ve **npm** ile kurulur.

## Mac'te ilk kurulum

Gerekenler: Node 22, güncel Xcode, güncel Android Studio.

```bash
cd mobile
npm install
npx cap sync
```

`cap sync` her `capacitor.config.ts`, `www/` ya da eklenti değişikliğinden sonra yeniden koşulur.

## Çalıştırma

```bash
npx cap open ios
```

Xcode'da: App hedefi → Signing & Capabilities → Team seç → bir iPhone simülatöründe çalıştır.

```bash
npx cap open android
```

Android Studio'da: Gradle eşitlemesi bitince bir emülatörde çalıştır.

Staging'i açan deneme derlemesi (mağazaya GÖNDERİLMEZ):

```bash
npm run sync:staging
```

Mağaza paketinden önce yeniden düz `npx cap sync`.

## Mağaza paketi

- **Android:** Android Studio → Build → Generate Signed App Bundle (`.aab`). İlk seferde yükleme anahtarı
  (keystore) oluşturulur; dosya ve şifresi depoya KONMAZ, güvenli yerde saklanır (kaybolursa güncelleme
  gönderilemez). Her gönderimde `android/app/build.gradle` `versionCode` bir artar.
- **iOS:** Xcode → Product → Archive → Distribute App → App Store Connect. Her gönderimde build numarası
  (`CURRENT_PROJECT_VERSION`) bir artar.

## Bağlantıların uygulamada açılması

E-postadaki rothern.com bağlantılarının uygulamada açılması için web tarafında (Vercel, production) iki
değişken girilir ve web yeniden dağıtılır:

| Değişken | Değer |
|---|---|
| `MOBILE_ANDROID_SHA256` | Play Console → Uygulama bütünlüğü → uygulama imzalama VE yükleme anahtarının SHA-256 parmak izleri, virgülle |
| `MOBILE_IOS_TEAM_ID` | Apple Developer → Membership → Team ID (10 karakter) |

Doğrulama: `https://www.rothern.com/.well-known/assetlinks.json` ve
`https://www.rothern.com/.well-known/apple-app-site-association` 200 dönmeli (değişken yokken 404).

## Değişmeyenler

- `appId` `com.rothern.app` — mağaza kaydından sonra değiştirilemez; web tarafındaki eşi
  `apps/web/src/lib/mobile-app-links.ts` `MOBILE_APP_ID`.
- İkon ve açılış görselleri `node mobile/scripts/generate-assets.mjs` ile marka işaretinden üretilir.
- Uygulama yalnız iPhone hedefler (iPad desteği sonradan eklenebilir, eklendikten sonra kaldırılamaz).
