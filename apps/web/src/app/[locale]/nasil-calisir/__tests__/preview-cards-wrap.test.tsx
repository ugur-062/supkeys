// @vitest-environment jsdom
/**
 * Nasıl Çalışır önizleme kartları dar ekranda (arayüz testi D-063, yeniden
 * doğrulama). jsdom yerleşim ölçmez; bu test YAPIYI korur: satırdaki eylem
 * kümesi (fiyat + "Выбрать", "Добавить в контакты", seçenek düğmeleri)
 * sığmadığında alt satıra inebilsin — metni tek harfe sıkıştırmasın, üstüne
 * binmesin. En uzun etiketler RU'da olduğundan katalog RU.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-intl", async () => {
  const { createFormatter, createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const MESSAGES = messagesFor("ru", WEB_NAMESPACES);
  const TZ = "Europe/Istanbul";
  const makeT = (namespace?: string) =>
    createTranslator({
      locale: "ru",
      messages: MESSAGES,
      namespace: namespace as never,
      timeZone: TZ,
      onError: () => {},
      getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
    });
  return {
    useTranslations: (namespace?: string) => makeT(namespace),
    useLocale: () => "ru",
    useMessages: () => MESSAGES,
    useFormatter: () => createFormatter({ locale: "ru", timeZone: TZ }),
    useNow: () => new Date(),
    useTimeZone: () => TZ,
    NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/ru/kak-eto-rabotaet",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { BidsPreview, DiscoverPreview, ListingWizardPreview } from "../marketing-page";

/** Satır: metin tarafı esnek tabanlı, eylem kümesi sağa yaslı ve satır sarar. */
function expectWrappingRow(action: HTMLElement) {
  const actionGroup = action.parentElement!;
  const row = actionGroup.parentElement!;
  expect(row).toHaveClass("flex", "flex-wrap");
  expect(actionGroup).toHaveClass("ml-auto", "shrink-0");
  const textSide = row.firstElementChild as HTMLElement;
  expect(textSide).not.toBe(actionGroup);
  expect(textSide.className).toMatch(/flex-\[1_1_\d+rem\]/);
}

describe("Nasıl Çalışır önizleme kartları — D-063", () => {
  it("Поиск: 'Добавить в контакты' alt satıra inebilir, kırılmaz", () => {
    render(<DiscoverPreview />);
    const buttons = screen.getAllByText("Добавить в контакты");
    expect(buttons).toHaveLength(3);
    for (const b of buttons) {
      expect(b).toHaveClass("whitespace-nowrap");
      expectWrappingRow(b);
    }
    // Firma adı tam metin olarak duruyor (yalnız uç durumda kırpılır).
    expect(screen.getByText("Третья компания")).toBeInTheDocument();
  });

  it("Для покупателя: en iyi teklif satırında fiyat + 'Выбрать' alt satıra inebilir", () => {
    render(<BidsPreview />);
    expectWrappingRow(screen.getByText("Выбрать"));
    expect(screen.getByText("Компания B")).toBeInTheDocument();
  });

  it("Новый запрос: seçenekler sığmayınca alt alta dizilir, ikon sıkışmaz", () => {
    render(<ListingWizardPreview />);
    for (const label of ["Внутренний", "Международный", "Закупка", "Продажа"]) {
      const option = screen.getByText(label, { exact: false, selector: "div" });
      expect(option.parentElement).toHaveClass("flex", "flex-wrap");
      expect(option.parentElement).not.toHaveClass("grid-cols-2");
      expect(option).toHaveClass("flex-auto");
      expect(option.querySelector("svg")).toHaveClass("shrink-0");
    }
  });
});
