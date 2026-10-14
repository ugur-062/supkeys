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

İki Firebase dosyası (`google-services.json`, `GoogleService-Info.plist`) depoda yok; klondan sonra
"Bildirimler (Firebase)" bölümündeki gibi elle konur. **`google-services.json` yerinde değilken Android
paketi derlenmez:** dosyasız paket, bildirime izin vermiş her kullanıcıda açılıştan 1-2 sn sonra çöker
(Gradle sürüm derlemesini bu yüzden bilerek durdurur).

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

## Android deneme paketi (Mac'siz, bu makinede)

Java 21 ve Android SDK `~/android-sdk` altında kurulu (2026-10-11). Telefona elle kurulan deneme paketi:

```bash
export JAVA_HOME=~/android-sdk/jdk ANDROID_HOME=~/android-sdk PATH=~/android-sdk/jdk/bin:$PATH
cd mobile && npx cap sync android && cd android && ./gradlew --no-daemon assembleDebug
```

Çıktı `android/app/build/outputs/apk/debug/app-debug.apk` (imzasız deneme paketi; mağazaya GİTMEZ).

Staging'i açan deneme paketi: staging web Vercel girişinin arkasında olduğu için atlatma anahtarı
(`.env.staging` `STAGING_VERCEL_BYPASS_WEB`) açılış adresine eklenir ve PAKETE GÖMÜLÜR — o paket kimseyle
paylaşılmaz. Canlı adresle birlikte verilirse eşitleme hata verir. Derledikten sonra düz `npx cap sync`
koşulur (oluşan yapılandırma dosyasından anahtar silinsin):

```bash
ROTHERN_APP_URL=https://staging.supkeys.com ROTHERN_VERCEL_BYPASS=<anahtar> npx cap sync android
```

## Mağaza paketi

- **Önce Firebase dosyaları:** `mobile/android/app/google-services.json` yoksa Android paketi DERLENMEZ
  (dosyasız uygulama bildirim kaydında açılışta çöker; Gradle sürüm derlemesini hata ile durdurur). iOS
  paketi "Bildirimler (Firebase)" bölümündeki Mac adımları bitmeden gönderilmez (yoksa iOS'a bildirim gitmez).
- **Android:** Android Studio → Build → Generate Signed App Bundle (`.aab`). İlk seferde yükleme anahtarı
  (keystore) oluşturulur; dosya ve şifresi depoya KONMAZ, güvenli yerde saklanır (kaybolursa güncelleme
  gönderilemez). Her gönderimde `android/app/build.gradle` `versionCode` bir artar.
- **iOS:** Xcode → Product → Archive → Distribute App → App Store Connect. Her gönderimde build numarası
  (`CURRENT_PROJECT_VERSION`) bir artar.

## Bildirimler (Firebase)

Anlık bildirimler Firebase Cloud Messaging ile gider (proje `rothern-98853`). İki istemci dosyası
Firebase konsolundan (Project settings → Your apps) indirilip elle konur; **depoda YOKTUR**
(`mobile/.gitignore`), yeni makinede yeniden indirilir:

| Dosya | Yer |
|---|---|
| `google-services.json` | `mobile/android/app/google-services.json` |
| `GoogleService-Info.plist` | `mobile/ios/App/App/GoogleService-Info.plist` |

Android'de dosyayı koymak dışında adım yok: Gradle `google-services` eklentisini uygular. Dosya **yoksa**
sürüm derlemesi (`bundleRelease` / `assembleRelease`, Generate Signed App Bundle) hata ile durur; deneme
derlemesi yalnız uyarı yazar ama o paket de bildirime izin verilmişse açılışta çöker (Firebase başlamadan
`register()`). Bildirim küçük ikonu `ic_stat_rothern` `generate-assets.mjs` ile üretilir; kanal `default`'u
web istemcisi açar.

Uygulama öndeyken gelen bildirim sistem bandı / ses olarak GÖSTERİLMEZ (`capacitor.config.ts`
`presentationOptions: ["badge"]`): web aynı bildirimi uygulama içi kartla gösterir. Arka planda ve kapalıyken
bildirimi işletim sistemi gösterir.

**Mac'te bir kez (Xcode, `npx cap open ios`):**

1. File → Add Package Dependencies → `https://github.com/firebase/firebase-ios-sdk` → yalnız
   **FirebaseMessaging** ürününü **App** hedefine ekle. (`AppDelegate.swift` paket yokken de derlenir ama
   cihaz bildirime kaydolmaz — ham APNs belirteci sunucuya gitmez, sunucu yalnız FCM ile gönderir; paket ve
   plist eklenince FCM belirtecini kendiliğinden kullanır.)
2. `App/App/GoogleService-Info.plist`'i Xcode'da App grubuna sürükle, "Add to targets: App" işaretli.
3. App hedefi → Signing & Capabilities → **+ Capability → Push Notifications** (`aps-environment`
   `App.entitlements`'ta zaten var; yetenek listede görünmeli).

**Apple Developer hesabı açılınca:** Certificates, Identifiers & Profiles → Keys → yeni anahtar, **Apple Push
Notifications service (APNs)** işaretli → `.p8` dosyasını indir (bir kez indirilir; depoya KONMAZ). Firebase →
Project settings → Cloud Messaging → Apple app configuration → APNs Authentication Key: `.p8`, Key ID ve
Team ID ile yükle. Bu yapılmadan iOS'a bildirim gitmez (Android etkilenmez).

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
- İkon, açılış görselleri ve Android bildirim ikonu `node mobile/scripts/generate-assets.mjs` ile marka
  işaretinden üretilir.
- Uygulama yalnız iPhone hedefler (iPad desteği sonradan eklenebilir, eklendikten sonra kaldırılamaz).
- `npm test` (bu klasörde; Gradle / Xcode gerekmez) bildirim değişmezlerini sınar: öndeki bildirimde sistem
  bandı / ses yok, `google-services.json`'suz Android sürüm derlemesi durur, iOS ham APNs belirtecini kaydetmez.
