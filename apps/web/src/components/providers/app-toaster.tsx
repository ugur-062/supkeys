"use client";

import { useSyncExternalStore } from "react";
import { Toaster } from "sonner";

/** Sonner'ın kendi mobil kırılımı (toast'lar bu genişlikte tam en olur). */
const MOBILE_QUERY = "(max-width: 600px)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia?.(MOBILE_QUERY);
  if (!mq) return () => {};
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isMobile = () => window.matchMedia?.(MOBILE_QUERY).matches ?? false;

/**
 * Tek bildirim bölgesi.
 * - Masaüstü: sağ-alt (P0) — header'ı/aksiyonları örtmesin; alt boşluk AI
 *   launcher'ın (bottom-5 h-14) üstünde kalacak kadar (C13).
 * - Mobil: ÜST — diyaloglar telefonda alttan açılan sayfa (bottom sheet)
 *   olarak çizilir ve birincil düğmeleri en alttadır; alttaki toast onları
 *   kapatıyordu (arayüz testi FX-00 yeniden doğrulama: "Şikayeti Gönder"
 *   hata toast'ının altında kalıyordu).
 */
export function AppToaster() {
  const mobile = useSyncExternalStore(subscribe, isMobile, () => false);
  return (
    <Toaster
      position={mobile ? "top-center" : "bottom-right"}
      offset={{ right: 24, bottom: 96 }}
      // Alt boşluk mobilde de korunur: canlı bildirim kartları (live-toasts)
      // konumunu kendisi "bottom-right" verir.
      mobileOffset={{ top: 12, bottom: 88 }}
      richColors
      closeButton
      toastOptions={{
        style: {
          fontFamily: "var(--font-inter), system-ui, sans-serif",
        },
      }}
    />
  );
}
