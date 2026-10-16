"use client";

import { confirmAppLeave } from "@/lib/leave-guard";
import { nativePush, pushActionTarget, retryPendingPushUnregister } from "@/lib/native-push";
import {
  deepLinkTarget,
  isNativeShell,
  keepSafeAreaInsets,
  nativeAppPlugin,
  nativeBrowserPlugin,
  nativeListener,
  shellLinkAction,
} from "@/lib/native-shell";
// Ham (dil ön ekli) yol istemci yönlendiricisine OLDUĞU GİBİ verilir —
// `@/i18n/navigation` iç yol bekler ve ön eki yeniden eklerdi.
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

/** Açılış bağlantısı WebView oturumu başına bir kez işlenir (her tam yüklemede değil). */
const LAUNCH_HANDLED_KEY = "rothern:native-launch-url";

// GÜVENLİ ALAN PAYI (mobil denetim smoke-public#new0): kabuğun `<html>`e
// yazdığı `--safe-area-inset-*` değerleri 404 kabuğunda React `<html>`i
// devralırken silinir. Koruma MODÜL değerlendirilirken kurulur — React bu
// bileşeni çizmeden (ve `<html>`i devralmadan) önce; bkz. `keepSafeAreaInsets`.
if (typeof document !== "undefined") keepSafeAreaInsets(document.documentElement);

/**
 * Kök (`[locale]`) düzende bir kez kurulur; hiçbir şey çizmez ve tarayıcıda
 * hiçbir şey yapmaz (güvenli alan bekçisi `<html>`e yazılmış bir pay
 * görmedikçe iş yapmaz). Mobil kabukta (bkz. `lib/native-shell.ts`) işletim
 * sisteminin uygulamaya devrettiği rothern.com bağlantısını WebView'de açar:
 * uygulama açıkken `appUrlOpen`, kapalıyken açılış bağlantısı.
 *
 * Anlık bildirime dokunma (`pushNotificationActionPerformed`) da burada: kök
 * düzen soğuk açılışta ilk kurulan yerdir, eklenti dokunma olayını dinleyici
 * gelene dek tutar. İletinin `data.url`'i aynı köken kuralıyla açılır.
 *
 * Önceki çıkışta / oturum düşmesinde sunucudan silinemeyen cihaz belirteci de
 * her sayfa yüklemesinde burada yeniden denenir (bkz. `retryPendingPushUnregister`).
 *
 * YENİ SEKME BAĞLANTISI (mobil denetim 2026-10 g05): kabukta aynı kökendeki
 * `target="_blank"` sayfa bağlantısı aynı WebView'de, istemci yönlendiricisiyle
 * açılır (iOS onu Safari'ye, oturumsuz bir tarayıcıya gönderiyordu) — kural
 * `shellLinkAction`. Yakalama aşamasında, pencere düzeyinde dinlenir: kart içi
 * bağlantıların `stopPropagation`ı onu kesemez. Kaydedilmemiş değişiklik varsa
 * önce sorulur (`confirmAppLeave`). Dış köken eskisi gibi işletim sisteminin
 * tarayıcısında açılır.
 */
export function NativeShellBridge() {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  // Bağlanınca da (kök `<html>` değiştiyse yeni öğe için; aynı öğede no-op).
  useEffect(() => {
    keepSafeAreaInsets(document.documentElement);
  }, []);

  useEffect(() => {
    if (!isNativeShell(window)) return;
    const root = document.documentElement;
    // "Yeni sekmede açılır" ipuçları kabukta gizlenir (globals.css).
    root.setAttribute("data-native-shell", "");
    const onClick = (event: MouseEvent) => {
      const action = shellLinkAction(event, window.location.href);
      if (!action) return;
      if (action.kind === "in-app-browser") {
        const browser = nativeBrowserPlugin(window);
        // Eklenti yoksa varsayılan davranış (yeni pencere) sürer.
        if (!browser) return;
        event.preventDefault();
        const fallback = () => void window.open(action.href, "_blank", "noopener");
        try {
          void Promise.resolve(browser.open({ url: action.href })).catch(fallback);
        } catch {
          fallback();
        }
        return;
      }
      event.preventDefault();
      void confirmAppLeave().then((leave) => {
        if (leave) routerRef.current.push(action.path);
      });
    };
    window.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("click", onClick, true);
      root.removeAttribute("data-native-shell");
    };
  }, []);

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
