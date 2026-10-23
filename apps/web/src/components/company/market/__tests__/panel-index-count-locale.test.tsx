// @vitest-environment jsdom
/**
 * Dizin başlığındaki sonuç sayısı (derin denetim S067): EN/RU mesajı
 * `{n, plural, ... # ...}` biçiminde; kod `n`e biçimlenmiş STRING ("1,234")
 * verdiğinde intl-messageformat NaN hesaplayıp "NaN companies" basıyordu.
 * Bu dosya next-intl sahtesini EN katalogla kurar.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { createFormatter, createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("en", WEB_NAMESPACES);
  const TZ = "Europe/Istanbul";
  const makeT = (namespace?: string) =>
    createTranslator({
      locale: "en",
      messages: MESSAGES,
      namespace: namespace as never,
      timeZone: TZ,
      onError: () => {},
      getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
    });
  return {
    useTranslations: (namespace?: string) => makeT(namespace),
    useLocale: () => "en",
    useMessages: () => MESSAGES,
    useFormatter: () => createFormatter({ locale: "en", timeZone: TZ }),
    useNow: () => new Date(),
    useTimeZone: () => TZ,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma/firmalar",
}));
vi.mock("@/hooks/use-categories", () => ({ useCategoriesByIds: () => ({ data: [] }) }));
vi.mock("@/hooks/use-portal-discovery", () => ({
  useDiscoverSearch: () => ({ data: { items: [], total: 4321, page: 1, pageSize: 24 }, isLoading: false }),
  useDiscoverProductFacets: () => ({
    data: {
      categories: [],
      selectedCategory: null,
      subCategories: [],
      cities: [],
      activities: [],
      verified: 0,
      price: { has: 0, request: 0 },
      attributes: [],
    },
  }),
}));
vi.mock("@/hooks/use-company-directory", () => ({
  useCompanySearch: () => ({ data: { items: [], total: 1234, page: 1, pageSize: 20 }, isLoading: false }),
  useCompanySearchFacets: () => ({
    data: { total: 1234, verified: 0, withProducts: 0, gold: 0, cities: [], activities: [], categories: [] },
  }),
}));

import { PanelCompanyIndex } from "../panel-company-index";
import { PanelProductIndex } from "../panel-product-index";

describe("dizin sonuç sayısı — EN çoğul", () => {
  it("firma dizini 1000+ sonuçta gruplanmış sayı basar, NaN değil", () => {
    render(<PanelCompanyIndex />);
    expect(screen.getAllByText(/1,234 companies/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("ürün dizini 1000+ sonuçta gruplanmış sayı basar, NaN değil", () => {
    render(<PanelProductIndex />);
    expect(screen.getAllByText(/4,321 products/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });
});
