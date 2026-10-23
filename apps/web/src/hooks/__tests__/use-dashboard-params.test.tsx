// @vitest-environment jsdom
/**
 * Pano adres durumu — sekme / dönem dokunuşu sayfayı EN ÜSTE ATMAZ (mobil
 * denetim g10-02, 2026-10-15).
 *
 * `router.push(…, { scroll: false })` Next'in ScrollAndFocusHandler'ı yüzünden
 * yine `scrollTop = 0` yapıyordu (telefonda Grafikler ~2000 px aşağıda). Yazım
 * artık yerli `history.pushState`: yönlendirici gezinmesi yok, kaydırma yok,
 * Geri tuşu için geçmiş kaydı var. jsdom yerleşim / kaydırma hesaplamaz;
 * burada kilitlenen: yönlendirici çağrılmaz, adres `pushState` ile yazılır,
 * dil öneki ve ardışık değişimler korunur, aynı adres yeniden yazılmaz.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  // Next 15 yerli pushState'i useSearchParams'a yansıtır; testte her çizimde
  // güncel adresten okunur.
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ push: h.push, replace: h.replace, prefetch: vi.fn() }),
  usePathname: () => window.location.pathname,
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: h.push, replace: h.replace, prefetch: vi.fn() }),
  usePathname: () => window.location.pathname,
}));

import { useDashboardParams } from "../use-dashboard-params";

const TABS = ["satın alma talebi", "tasarruf", "tedarikci"] as const;

function setup(path = "/company/sirketim") {
  window.history.replaceState(null, "", path);
  return renderHook(() => useDashboardParams(TABS[0], TABS));
}

let pushSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  pushSpy = vi.spyOn(window.history, "pushState");
});
afterEach(() => {
  pushSpy.mockRestore();
  window.history.replaceState(null, "", "/");
});

describe("useDashboardParams — yerli pushState (g10-02)", () => {
  it("sekme değişimi yönlendiriciyi çağırmaz; adres pushState ile yazılır", () => {
    const { result } = setup();
    act(() => result.current.setParams({ tab: "tasarruf" }));
    expect(h.push).not.toHaveBeenCalled();
    expect(h.replace).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/company/sirketim");
    expect(window.location.search).toBe("?tab=tasarruf");
  });

  it("kaydırma konumuna dokunmaz", () => {
    const scrollTo = vi.fn();
    const original = window.scrollTo;
    window.scrollTo = scrollTo as typeof window.scrollTo;
    try {
      const { result } = setup();
      act(() => result.current.setParams({ period: "quarter" }));
      expect(scrollTo).not.toHaveBeenCalled();
      expect(window.location.search).toBe("?period=quarter");
    } finally {
      window.scrollTo = original;
    }
  });

  it("dil öneki ve hash korunur", () => {
    const { result } = setup("/en/company/overview#grafikler");
    act(() => result.current.setParams({ tab: "tedarikci" }));
    expect(window.location.pathname).toBe("/en/company/overview");
    expect(window.location.search).toBe("?tab=tedarikci");
    expect(window.location.hash).toBe("#grafikler");
  });

  it("ardışık hızlı değişim önceki parametreyi düşürmez", () => {
    const { result } = setup();
    act(() => {
      result.current.setParams({ period: "month" });
      result.current.setParams({ tab: "tasarruf" });
    });
    const q = new URLSearchParams(window.location.search);
    expect(q.get("period")).toBe("month");
    expect(q.get("tab")).toBe("tasarruf");
    expect(pushSpy).toHaveBeenCalledTimes(2);
  });

  it("varsayılanlar adrese yazılmaz; özel aralık yalnız geçerliyse taşınır", () => {
    const { result } = setup("/company/sirketim?period=month&tab=tasarruf");
    act(() => result.current.setParams({ period: "year", tab: TABS[0] }));
    expect(window.location.search).toBe("");
    act(() => result.current.setParams({ period: "custom", from: "2026-10-01", to: "2026-10-15" }));
    expect(window.location.search).toBe("?period=custom&from=2026-10-01&to=2026-10-15");
    act(() => result.current.setParams({ period: "custom", from: "2026-10-20", to: "2026-10-15" }));
    const q = new URLSearchParams(window.location.search);
    expect(q.get("from")).toBeNull();
    expect(q.get("to")).toBeNull();
  });

  it("aynı adres yeniden yazılmaz (seçili sekmeye tekrar dokunma geçmişe kayıt eklemez)", () => {
    const { result } = setup("/company/sirketim?tab=tasarruf");
    act(() => result.current.setParams({ tab: "tasarruf" }));
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it("okuma: geçersiz sekme varsayılana, bozuk özel aralık yıla düşer", () => {
    const { result } = setup("/company/sirketim?tab=yok&period=custom&from=2026-10-20&to=2026-10-01");
    expect(result.current.tab).toBe(TABS[0]);
    expect(result.current.period).toBe("year");
    expect(result.current.from).toBeNull();
  });
});
