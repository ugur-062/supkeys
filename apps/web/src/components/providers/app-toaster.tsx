"use client";

import { useTranslations } from "next-intl";
import {
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import { Toaster } from "sonner";
import { usePathname } from "@/i18n/navigation";

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
 * Kapat düğmesinin DOKUNMA ALANI (mobil denetim 2026-10 g03/g04): sonner'ın
 * düğmesi 20×20 px ve toast'ın sol üst köşesinde. Görünüm aynı kalır;
 * görünmez katman alanı 44×44 px'e çıkarır. Sonner kendi CSS'ini katmansız
 * yazdığı için boyutu ezen yardımcı sınıf (`size-8`) kaybeder — sözde öğe
 * sonner'da tanımsız, katmanlı yardımcıyla da çalışır.
 */
export const TOAST_CLOSE_BUTTON_CLASS = "after:absolute after:-inset-3";

/**
 * ALTTAKİ YAZMA KUTUSUNUN ÜSTÜ (mobil denetim 2026-10 g04): masaüstünde mesaj
 * kutusu ekranın altına yakın (bölgenin 96 px'lik alt payının hemen üstü);
 * gönderim hatası toast'ı Gönder düğmesinin ve kutunun sağ ucunun üstüne
 * biniyor, yeniden deneme tıklamasını yutuyordu (sonner üzerine gelinince
 * süreyi de durdurur). Sayfanın ALTINA SABİTLENMİŞ bir yazma alanı
 * `useToastBottomClearance` ile kendini bildirir: alt pay, alan görünür ve
 * ekranın alt kısmındayken onun üst kenarının 8 px üstüne çıkar (yalnız
 * yükselir — `max()`; alan yokken eski pay). Telefonda varsayılan toast'lar
 * üstte; alta konumlanan canlı bildirim kartları da kutunun üstünde kalır.
 */
export const TOAST_CLEAR_BOTTOM_VAR = "--toast-clear-bottom";
/** Alanın üst kenarı ile toast arasındaki boşluk (px). */
const CLEARANCE_GAP_PX = 8;

/** Kayıtlı alanların istediği pay (px); en büyüğü yazılır. */
const clearances = new Map<symbol, number>();
function writeClearance(): void {
  if (typeof document === "undefined") return;
  const max = Math.max(0, ...clearances.values());
  const root = document.documentElement;
  if (max > 0) root.style.setProperty(TOAST_CLEAR_BOTTOM_VAR, `${max}px`);
  else root.style.removeProperty(TOAST_CLEAR_BOTTOM_VAR);
}

/**
 * Ekranın alt kısmına sabitlenmiş öğenin (sohbet yazma kutusu) toast'lardan
 * istediği alt pay: öğe görünür ve üst kenarı ekranın alt üçte ikisindeyse
 * `ekran yüksekliği − üst kenar + boşluk`, değilse 0 (sayfa içinde kayan,
 * ekranın üstüne yakın ya da görünmeyen öğe toast'ları yukarı itmez).
 */
export function toastClearanceFor(rect: Pick<DOMRect, "top" | "bottom" | "height">, viewportHeight: number): number {
  if (rect.height <= 0 || rect.bottom <= 0 || rect.top >= viewportHeight) return 0;
  if (rect.top < viewportHeight / 3) return 0;
  return Math.ceil(viewportHeight - rect.top + CLEARANCE_GAP_PX);
}

export function useToastBottomClearance(ref: RefObject<HTMLElement | null>, enabled = true): void {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof window === "undefined") return;
    const key = Symbol("toast-clearance");
    let raf = 0;
    const measure = () => {
      raf = 0;
      clearances.set(key, toastClearanceFor(el.getBoundingClientRect(), window.innerHeight));
      writeClearance();
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("resize", schedule);
    // Ekran klavyesi görünür alanı küçültür (iOS'ta yerleşim alanı değişmez).
    window.visualViewport?.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, { capture: true, passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(el);
    ro?.observe(document.body);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, { capture: true });
      ro?.disconnect();
      clearances.delete(key);
      writeClearance();
    };
  }, [ref, enabled]);
}

/**
 * Bölge payları — güvenli alan dahil (mobil kabuk 2026-10): üstte durum
 * çubuğu, altta ana ekran çizgisi, yanda yatay çentik. Sonner dize payı CSS
 * olarak yazar; güvenli pay 0 iken eski piksel değerleriyle BİREBİR aynı
 * (masaüstü sağ 24 / alt 96; mobil üst 12, alt 88, yanlar sonner varsayılanı 16).
 * Alt pay, sabit yazma kutusu bildirildiyse onun üstüne çıkar (yukarıda).
 */
export const TOASTER_OFFSET = {
  right: "calc(24px + var(--safe-right))",
  bottom: `max(calc(96px + var(--safe-bottom)), var(${TOAST_CLEAR_BOTTOM_VAR}, 0px))`,
} as const;
export const TOASTER_MOBILE_OFFSET = {
  top: "calc(12px + var(--safe-top))",
  right: "calc(16px + var(--safe-right))",
  bottom: `max(calc(88px + var(--safe-bottom)), var(${TOAST_CLEAR_BOTTOM_VAR}, 0px))`,
  left: "calc(16px + var(--safe-left))",
} as const;

/**
 * DİL SEÇİCİLİ GİRİŞ KABUĞU (mobil denetim 2026-10 g03): giriş, kayıt, şifre
 * sıfırlama/unutma ve ekip daveti `AuthShell`te; dil seçici sağ üst köşede
 * (`top-4` + 32 px, güvenli alan dahil). Üstteki toast (12 px) seçicinin
 * üstüne biniyor, ona dokunan kullanıcı toast'ı kapatıyordu. Bu sayfalarda
 * telefonda toast seçicinin ALTINDAN başlar (16 + 32 + 8 px boşluk); öbür
 * sayfalar değişmez. Yol İÇ yoldur (dil ön eki ve çevrili parçalar soyulmuş).
 */
const AUTH_SHELL_PATH =
  /^\/(?:reset-password|company\/(?:login|kayit|sifremi-unuttum|davet\/[^/]+))\/?$/;
export function isAuthShellPath(path: string | null | undefined): boolean {
  return !!path && AUTH_SHELL_PATH.test(path);
}
export const TOASTER_MOBILE_OFFSET_AUTH = {
  ...TOASTER_MOBILE_OFFSET,
  top: "calc(56px + var(--safe-top))",
} as const;

/**
 * Tek bildirim bölgesi.
 * - Masaüstü: sağ-alt (P0) — header'ı/aksiyonları örtmesin; alt boşluk AI
 *   launcher'ın (bottom-5 h-14) üstünde kalacak kadar (C13).
 * - Mobil: ÜST — diyaloglar telefonda alttan açılan sayfa (bottom sheet)
 *   olarak çizilir ve birincil düğmeleri en alttadır; alttaki toast onları
 *   kapatıyordu (arayüz testi FX-00 yeniden doğrulama: "Şikayeti Gönder"
 *   hata toast'ının altında kalıyordu).
 *
 * Erişilebilir adlar okuyucunun dilinde: bölge adı `containerAriaLabel`
 * ile verilir. Sonner 1.7 kapat düğmesinin adını ("Close toast") Toaster
 * üzerinden almıyor → düğmeler eklendikçe bölgeyi izleyip adı yazıyoruz
 * (React bu özniteliğe yalnız prop değişince dokunur; prop sabit).
 */
export function AppToaster() {
  const mobile = useSyncExternalStore(subscribe, isMobile, () => false);
  const authShell = isAuthShellPath(usePathname());
  const t = useTranslations("web.shared.ui");
  const closeLabel = t("close");
  const observer = useRef<MutationObserver | null>(null);

  const relabel = useCallback(
    (root: HTMLElement) => {
      root.querySelectorAll<HTMLElement>("[data-close-button]").forEach((btn) => {
        if (btn.getAttribute("aria-label") !== closeLabel) btn.setAttribute("aria-label", closeLabel);
      });
    },
    [closeLabel],
  );

  // Sonner `ref`i her zaman çizilen <section> bölgesine bağlar; toast'lar onun
  // altına eklenir. Gözlem yalnız bu küçük alt ağaçta.
  const sectionRef = useCallback(
    (node: HTMLElement | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!node || typeof MutationObserver === "undefined") return;
      relabel(node);
      const mo = new MutationObserver(() => relabel(node));
      mo.observe(node, { childList: true, subtree: true });
      observer.current = mo;
    },
    [relabel],
  );
  useEffect(() => () => observer.current?.disconnect(), []);

  return (
    <Toaster
      ref={sectionRef}
      position={mobile ? "top-center" : "bottom-right"}
      offset={TOASTER_OFFSET}
      // Alt boşluk mobilde de korunur: canlı bildirim kartları (live-toasts)
      // konumunu kendisi "bottom-right" verir.
      mobileOffset={authShell ? TOASTER_MOBILE_OFFSET_AUTH : TOASTER_MOBILE_OFFSET}
      richColors
      closeButton
      containerAriaLabel={t("notifications")}
      toastOptions={{
        style: {
          fontFamily: "var(--font-inter), system-ui, sans-serif",
        },
        classNames: {
          closeButton: TOAST_CLOSE_BUTTON_CLASS,
        },
      }}
    />
  );
}
