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

**iOS başlangıç yolu:** Capacitor iOS, site uzaktan açılsa bile `public/<appStartPath>` yolunun pakette
olmasını şart koşar; yoksa uygulama açılır açılmaz kapanır (konsolda "Unable to load … This file is the root
of your web app"). Bu yüzden `www/company/` yer tutucusu var (`npm test` denetler). Staging paketinin
başlangıç yolu atlatma sorgusu taşıdığından (`/company?x-vercel-…`) bu denetimi geçemez: staging deneme
paketi yalnız Android içindir.

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

## Bilgisayarda öykünücüyle deneme (telefonsuz)

Kurulu (2026-10-14): sistem görüntüsü `android-35 google_apis_playstore x86_64`, öykünücü `rothern` (Pixel 7).
WSL'de KVM için kullanıcı `kvm` grubunda olmalı (bir kez `sudo usermod -aG kvm $USER`; `sudo chmod 666 /dev/kvm` yalnız o açılış için geçerli). Uygulama yerel deneme
yığınını açar (`http://localhost:3000`, API `:4000`); öykünücü bu adreslere `adb reverse` ile ulaşır.

```bash
export JAVA_HOME=~/android-sdk/jdk ANDROID_HOME=~/android-sdk PATH=~/android-sdk/jdk/bin:$PATH
~/android-sdk/emulator/emulator -avd rothern -memory 2048 -gpu swiftshader_indirect -no-audio -no-boot-anim -no-snapshot-save &
~/android-sdk/platform-tools/adb wait-for-device && until [ "$(~/android-sdk/platform-tools/adb shell getprop sys.boot_completed | tr -d '\r')" = 1 ]; do sleep 2; done
~/android-sdk/platform-tools/adb reverse tcp:3000 tcp:3000 && ~/android-sdk/platform-tools/adb reverse tcp:4000 tcp:4000
cd mobile && ROTHERN_APP_URL=http://localhost:3000 npx cap sync android
cd android && ./gradlew --no-daemon assembleDebug && ~/android-sdk/platform-tools/adb install -r app/build/outputs/apk/debug/app-debug.apk
```

- `adb reverse` öykünücü açıldıktan sonra kurulur ve öykünücü ya da adb sunucusu her yeniden başladığında
  yeniden verilir; kurulmazsa uygulama yerel yığına ulaşamaz ve bağlantı yok sayfasını gösterir.
- `http://` adres yalnız bu denemede şifresiz trafiği açar (`cleartext`); mağaza paketinde kapalı
  (`npm test` kilitler). Denemeden sonra düz `npx cap sync android`.
- Yerel web, API adresi gömülerek derlenir (`NEXT_PUBLIC_API_URL=http://localhost:4000/api`); bildirim için
  yerel API'de `FIREBASE_SERVICE_ACCOUNT_JSON` tanımlı olmalı ve öykünücüye `google-services.json`'lı paket
  kurulmalı.
- Bildirimleri görmek: `~/android-sdk/platform-tools/adb shell dumpsys notification --noredact | grep -A3 com.rothern.app`.

### WSL'de KVM yoksa: öykünücü Windows tarafında (2026-10-16)

Windows'ta VBS (Sanallaştırma Tabanlı Güvenlik) açıkken AMD işlemcide WSL'e iç içe sanallaştırma gelmez
(`dmesg`: `Hyper-V: Nested features: 0x0`, `/dev/kvm` yok). O zaman öykünücü doğrudan Windows'ta, Windows
Hypervisor Platform (WHPX) ile çalışır; güvenlik ayarı kapatılmaz:

- Windows SDK `C:\Users\<kullanıcı>\AppData\Local\Android\Sdk`: `emulator` ve `platform-tools` Windows paketleri
  (`dl.google.com/android/repository`), sistem görüntüsü WSL'dekinin kopyası; AVD `%USERPROFILE%\.android\avd`.
  Kontrol: `emulator.exe -accel-check` → "WHPX … is installed and usable".
- adb: Windows'taki `adb.exe` (WSL'den de çağrılır). `adb reverse` Windows'ta `127.0.0.1`'e bağlanır; WSL'in yerel
  yönlendirmesi bir portu yalnız `::1` (IPv6) üzerinde açıyorsa (ör. `next start` 3000) Windows'ta küçük bir
  127.0.0.1→::1 aktarıcı gerekir (Node `net` ile birkaç satır).
- WebView hata ayıklama: `adb forward tcp:9222 localabstract:webview_devtools_remote_<pid>`; bu port Windows'ta açılır,
  CDP istemcisini Windows'taki Node ile çalıştır.
- Bu görüntünün WebView'i eski (Chrome 124): `container-type` taşıyan `<main>` sabit öğelerin kapsayıcısı olur — yeni
  tarayıcıda görünmeyen bu tür hatalar tam burada yakalanır (bkz. CLAUDE.md `ViewportLayer`).

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

**Mac'te (Xcode, `npx cap open ios`) — 2026-10-29'dan beri projede hazır:** FirebaseMessaging paketi (SPM,
sürümler `project.xcworkspace/xcshareddata/swiftpm/Package.resolved`) App hedefine ve
`App/App/GoogleService-Info.plist` App kaynaklarına bağlı (`project.pbxproj`). Yeni bir Mac'te yalnız:

1. `GoogleService-Info.plist`'i Firebase konsolundan indirip **tam bu adla** `ios/App/App/` altına koy
   (Xcode'a sürükleme; ad "GoogleService-Info 2" gibi değişirse Firebase başlamaz). Dosya yokken iOS paketi
   derlenmez — proje dosyayı kaynak olarak bekler. Dosya depoya GİRMEZ: Xcode bazen `git add` eder, commit'ten
   önce `git status`'ta `A … GoogleService-Info.plist` görürsen `git rm --cached` ile çıkar.
2. `npx cap sync ios` (yerel web klasörü `public/` buradan dolar; atlanırsa uygulama açılışta kapanır).
3. App hedefi → Signing & Capabilities → Team: şirket takımı. Push Notifications ve Associated Domains
   yetenekleri projede; ücretsiz "Personal Team" bunları imzalayamaz (yalnız simülatörde çalıştırılır).

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

## Dosya paylaşma ve yazdırma

Uygulamada tarayıcının indirme ve `window.print()` yolu çalışmaz; web bunun yerine üç yerel eklenti kullanır
(`apps/web/src/lib/native-shell.ts`):

| Eklenti | Ne yapar |
|---|---|
| `@capacitor/filesystem` | İndirilecek dosyayı (Excel, PDF…) uygulamanın önbellek klasörüne yazar |
| `@capacitor/share` | O dosyayla sistemin paylaşım menüsünü açar (Dosyalar'a / Drive'a kaydet, e-posta, WhatsApp…); menüyü kapatmak hata değildir |
| `RothernPrint` (uygulamanın kendi eklentisi) | Web'in verdiği HTML belgeyle sistemin yazdırma penceresini açar; pencere "PDF olarak kaydet"i de sunar |

- `RothernPrint` npm paketi değildir: Android'de `android/app/src/main/java/com/rothern/app/PrintPlugin.java`
  (`MainActivity` kaydeder), iOS'ta `ios/App/App/AppDelegate.swift`in sonundaki `PrintPlugin` +
  `MainViewController` (`Main.storyboard` ve `SceneDelegate` bu denetleyiciyi kullanır). Swift sınıfları ayrı
  dosyada değil, çünkü yeni dosya App hedefine yalnız Xcode'da eklenebilir; Mac'te istenirse taşınabilir.
- Bunlar yerel koddur: web'e çıkan değişiklik gibi kendiliğinden gelmez, **yeni mağaza paketi** gerekir
  (`npx cap sync` → Android `versionCode` +1, iOS build numarası +1 → gönderim).
- Eklentisi olmayan eski uygulama sürümü bozulmaz: web eklentinin yokluğunu tanır ve "siteden (rothern.com)
  indirin / yazdırın" uyarısı gösterir.

## Değişmeyenler

- `appId` `com.rothern.app` — mağaza kaydından sonra değiştirilemez; web tarafındaki eşi
  `apps/web/src/lib/mobile-app-links.ts` `MOBILE_APP_ID`.
- İkon, açılış görselleri ve Android bildirim ikonu `node mobile/scripts/generate-assets.mjs` ile marka
  işaretinden üretilir.
- Uygulama yalnız iPhone hedefler (iPad desteği sonradan eklenebilir, eklendikten sonra kaldırılamaz).
- `npm test` (bu klasörde; Gradle / Xcode gerekmez) bildirim değişmezlerini sınar: öndeki bildirimde sistem
  bandı / ses yok, `google-services.json`'suz Android sürüm derlemesi durur, iOS ham APNs belirtecini kaydetmez.
  Dosya paylaşma / yazdırma için de: iki eklenti tam sürümle bağımlı ve eşitlenmiş, `RothernPrint` iki
  platformda bu adla kayıtlı, iOS kök denetleyicisi (storyboard + `SceneDelegate`) `MainViewController`.
