import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MİSAFİR TALEBİ ONAYI — API çağrısı sayfa dilinde (derin denetim LU-23):
 * başlıksız sunucu `fetch`i API'yi Türkçeye düşürüyordu; EN/RU sayfada
 * "Bağlantı geçersiz" gibi Türkçe hata cümlesi çıkıyordu. Ayrıca SSR sırrı
 * gitmeyince hız sınırı tüm misafirlerin ortak Vercel IP'sine sayılıyordu.
 */
vi.mock("@/lib/public/marketplace-live", () => ({ MARKETPLACE_LIVE: true }));
vi.mock("@/lib/public/ssr-visitor", async (orig) => ({
  ...(await orig<typeof import("@/lib/public/ssr-visitor")>()),
  attributeSsrToVisitor: async () => {},
}));
vi.mock("@/components/marketplace/public-layout", () => ({
  PublicLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next-intl/server", () => {
  const t = Object.assign((key: string) => `t:${key}`, { rich: (key: string) => `t:${key}` });
  return {
    getTranslations: async () => t,
    setRequestLocale: () => {},
    getLocale: async () => "tr",
  };
});

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.test/api");
  vi.stubEnv("SEO_REVALIDATE_SECRET", "s".repeat(32));
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function renderPage(locale: string) {
  const { default: Page } = await import("../page");
  const el = await Page({
    params: Promise.resolve({ locale }),
    searchParams: Promise.resolve({ t: "abc" }),
  });
  return renderToStaticMarkup(el);
}

describe("talep onayı — dil ve SSR başlıkları", () => {
  it("verify çağrısı sayfa dilini ve SSR sırrını gönderir; API mesajı gösterilir", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ message: "The link is invalid." }),
    });
    const html = await renderPage("en");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string>; cache: string }];
    expect(url).toBe("https://api.test/api/public/inquiries/verify?t=abc");
    expect(init.cache).toBe("no-store");
    expect(init.headers["accept-language"]).toBe("en");
    expect(init.headers["x-rothern-ssr"]).toBe("s".repeat(32));
    expect(html).toContain("The link is invalid.");
  });

  it("Rusça sayfa ru gönderir", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => null });
    const html = await renderPage("ru");
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers["accept-language"]).toBe("ru");
    expect(html).toContain("t:invalidLink");
  });
});
