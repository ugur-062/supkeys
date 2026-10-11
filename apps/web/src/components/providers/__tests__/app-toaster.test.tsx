// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ props: null as Record<string, unknown> | null }));
vi.mock("sonner", () => ({
  Toaster: (p: Record<string, unknown>) => {
    h.props = p;
    return null;
  },
}));

import { AppToaster } from "../app-toaster";

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
});

// Arayüz testi FX-00 yeniden doğrulama: mobilde alttaki hata toast'ı alttan
// açılan diyaloğun birincil düğmesini ("Şikayeti Gönder") örtüyordu.
describe("AppToaster", () => {
  it("masaüstünde sağ-alt (AI launcher'ın üstünde)", () => {
    setViewport(false);
    render(<AppToaster />);
    expect(h.props?.position).toBe("bottom-right");
    expect(h.props?.offset).toMatchObject({ bottom: 96 });
  });

  it("mobilde üstte — alttaki diyalog düğmelerini örtmez", () => {
    setViewport(true);
    render(<AppToaster />);
    expect(h.props?.position).toBe("top-center");
    expect(h.props?.mobileOffset).toMatchObject({ top: 12, bottom: 88 });
  });
});
