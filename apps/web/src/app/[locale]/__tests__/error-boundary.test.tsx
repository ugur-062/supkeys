// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/client-error", () => ({ reportClientError: vi.fn() }));

import { reportClientError } from "@/lib/client-error";
import { PUBLIC_API_UNAVAILABLE_DIGEST } from "@/lib/public/unavailable";
import { AUTO_RETRY_DELAYS_MS, resetAutoRetryMemory } from "@/components/ui/unavailable-state";
import AppError from "../error";

/** Üretimde istemciye gelen kesinti hatası: mesaj genel, yalnız `digest` anlamlı. */
const outage = () =>
  Object.assign(new Error("An error occurred in the Server Components render."), { digest: PUBLIC_API_UNAVAILABLE_DIGEST });

beforeEach(() => {
  refresh.mockClear();
  vi.mocked(reportClientError).mockClear();
  resetAutoRetryMemory();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

/**
 * Akış başladıktan sonra atılan hata (ör. API kesintisi — yayın denetimi B1-1)
 * 200 durum koduyla gelir; hata sayfası "ince içerik" olarak indekslenmesin.
 */
describe("segment hata sınırı", () => {
  it("noindex meta etiketini <head>'e koyar", () => {
    render(<AppError error={new Error("api down")} reset={() => {}} />);
    const meta = document.head.querySelector('meta[name="robots"]');
    expect(meta?.getAttribute("content")).toBe("noindex");
  });

  it("Tekrar dene: rotayı sunucudan yeniden ister ve sınırı sıfırlar (arayüz testi O-112)", async () => {
    const reset = vi.fn();
    render(<AppError error={new Error("api down")} reset={reset} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /Tekrar dene/i }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it("sıradan hata: genel ekran + hata bildirimi (kesinti ekranı DEĞİL)", () => {
    render(<AppError error={Object.assign(new Error("boom"), { digest: "3749470233" })} reset={() => {}} />);
    expect(screen.getByText("Bir şeyler ters gitti")).toBeInTheDocument();
    expect(screen.queryByText("Sayfa şu anda yüklenemiyor")).not.toBeInTheDocument();
    expect(reportClientError).toHaveBeenCalledTimes(1);
  });
});

/**
 * API'YE ULAŞILAMADI (2026-10-08, staging kesintisi): uyuyan/yeniden başlayan
 * API yüzünden önbellekte olmayan sayfa genel "Bir şeyler ters gitti" ekranını
 * gösteriyordu. Kesinti artık kendi sakin ekranını alır, birkaç kez
 * kendiliğinden yeniden dener ve sonra durur.
 */
describe("segment hata sınırı — API kesintisi", () => {
  it("sakin ve özgül ekran: ne olduğunu ve yeniden deneneceğini söyler, genel metni basmaz", () => {
    render(<AppError error={outage()} reset={() => {}} />);
    expect(screen.getByText("Sayfa şu anda yüklenemiyor")).toBeInTheDocument();
    expect(screen.getByText(/Sunucumuza geçici olarak ulaşılamıyor/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Sayfa kısa süre içinde kendiliğinden yeniden denenecek.");
    expect(screen.queryByText("Bir şeyler ters gitti")).not.toBeInTheDocument();
    // Hata sayfası indekslenmez (kesinti ekranında da).
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex");
  });

  it("sekme başlığı boş kalmaz (500 belgesi başlıksız gelir); ekran kalkınca başlık da kalkar", () => {
    const view = render(<AppError error={outage()} reset={() => {}} />);
    expect(document.title).toBe("Sayfa şu anda yüklenemiyor · Rothern");
    view.unmount();
    expect(document.head.querySelector("title")).toBeNull();
  });

  it("kesinti tarayıcıdan ayrıca BİLDİRİLMEZ (sunucu zaten yazdı; kesintide gürültü olmasın)", () => {
    render(<AppError error={outage()} reset={() => {}} />);
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("elle Tekrar dene: sunucudan yeniden ister + sınırı sıfırlar", async () => {
    const reset = vi.fn();
    render(<AppError error={outage()} reset={reset} />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(reset).toHaveBeenCalledTimes(1);
  });

  describe("otomatik yeniden deneme", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });
    const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

    it("ilk deneme 5 sn sonra, öncesinde değil — sunucudan yeniden ister + sınırı sıfırlar", async () => {
      const reset = vi.fn();
      render(<AppError error={outage()} reset={reset} />);
      await advance(AUTO_RETRY_DELAYS_MS[0] - 100);
      expect(refresh).not.toHaveBeenCalled();
      await advance(200);
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it("büyüyen aralıklarla birkaç kez dener, sonra DURUR (sonsuz yoklama yok)", async () => {
      const reset = vi.fn();
      const view = render(<AppError error={outage()} reset={reset} />);
      for (let i = 0; i < AUTO_RETRY_DELAYS_MS.length; i++) {
        // Aralık dolmadan yeni deneme yok.
        await advance(AUTO_RETRY_DELAYS_MS[i] - 100);
        expect(refresh).toHaveBeenCalledTimes(i);
        await advance(200);
        expect(refresh).toHaveBeenCalledTimes(i + 1);
        // Deneme başarısız: sınır aynı ekranı YENİ hata nesnesiyle çizer.
        view.rerender(<AppError error={outage()} reset={reset} />);
      }
      expect(AUTO_RETRY_DELAYS_MS.every((ms, i, all) => i === 0 || ms > all[i - 1])).toBe(true);
      expect(screen.getByRole("status")).toHaveTextContent("Otomatik denemeler durdu. Biraz bekleyip yeniden deneyebilirsiniz.");
      await advance(10 * 60_000);
      expect(refresh).toHaveBeenCalledTimes(AUTO_RETRY_DELAYS_MS.length);
      // Elle deneme durduktan sonra da çalışır.
      vi.useRealTimers();
      await userEvent.setup().click(screen.getByRole("button", { name: "Tekrar dene" }));
      expect(refresh).toHaveBeenCalledTimes(AUTO_RETRY_DELAYS_MS.length + 1);
    });

    it("sınır ekranı YENİDEN BAĞLASA da sayaç sürer (deneme sayısı sıfırlanmaz)", async () => {
      const reset = vi.fn();
      for (let i = 0; i < AUTO_RETRY_DELAYS_MS.length; i++) {
        const view = render(<AppError error={outage()} reset={reset} />);
        await advance(AUTO_RETRY_DELAYS_MS[i] + 100);
        expect(refresh).toHaveBeenCalledTimes(i + 1);
        view.unmount();
      }
      render(<AppError error={outage()} reset={reset} />);
      expect(screen.getByRole("status")).toHaveTextContent("Otomatik denemeler durdu.");
      await advance(10 * 60_000);
      expect(refresh).toHaveBeenCalledTimes(AUTO_RETRY_DELAYS_MS.length);
    });

    it("gizli sekmede sunucu yoklanmaz; sekme görünür olunca dener", async () => {
      const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
      render(<AppError error={outage()} reset={() => {}} />);
      await advance(AUTO_RETRY_DELAYS_MS[0] + 60_000);
      expect(refresh).not.toHaveBeenCalled();
      visibility.mockReturnValue("visible");
      await act(async () => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("sıradan hatada otomatik deneme YOK", async () => {
      render(<AppError error={new Error("boom")} reset={() => {}} />);
      await advance(10 * 60_000);
      expect(refresh).not.toHaveBeenCalled();
    });
  });
});
