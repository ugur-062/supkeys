// @vitest-environment jsdom
/**
 * Nasıl Çalışır telefonda (mobil denetim 2026-10 g01). jsdom yerleşim
 * hesaplamaz; bu test YAPIYI korur. Katalog RU (en uzun etiketler).
 *
 *  - Vitrin bölümü: şablonsuz tek sütunlu ızgaranın örtük sütunu içindeki
 *    maketin en küçük genişliğine büyüyordu (RU 394 px > 360 px ekran) ve
 *    bölümün `overflow-hidden`ı metni sağdan kırpıyordu. `grid-cols-1`
 *    (minmax(0, 1fr)) sütunu ekrana bağlar; maketin eylem satırı sarar.
 *  - Alttaki koyu çağrı: kayıt ve giriş yan yana sığmıyordu (RU düğme ve ok
 *    kartın yuvarlak kenarında kırpık) → telefonda alt alta.
 */
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
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
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/ru/kak-eto-rabotaet",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/marketplace/public-layout", () => ({
  PublicLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

import HomePage, { BidsPreview, PublicProfilePreview, ShowcasePreview } from "../marketing-page";

const cls = (el: Element | null) => (el?.getAttribute("class") ?? "").split(/\s+/);

describe("Nasıl Çalışır — telefonda taşma yok (mobil denetim 2026-10 g01)", () => {
  it("Vitrin bölümü: ızgara tek sütunu ekrana bağlar (grid-cols-1), maket sütunu daralabilir", () => {
    render(<HomePage />);
    const heading = screen.getByText("Ваш публичный профиль — Ваша цифровая витрина");
    const grid = heading.closest("div.grid");
    expect(grid).not.toBeNull();
    expect(cls(grid)).toEqual(expect.arrayContaining(["grid-cols-1", "lg:grid-cols-2"]));
    // Maketi taşıyan Reveal sarmalayıcısı da ızgarada daralabilir.
    const mockupWrapper = grid!.lastElementChild as HTMLElement;
    expect(cls(mockupWrapper)).toContain("min-w-0");
  });

  it("öteki maket ızgaraları da tek sütunu ekrana bağlar", () => {
    const { container } = render(<HomePage />);
    // Şablonsuz (örtük sütunlu) çok sütunlu ızgara kalmaz: lg'de iki sütuna
    // açılan her ızgara telefonda `grid-cols-1` taşır.
    const twoCol = [...container.querySelectorAll(".lg\\:grid-cols-2")];
    expect(twoCol.length).toBeGreaterThanOrEqual(3);
    for (const g of twoCol) expect(cls(g)).toContain("grid-cols-1");
  });

  it("vitrin maketi: eylem satırı sarar, metin tarafı daralır, eylem bölünmez", () => {
    render(<PublicProfilePreview />);
    const action = screen.getByText("Запрос на контакт", { exact: false });
    expect(cls(action)).toEqual(expect.arrayContaining(["ml-auto", "shrink-0", "whitespace-nowrap"]));
    const row = action.parentElement!;
    expect(cls(row)).toEqual(expect.arrayContaining(["flex", "flex-wrap"]));
    const textSide = row.firstElementChild as HTMLElement;
    expect(textSide).not.toBe(action);
    // Esas `auto` (içerik genişliği): tam metin eylemin yanına sığmazsa eylem
    // alta iner; sabit 8rem esasla 390 px'te satır sarmıyor, metin "…" ile
    // kesiliyordu (2. tur g01).
    expect(cls(textSide)).toEqual(expect.arrayContaining(["min-w-0", "flex-[1_1_auto]"]));
    expect(cls(textSide).some((c) => /^flex-\[1_1_\d/.test(c))).toBe(false);
    const label = screen.getByText("Чтобы работать с этой компанией");
    expect(cls(label)).toEqual(expect.arrayContaining(["min-w-0", "truncate"]));
  });

  it("vitrin kartı gelen talepler: 'Ответить' sığmazsa alta iner, ad ve mesaj tam kalır (2. tur g01)", () => {
    render(<ShowcasePreview />);
    const reply = screen.getByText("Ответить", { exact: false });
    const actionGroup = reply.parentElement!;
    const row = actionGroup.parentElement!;
    expect(cls(row)).toEqual(expect.arrayContaining(["flex", "flex-wrap"]));
    expect(cls(actionGroup)).toEqual(expect.arrayContaining(["ml-auto", "shrink-0"]));
    const textSide = row.firstElementChild as HTMLElement;
    expect(textSide).not.toBe(actionGroup);
    expect(cls(textSide)).toEqual(expect.arrayContaining(["min-w-0", "flex-[1_1_auto]"]));
    expect(textSide).toContainElement(screen.getByText("Покупатель Y"));
    // Mesaj önizlemesi tek satırda kesilmez, en çok iki satıra kırılır.
    expect(cls(screen.getByText("Цена за 500 шт.?"))).toEqual(expect.arrayContaining(["line-clamp-2"]));
    expect(cls(screen.getByText("Цена за 500 шт.?"))).not.toContain("truncate");
    // Yalnız ok taşıyan satır sarmaz: ok tek başına alt satıra düşmez.
    const plainRow = screen.getByText("Образец и срок поставки?").closest("div.rounded-xl")!;
    expect(cls(plainRow)).not.toContain("flex-wrap");
    expect(cls(plainRow.firstElementChild)).toEqual(expect.arrayContaining(["min-w-0", "flex-1"]));
  });

  it("alıcı teklif listesi: 'Выбрать' satırı sarar, firma adı tam kalır (3. tur r1-public#new1)", () => {
    render(<BidsPreview />);
    const choose = screen.getByText("Выбрать");
    const actionGroup = choose.parentElement!;
    const row = actionGroup.parentElement!;
    expect(cls(row)).toEqual(expect.arrayContaining(["flex", "flex-wrap"]));
    expect(cls(actionGroup)).toEqual(expect.arrayContaining(["ml-auto", "shrink-0"]));
    const textSide = row.firstElementChild as HTMLElement;
    expect(textSide).not.toBe(actionGroup);
    // Esas `auto`: rozet + tam ad fiyatın yanına sığmazsa fiyat alta iner.
    // Sabit 8rem esasla RU 1024–1050 px'te ad "Компан…" diye kesiliyordu.
    expect(cls(textSide)).toEqual(expect.arrayContaining(["min-w-0", "flex-[1_1_auto]"]));
    expect(cls(textSide).some((c) => /^flex-\[1_1_\d/.test(c))).toBe(false);
    expect(textSide).toContainElement(screen.getByText("Компания B"));
    // Fiyat ve rozet bölünmez.
    expect(cls(screen.getByText("ЛУЧШЕЕ"))).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap"]));
    expect(cls(choose)).toContain("whitespace-nowrap");
    // Öteki teklif satırları da aynı kalıpta.
    for (const name of ["Компания A", "Компания C"]) {
      const side = screen.getByText(name).parentElement!;
      expect(cls(side)).toEqual(expect.arrayContaining(["min-w-0", "flex-[1_1_auto]"]));
    }
  });

  it("AI kartı: dosya satırı sarar, kalem adları kesilmez, miktar bölünmez (2. tur g01)", () => {
    render(<HomePage />);
    const file = screen.getByText("spetsifikatsiya-2026.pdf");
    const textSide = file.parentElement!;
    const row = textSide.parentElement!;
    expect(cls(row)).toEqual(expect.arrayContaining(["flex", "flex-wrap"]));
    expect(cls(textSide)).toEqual(expect.arrayContaining(["min-w-0", "flex-[1_1_auto]"]));
    const badge = row.lastElementChild as HTMLElement;
    expect(badge).not.toBe(textSide);
    expect(cls(badge)).toEqual(expect.arrayContaining(["ml-auto", "shrink-0", "whitespace-nowrap"]));
    // Rozet alta indiği hâlde ad sığmıyorsa (iki sütunlu kart, 640-690 px)
    // kesilmez: tiresinden kırılır ("-2026" tire+rakamda tarayıcı kırmaz).
    expect(cls(file)).not.toContain("truncate");
    expect(cls(file)).toEqual(expect.arrayContaining(["min-w-0", "break-words"]));
    expect(file.querySelectorAll("wbr")).toHaveLength(1);
    expect(file.querySelector("wbr")!.previousSibling?.textContent).toBe("-");
    const item = screen.getByText("Стальная труба Ø60 · 3 мм");
    expect(cls(item)).not.toContain("truncate");
    expect(cls(item)).toContain("min-w-0");
    expect(cls(item.nextElementSibling)).toEqual(expect.arrayContaining(["shrink-0", "whitespace-nowrap"]));
  });

  it("alttaki çağrı: telefonda alt alta (kayıt tam genişlik), sm'de yan yana; giriş bölünmez ve 44 px", () => {
    render(<HomePage />);
    const signup = screen.getByRole("link", { name: "Зарегистрироваться бесплатно" });
    const login = screen.getByRole("link", { name: /Войти/ });
    const row = signup.parentElement!;
    expect(row).toContainElement(login);
    expect(cls(row)).toEqual(expect.arrayContaining(["flex-col", "sm:flex-row"]));
    expect(cls(signup)).toEqual(expect.arrayContaining(["w-full", "sm:w-auto"]));
    expect(cls(login)).toEqual(expect.arrayContaining(["whitespace-nowrap", "min-h-11"]));
  });
});
