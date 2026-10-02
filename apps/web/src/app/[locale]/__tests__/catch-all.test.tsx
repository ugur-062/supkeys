import { describe, expect, it, vi } from "vitest";
import { isHTTPAccessFallbackError } from "next/dist/client/components/http-access-fallback/http-access-fallback";

/**
 * Bilinmeyen yol (arayüz testi D-081, yeniden doğrulama): sunucu HTML'i doğru
 * 404 başlığını yazıyordu, ama tarayıcı hidrasyondan sonra metayı catch-all
 * sayfanın RSC ağacından kurduğu için başlık "Rothern"e, robots
 * `index, follow | noindex`e dönüyordu. Catch-all artık 404 metasını kendisi
 * verir ve not-found.tsx ile birebir aynıdır (tek kaynak).
 */
// Ortak kurulum getTranslations'ı yalnız TR kurar; burada istenen dilin
// kataloğu kullanılır (EN/RU başlığı da doğrulansın).
vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("use-intl/core");
  const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
  return {
    getLocale: async () => "tr",
    getTranslations: async ({ locale, namespace }: { locale: "tr" | "en" | "ru"; namespace: string }) =>
      createTranslator({ locale, messages: messagesFor(locale, WEB_NAMESPACES), namespace: namespace as never }),
  };
});

import CatchAllPage, { generateMetadata } from "../[...rest]/page";
import { generateMetadata as notFoundMeta } from "../not-found";

describe("[locale]/[...rest] catch-all", () => {
  it.each([
    ["tr", "Sayfa bulunamadı"],
    ["en", "Page not found"],
    ["ru", "Страница не найдена"],
  ])("meta (%s): yerelleştirilmiş 404 başlığı, kök robots sıfırlanır", async (locale, title) => {
    const meta = await generateMetadata({ params: Promise.resolve({ locale }) });
    expect(meta.title).toBe(title);
    expect(meta).toHaveProperty("robots", null);
  });

  it("not-found.tsx metasıyla aynı (iki yol ayrışmaz)", async () => {
    const params = () => Promise.resolve({ locale: "en" });
    expect(await generateMetadata({ params: params() })).toEqual(await notFoundMeta({ params: params() }));
  });

  it("sayfa notFound() fırlatır", () => {
    let thrown: unknown;
    try {
      CatchAllPage();
    } catch (e) {
      thrown = e;
    }
    expect(isHTTPAccessFallbackError(thrown)).toBe(true);
  });
});
