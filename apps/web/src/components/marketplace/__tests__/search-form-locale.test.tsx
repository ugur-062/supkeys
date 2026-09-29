// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * DİL ÖNEKİ SÖZLEŞMESİ (derin denetim Y-17): düz GET arama formları
 * next-intl sarmalayıcısından geçmez ve `localeDetection: false` ile ön eksiz
 * adres her zaman `tr` çözülür. Bu yüzden her form `action`ı aktif dilin DIŞ
 * yolu olmalı — yoksa EN/RU ziyaretçi aramada Türkçe siteye düşer.
 *
 * `vitest.setup.ts` sahtesi dili `tr`ye sabitler; burada dil değişken.
 */
const h = vi.hoisted(() => ({ locale: "tr" as string }));

vi.mock("next-intl", async () => {
  const { createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("tr", WEB_NAMESPACES);
  return {
    useTranslations: (namespace?: string) =>
      createTranslator({
        locale: "tr",
        messages: MESSAGES,
        namespace: namespace as never,
        timeZone: "Europe/Istanbul",
        onError: () => {},
        getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
      }),
    useLocale: () => h.locale,
  };
});
vi.mock("next-intl/server", async () => {
  const { createFormatter, createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("tr", WEB_NAMESPACES);
  return {
    getTranslations: async (namespace?: string) =>
      createTranslator({
        locale: "tr",
        messages: MESSAGES,
        namespace: namespace as never,
        timeZone: "Europe/Istanbul",
        onError: () => {},
        getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
      }),
    getFormatter: async () => createFormatter({ locale: "tr", timeZone: "Europe/Istanbul" }),
    getLocale: async () => h.locale,
  };
});
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-ai-search-intent", () => ({
  useAiSearchIntent: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SearchForm } from "../search-form";
import { SearchTypeahead } from "../search-typeahead";
import { CompanyProducts } from "../company-products";
import { PanelHeroSearch } from "@/components/dashboard/panel-hero-search";

const EMPTY = { items: [], total: 0, page: 1, pageSize: 24 };

beforeEach(() => {
  h.locale = "tr";
});

describe("arama formları dil önekini korur (Y-17)", () => {
  it.each([
    ["tr", "/urunler"],
    ["en", "/en/products"],
    ["ru", "/ru/tovary"],
  ])("SearchForm %s → %s", (locale, expected) => {
    h.locale = locale;
    const { container } = render(<SearchForm action="/urunler" />);
    expect(container.querySelector("form")?.getAttribute("action")).toBe(expected);
  });

  it("SearchForm alım talepleri dizini EN'de çevrili yola gider", () => {
    h.locale = "en";
    const { container } = render(<SearchForm action="/alim-talepleri" />);
    expect(container.querySelector("form")?.getAttribute("action")).toBe("/en/buying-requests");
  });

  it.each([
    ["tr", "/urunler"],
    ["en", "/en/products"],
    ["ru", "/ru/tovary"],
  ])("SearchTypeahead %s → %s", (locale, expected) => {
    h.locale = locale;
    const { container } = render(<SearchTypeahead />);
    expect(container.querySelector("form")?.getAttribute("action")).toBe(expected);
  });

  it.each([
    ["tr", "/firma/acme#urunler"],
    ["en", "/en/companies/acme#urunler"],
    ["ru", "/ru/kompanii/acme#urunler"],
  ])("CompanyProducts firma içi arama %s → %s", async (locale, expected) => {
    h.locale = locale;
    const el = await CompanyProducts({ companySlug: "acme", page: EMPTY, query: "pompa" });
    const { container } = render(el!);
    const form = container.querySelector("form");
    expect(form?.getAttribute("action")).toBe(expected);
    expect(form?.getAttribute("method")).toBe("get");
  });

  it("PanelHeroSearch: hidrasyon öncesi form hedefi DIŞ yol, router'a İÇ yol gider", () => {
    h.locale = "en";
    render(<PanelHeroSearch title="t" lead="l" placeholder="p" action="/urunler" />);
    const form = screen.getByRole("search");
    expect(form.getAttribute("action")).toBe("/en/products");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "pipe" } });
    fireEvent.submit(form);
    // `@/i18n/navigation` router'ı ön eki kendisi ekler → İÇ yol beklenir.
    expect(push).toHaveBeenLastCalledWith("/urunler?q=pipe");
  });
});
