// @vitest-environment jsdom
/**
 * ÜST ÇUBUK 1024–1279 PX'TE SIĞAR (mobil denetim 2026-10, r1-public#new0).
 *
 * Masaüstü satırı lg'de (1024) açılır. RU'da logo + dört menü satırı + dil +
 * "Войти" + "Бесплатная регистрация" 960 px'lik satıra sığmıyordu: kayıt
 * düğmesi iPad yatayda ekranın sağından 33 px taşıp kırpılıyordu. Çözüm:
 * xl'e dek menü aralığı gap-6 ve kayıt düğmesi kısa etiket
 * (`nav.signupCompact`, RU "Регистрация"); xl'de tam etiket. TR/EN'de kısa
 * etiket tam etiketle aynı → tek metin çizilir, görünüm değişmez.
 *
 * jsdom yerleşim hesaplamaz; bu test YAPIYI korur (ölçüm: RU 1024'te kısa
 * etiket + gap-6 ile satırda ~48 px boşluk kalır).
 */
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const intl = vi.hoisted(() => ({ locale: "ru" as "tr" | "en" | "ru" }));

vi.mock("next-intl", async () => {
  const { createFormatter, createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  const TZ = "Europe/Istanbul";
  const messages = () => messagesFor(intl.locale, WEB_NAMESPACES);
  const makeT = (namespace?: string) =>
    createTranslator({
      locale: intl.locale,
      messages: messages(),
      namespace: namespace as never,
      timeZone: TZ,
      onError: () => {},
      getMessageFallback: ({ namespace: ns, key }) => (ns ? `${ns}.${key}` : key),
    });
  return {
    useTranslations: (namespace?: string) => makeT(namespace),
    useLocale: () => intl.locale,
    useMessages: () => messages(),
    useFormatter: () => createFormatter({ locale: intl.locale, timeZone: TZ }),
    useNow: () => new Date(),
    useTimeZone: () => TZ,
    NextIntlClientProvider: ({ children }: { children: ReactNode }) => children,
  };
});
vi.mock("next/navigation", () => ({
  usePathname: () => "/hakkimizda",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { MarketingHeader } from "../marketing-header";

const cls = (el: Element | null | undefined) => (el?.getAttribute("class") ?? "").split(/\s+/);

/** Masaüstü satırındaki kayıt bağlantısı (çekmece kapalıyken tek kayıt bağlantısı). */
const desktopSignup = () =>
  screen.getAllByRole("link").find((a) => a.getAttribute("href")?.includes("/company/kayit"))!;

const desktopNav = (container: HTMLElement) => container.querySelector("header nav")!;

beforeEach(() => {
  window.localStorage.clear();
});

describe("MarketingHeader — masaüstü satırı 1024–1279 px'te sığar", () => {
  it("RU: xl altında kısa etiket 'Регистрация', xl'de tam etiket; ikisi CSS ile değişir", () => {
    intl.locale = "ru";
    render(<MarketingHeader />);
    const link = desktopSignup();
    const compact = within(link).getByText("Регистрация");
    const full = within(link).getByText("Бесплатная регистрация");
    expect(cls(compact)).toContain("xl:hidden");
    expect(cls(full)).toEqual(expect.arrayContaining(["hidden", "xl:inline"]));
    // Düğme tek satırda kalır (etiket bölünmez).
    expect(cls(link)).toContain("whitespace-nowrap");
    // "Войти" düz metin bağlantısı iPad yatayda dokunmatikle kullanılır:
    // dokunma alanı 44 px (eskiden 20 px).
    const login = screen.getAllByRole("link", { name: "Войти" })[0];
    expect(cls(login)).toEqual(expect.arrayContaining(["min-h-11", "items-center", "whitespace-nowrap"]));
  });

  it("TR/EN: kısa etiket tam etiketle aynı → tek metin, ek span yok", () => {
    for (const [locale, label] of [
      ["tr", "Ücretsiz Kaydol"],
      ["en", "Sign Up Free"],
    ] as const) {
      intl.locale = locale;
      const { unmount } = render(<MarketingHeader />);
      const link = desktopSignup();
      expect(link).toHaveTextContent(label);
      expect(link.textContent).toBe(label);
      expect(link.querySelector("span")).toBeNull();
      unmount();
    }
  });

  it("menü aralığı lg'de gap-6, xl'de gap-8 (eski sabit gap-8 RU'da satırı taşırıyordu)", () => {
    intl.locale = "ru";
    const { container } = render(<MarketingHeader />);
    const nav = desktopNav(container);
    expect(cls(nav)).toEqual(expect.arrayContaining(["gap-6", "xl:gap-8", "lg:flex", "lg:mx-auto"]));
    expect(cls(nav)).not.toContain("gap-8");
  });

  it("RU mobil çekmecede kayıt düğmesi tam etiketi taşır (yer dar değil)", async () => {
    intl.locale = "ru";
    const { default: userEvent } = await import("@testing-library/user-event");
    const user = userEvent.setup();
    render(<MarketingHeader />);
    await user.click(screen.getByRole("button", { name: "Открыть меню" }));
    const dialog = await screen.findByRole("dialog");
    const signup = within(dialog).getByRole("link", { name: "Бесплатная регистрация" });
    expect(signup.textContent).toBe("Бесплатная регистрация");
  });
});
