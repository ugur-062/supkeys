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

const config: CapacitorConfig = {
  appId: "com.rothern.app",
  appName: "Rothern",
  webDir: "www",
  // Web tarafı kabuğu bu ekten tanır (`RothernApp/`).
  appendUserAgent: "RothernApp/1.0",
  backgroundColor: "#ffffff",
  server: {
    url: appUrl,
    // Giriş yapılmamışsa web `/company/login`e yönlendirir.
    appStartPath: "/company",
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
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
