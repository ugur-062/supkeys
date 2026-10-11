"use client";

import { deepLinkTarget, nativeAppPlugin } from "@/lib/native-shell";
import { useEffect } from "react";

/** Açılış bağlantısı WebView oturumu başına bir kez işlenir (her tam yüklemede değil). */
const LAUNCH_HANDLED_KEY = "rothern:native-launch-url";

/**
 * Kök (`[locale]`) düzende bir kez kurulur; hiçbir şey çizmez ve tarayıcıda
 * hiçbir şey yapmaz. Mobil kabukta (bkz. `lib/native-shell.ts`) işletim
 * sisteminin uygulamaya devrettiği rothern.com bağlantısını WebView'de açar:
 * uygulama açıkken `appUrlOpen`, kapalıyken açılış bağlantısı.
 */
export function NativeShellBridge() {
  useEffect(() => {
    const app = nativeAppPlugin(window);
    if (!app) return;

    const open = (url: string | undefined) => {
      const target = deepLinkTarget(url, window.location.href);
      // Dış (dil ön ekli) tam adres: istemci yönlendiricisi iç yol bekler.
      if (target) window.location.assign(target);
    };

    let disposed = false;
    let remove: (() => void | Promise<void>) | undefined;
    void app
      .addListener("appUrlOpen", (data) => open(data.url))
      .then((handle) => {
        if (disposed) void handle.remove();
        else remove = handle.remove;
      })
      .catch(() => {});

    void app
      .getLaunchUrl()
      .then((launch) => {
        const url = launch?.url;
        if (!url || disposed) return;
        try {
          if (window.sessionStorage.getItem(LAUNCH_HANDLED_KEY) === url) return;
          window.sessionStorage.setItem(LAUNCH_HANDLED_KEY, url);
        } catch {
          // Depo kapalıysa açılış bağlantısı her yüklemede geri çekerdi → atla.
          return;
        }
        open(url);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      void remove?.();
    };
  }, []);

  return null;
}
