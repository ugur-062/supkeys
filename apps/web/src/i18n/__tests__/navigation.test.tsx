// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

/**
 * `vitest.setup.ts` `@/i18n/navigation`ı Next'in hook'larıyla sahteler (bileşen
 * testleri sağlayıcısız koşsun diye). Burada GERÇEK sarmalayıcı sınanır:
 * dize adres şablona eşlenip çevrilmeli, `usePathname` iç yolu dönmeli.
 */
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return { ...actual, usePathname: () => "/ru/kompanii/acme/tovary/boru", useParams: () => ({ locale: "ru" }) };
});

// `vitest.setup.ts` next-intl'i TR katalogla sahteler (`useLocale` hep "tr");
// burada dil test başına ayarlanır.
let currentLocale = "tr";
vi.mock("next-intl", () => ({
  useLocale: () => currentLocale,
  NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

// next-intl'in gerçek `createNavigation`ı vitest altında `next/navigation`ı kendi
// paket yolundan çözemiyor (pnpm). Sarmalayıcının sınadığı şey ÇEVİRİ + devretme;
// next-intl'in ön ek mantığı burada basit bir sahteyle temsil edilir.
vi.mock("next-intl/navigation", async () => {
  const { useLocale } = await import("next-intl");
  const prefix = (href: unknown, locale: string) => {
    const h = typeof href === "string" ? href : (href as { pathname: string }).pathname;
    if (!h.startsWith("/") || h.startsWith("//")) return h;
    return locale === "tr" ? h : `/${locale}${h === "/" ? "" : h}`;
  };
  return {
    createNavigation: () => ({
      Link: ({ href, locale, children, ...rest }: { href: unknown; locale?: string; children?: React.ReactNode }) => {
        const current = useLocale();
        return (
          <a href={prefix(href, locale ?? current)} {...rest}>
            {children}
          </a>
        );
      },
      useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn() }),
      getPathname: ({ href, locale }: { href: unknown; locale: string }) => prefix(href, locale),
      redirect: vi.fn(),
      permanentRedirect: vi.fn(),
    }),
  };
});

const real = await vi.importActual<typeof import("../navigation")>("../navigation");

function wrap(locale: "tr" | "en" | "ru", ui: React.ReactNode) {
  currentLocale = locale;
  return render(
    <NextIntlClientProvider locale={locale} messages={{}}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("@/i18n/navigation — gerçek sarmalayıcı", () => {
  it("Link: iç yol → aktif dilin dış yolu (ön ek dahil); Türkçe olduğu gibi", () => {
    wrap("en", <real.Link href="/urunler/kategori/31000000-x?sayfa=2">EN</real.Link>);
    expect(screen.getByText("EN")).toHaveAttribute("href", "/en/products/category/31000000-x?sayfa=2");
    wrap("tr", <real.Link href="/talep/rot-000042-boru">TR</real.Link>);
    expect(screen.getByText("TR")).toHaveAttribute("href", "/talep/rot-000042-boru");
  });

  it("Link locale prop: hedef dilin dış yolu (dil seçici aynı sayfayı taşır)", () => {
    wrap("en", <real.Link href="/company/login" locale="ru">RU</real.Link>);
    expect(screen.getByText("RU")).toHaveAttribute("href", "/ru/kompaniya/vhod");
  });

  it("Türkçeye geçiş bağlantısı ön eksiz ve doğrudan (/tr/… 308 sekmesi yok)", () => {
    wrap("en", <real.Link href="/urunler/sehir/izmir" locale="tr">TR</real.Link>);
    expect(screen.getByText("TR")).toHaveAttribute("href", "/urunler/sehir/izmir");
  });

  it("bilinmeyen yol yalnız ön ek alır, mutlak adres dokunulmaz", () => {
    wrap("ru", <real.Link href="/dev/ui">X</real.Link>);
    expect(screen.getByText("X")).toHaveAttribute("href", "/ru/dev/ui");
    wrap("ru", <real.Link href="https://example.com/urunler">Y</real.Link>);
    expect(screen.getByText("Y")).toHaveAttribute("href", "https://example.com/urunler");
  });

  it("usePathname: tarayıcıdaki dış adres → iç yol", () => {
    function Probe() {
      return <span data-testid="p">{real.usePathname()}</span>;
    }
    wrap("ru", <Probe />);
    expect(screen.getByTestId("p").textContent).toBe("/firma/acme/urun/boru");
  });

  it("getPathname: iç yol + dil → ön ekli dış yol", () => {
    expect(real.getPathname({ href: "/firmalar", locale: "en" })).toBe("/en/companies");
    expect(real.getPathname({ href: "/firmalar", locale: "tr" })).toBe("/firmalar");
  });
});
