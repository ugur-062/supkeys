"use client";

import { nativePush, pushActionTarget, retryPendingPushUnregister } from "@/lib/native-push";
import { deepLinkTarget, nativeAppPlugin, nativeListener } from "@/lib/native-shell";
import { useEffect } from "react";

/** Açılış bağlantısı WebView oturumu başına bir kez işlenir (her tam yüklemede değil). */
const LAUNCH_HANDLED_KEY = "rothern:native-launch-url";

/**
 * Kök (`[locale]`) düzende bir kez kurulur; hiçbir şey çizmez ve tarayıcıda
 * hiçbir şey yapmaz. Mobil kabukta (bkz. `lib/native-shell.ts`) işletim
 * sisteminin uygulamaya devrettiği rothern.com bağlantısını WebView'de açar:
 * uygulama açıkken `appUrlOpen`, kapalıyken açılış bağlantısı.
 *
 * Anlık bildirime dokunma (`pushNotificationActionPerformed`) da burada: kök
 * düzen soğuk açılışta ilk kurulan yerdir, eklenti dokunma olayını dinleyici
 * gelene dek tutar. İletinin `data.url`'i aynı köken kuralıyla açılır.
 *
 * Önceki çıkışta / oturum düşmesinde sunucudan silinemeyen cihaz belirteci de
 * her sayfa yüklemesinde burada yeniden denenir (bkz. `retryPendingPushUnregister`).
 */
export function NativeShellBridge() {
  useEffect(() => {
    const app = nativeAppPlugin(window);
    const push = nativePush(window);
    if (!app && !push) return;

    const open = (target: string | null) => {
      // Dış (dil ön ekli) tam adres: istemci yönlendiricisi iç yol bekler.
      if (target) window.location.assign(target);
    };

    let disposed = false;
    const listeners: Array<{ remove: () => void }> = [];

    if (app) {
      listeners.push(
        nativeListener(() =>
          app.addListener("appUrlOpen", (data) => open(deepLinkTarget(data?.url, window.location.href))),
        ),
      );

      try {
        void Promise.resolve(app.getLaunchUrl())
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
            open(deepLinkTarget(url, window.location.href));
          })
          .catch(() => {});
      } catch {
        // Köprü çağrısı eşzamanlı fırlattı: açılış bağlantısı yok sayılır.
      }
    }

    if (push) {
      void retryPendingPushUnregister();
      listeners.push(
        nativeListener(() =>
          push.plugin.addListener("pushNotificationActionPerformed", (action) =>
            open(pushActionTarget(action, window.location.href)),
          ),
        ),
      );
    }

    return () => {
      disposed = true;
      for (const listener of listeners) listener.remove();
    };
  }, []);

  return null;
}
