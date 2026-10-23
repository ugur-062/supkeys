import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Rothern mobil kabuğu. Uygulama kendi içinde paket taşımaz: canlı web
 * uygulamasını (`www.rothern.com`) açar; web'e çıkan her düzeltme mağaza
 * güncellemesi olmadan uygulamaya da yansır. `www/` yalnız yedek + çevrimdışı
 * ekranıdır.
 *
 * `ROTHERN_APP_URL` yalnız `cap sync` anında okunur (staging derlemesi:
 * `npm run sync:staging`). Mağazaya giden paket bu değişken OLMADAN eşitlenir.
 *
 * `appId` yayından sonra DEĞİŞTİRİLEMEZ (mağaza kaydı + bağlantı dosyaları
 * `apps/web/src/lib/mobile-app-links.ts` buna bağlı).
 */
const appUrl = process.env.ROTHERN_APP_URL ?? "https://www.rothern.com";

/**
 * YALNIZ elle dağıtılan staging deneme paketi: staging web Vercel girişinin
 * arkasında; anahtar ilk açılışta atlatma çerezini yazdırır. Anahtar pakete
 * gömülür → bu paket kimseyle paylaşılmaz; canlı adresle birlikte verilirse
 * eşitleme durur (mağaza paketine sızmasın). Derledikten sonra düz `cap sync`.
 */
const stagingBypass = process.env.ROTHERN_VERCEL_BYPASS?.trim();
if (stagingBypass && !process.env.ROTHERN_APP_URL) {
  throw new Error("ROTHERN_VERCEL_BYPASS is only for staging builds (set ROTHERN_APP_URL)");
}
const appStartPath = stagingBypass
  ? `/company?x-vercel-protection-bypass=${encodeURIComponent(stagingBypass)}&x-vercel-set-bypass-cookie=true`
  : "/company";

const config: CapacitorConfig = {
  appId: "com.rothern.app",
  appName: "Rothern",
  webDir: "www",
  // Web tarafı kabuğu bu ekten tanır (`RothernApp/`).
  appendUserAgent: "RothernApp/1.0",
  backgroundColor: "#ffffff",
  server: {
    url: appUrl,
    // Yalnız bilgisayardaki yerel deneme yığını (`http://localhost`, öykünücüde
    // `adb reverse` ile). Canlı ve staging https'tir → mağaza paketinde şifresiz trafik kapalı.
    cleartext: appUrl.startsWith("http://"),
    // Giriş yapılmamışsa web `/company/login`e yönlendirir.
    appStartPath,
    // Ağ yokken ya da site açılmazken gösterilen yerel sayfa.
    errorPath: "offline.html",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 800,
      backgroundColor: "#ffffff",
      showSpinner: false,
    },
    PushNotifications: {
      // Uygulama öndeyken gelen bildirim için sistem bandı / ses / Android'de üstte beliren
      // bildirim YOK: aynı satırı web zaten uygulama içi kartla (`LiveToasts`) ve sesle
      // gösteriyor, "alert" / "sound" her bildirimi iki kez gösterirdi. `pushNotificationReceived`
      // yine web'e ulaşır (zil + Bildirimler tazelenir). Sözleşme:
      // `apps/web/src/components/company/native-push-registrar.tsx`. Arka planda / kapalıyken
      // gösterim bundan etkilenmez (onu işletim sistemi yapar).
      presentationOptions: ["badge"],
    },
  },
};

export default config;
