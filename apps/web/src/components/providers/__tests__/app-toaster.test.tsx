// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  props: null as Record<string, unknown> | null,
  pathname: "/company" as string | null,
}));
// `@/i18n/navigation` (vitest.setup) Next'in `usePathname`ini kullanır.
vi.mock("next/navigation", async (orig) => ({
  ...(await orig<typeof import("next/navigation")>()),
  usePathname: () => h.pathname,
}));
// Sonner `ref`i her zaman çizilen bildirim bölgesine (<section>) bağlar.
vi.mock("sonner", async () => {
  const React = await import("react");
  return {
    Toaster: (p: Record<string, unknown>) => {
      h.props = p;
      return React.createElement("section", { ref: p.ref as React.Ref<HTMLElement> });
    },
  };
});

import { useRef } from "react";
import {
  AppToaster,
  isAuthShellPath,
  TOAST_CLEAR_BOTTOM_VAR,
  TOAST_CLOSE_BUTTON_CLASS,
  toastClearanceFor,
  useToastBottomClearance,
} from "../app-toaster";

function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({
    matches: mobile,
    media: q,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  h.props = null;
  h.pathname = "/company";
  document.documentElement.style.removeProperty(TOAST_CLEAR_BOTTOM_VAR);
});

// Arayüz testi FX-00 yeniden doğrulama: mobilde alttaki hata toast'ı alttan
// açılan diyaloğun birincil düğmesini ("Şikayeti Gönder") örtüyordu.
describe("AppToaster", () => {
  it("masaüstünde sağ-alt (AI launcher'ın üstünde)", () => {
    setViewport(false);
    render(<AppToaster />);
    expect(h.props?.position).toBe("bottom-right");
    // Güvenli alan payı dahil; pay 0 iken 96 px (eski değer). Sabit yazma
    // kutusu bildirildiyse onun üstüne çıkar (yalnız yükselir).
    expect(h.props?.offset).toMatchObject({
      bottom: "max(calc(96px + var(--safe-bottom)), var(--toast-clear-bottom, 0px))",
    });
  });

  it("mobilde üstte — alttaki diyalog düğmelerini örtmez", () => {
    setViewport(true);
    render(<AppToaster />);
    expect(h.props?.position).toBe("top-center");
    // Üstte durum çubuğu, altta ana ekran çizgisi, yanlarda çentik payı.
    expect(h.props?.mobileOffset).toMatchObject({
      top: "calc(12px + var(--safe-top))",
      bottom: "max(calc(88px + var(--safe-bottom)), var(--toast-clear-bottom, 0px))",
      left: "calc(16px + var(--safe-left))",
      right: "calc(16px + var(--safe-right))",
    });
  });

  // Mobil denetim g03: sıfırlama sayfasında toast (y 12–66) sağ üstteki dil
  // seçicinin (y 16–48) üstüne biniyordu.
  it("dil seçicili giriş kabuğunda (telefon) toast seçicinin ALTINDAN başlar", () => {
    setViewport(true);
    h.pathname = "/reset-password";
    render(<AppToaster />);
    expect(h.props?.mobileOffset).toMatchObject({
      top: "calc(56px + var(--safe-top))",
      left: "calc(16px + var(--safe-left))",
      right: "calc(16px + var(--safe-right))",
    });
    // Masaüstü bölgesi (sağ-alt) değişmez.
    expect(h.props?.offset).toMatchObject({ right: "calc(24px + var(--safe-right))" });
  });

  it("giriş kabuğu yolları (iç yol) tanınır; panel ve vitrin sayfaları değil", () => {
    for (const p of [
      "/reset-password",
      "/company/login",
      "/company/kayit",
      "/company/sifremi-unuttum",
      "/company/davet/abc123",
    ]) {
      expect(isAuthShellPath(p)).toBe(true);
    }
    for (const p of [null, "/", "/company", "/company/mesajlar", "/company/davet", "/urunler", "/company/login/x"]) {
      expect(isAuthShellPath(p)).toBe(false);
    }
  });
});

/**
 * Mobil denetim g04 (masaüstü): gönderim hatası toast'ı mesaj kutusunun
 * Gönder düğmesini örtüyor, yeniden deneme tıklamasını yutuyordu.
 */
describe("useToastBottomClearance — toast'lar sabit yazma kutusunun üstünde", () => {
  it("pay: kutu ekranın alt kısmındaysa üst kenarının 8 px üstü; değilse 0", () => {
    // 800 px ekran, kutu y 607–696 → toast alt kenarı 201 px yukarıda.
    expect(toastClearanceFor({ top: 607, bottom: 696, height: 89 }, 800)).toBe(201);
    // Görünmeyen, ekranın üst üçte birinde ya da çizilmemiş kutu toast'ı itmez.
    expect(toastClearanceFor({ top: 900, bottom: 990, height: 90 }, 800)).toBe(0);
    expect(toastClearanceFor({ top: -200, bottom: -100, height: 100 }, 800)).toBe(0);
    expect(toastClearanceFor({ top: 100, bottom: 190, height: 90 }, 800)).toBe(0);
    expect(toastClearanceFor({ top: 0, bottom: 0, height: 0 }, 800)).toBe(0);
  });

  function Composer({ enabled = true }: { enabled?: boolean }) {
    const ref = useRef<HTMLDivElement>(null);
    useToastBottomClearance(ref, enabled);
    return <div ref={ref} data-testid="composer" />;
  }

  it("kök değişkeni yazılır, bileşen kalkınca silinir; kapalıyken yazılmaz", () => {
    const rect = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockReturnValue({ top: 607, bottom: 696, height: 89, left: 0, right: 0, width: 0, x: 0, y: 607, toJSON: () => ({}) });
    const prevHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
    try {
      const view = render(<Composer />);
      expect(document.documentElement.style.getPropertyValue(TOAST_CLEAR_BOTTOM_VAR)).toBe("201px");
      view.unmount();
      expect(document.documentElement.style.getPropertyValue(TOAST_CLEAR_BOTTOM_VAR)).toBe("");

      render(<Composer enabled={false} />);
      expect(document.documentElement.style.getPropertyValue(TOAST_CLEAR_BOTTOM_VAR)).toBe("");
    } finally {
      rect.mockRestore();
      Object.defineProperty(window, "innerHeight", { configurable: true, value: prevHeight });
    }
  });
});

/**
 * Mobil denetim 2026-10 g03/g04: sonner'ın kapat düğmesi 20×20 px ve Türkçe
 * arayüzde "Close toast" diye okunuyordu (sonner 1.7 bu adı Toaster'dan
 * almıyor).
 */
describe("AppToaster — kapat düğmesi", () => {
  it("görünüm aynı, dokunma alanı görünmez katmanla 44 px", () => {
    setViewport(true);
    render(<AppToaster />);
    const opts = h.props?.toastOptions as { classNames?: { closeButton?: string } };
    expect(opts.classNames?.closeButton).toBe(TOAST_CLOSE_BUTTON_CLASS);
    expect(TOAST_CLOSE_BUTTON_CLASS.split(/\s+/)).toEqual(["after:absolute", "after:-inset-3"]);
    expect(h.props?.closeButton).toBe(true);
  });

  it("bölge ve kapat düğmesi okuyucunun dilinde adlanır (sonradan eklenen toast dahil)", async () => {
    setViewport(false);
    const { container } = render(<AppToaster />);
    expect(h.props?.containerAriaLabel).toBe("Bildirimler");
    const section = container.querySelector("section")!;
    const btn = document.createElement("button");
    btn.setAttribute("data-close-button", "");
    btn.setAttribute("aria-label", "Close toast");
    section.appendChild(btn);
    await waitFor(() => expect(btn).toHaveAttribute("aria-label", "Kapat"));
  });
});
