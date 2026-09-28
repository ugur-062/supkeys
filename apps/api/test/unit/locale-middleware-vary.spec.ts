import { LocaleMiddleware } from "../../src/common/i18n/locale.middleware";
import { currentLocale } from "../../src/common/i18n/locale-context";

/**
 * Yayın denetimi 2026-09-28 Bölüm 5: herkese açık uçlar `s-maxage` ile
 * paylaşımlı önbelleğe izin verirken yanıt `Accept-Language`a göre değişiyor ve
 * `Vary` yalnız geo ucundaydı → önbellek ilk isteğin dilini herkese dağıtabilirdi.
 */
describe("LocaleMiddleware", () => {
  it("her yanıta Vary: Accept-Language ekler ve isteğin dilini bağlama yazar", () => {
    const vary = jest.fn();
    let seen: string | undefined;
    new LocaleMiddleware().use(
      { headers: { "accept-language": "ru-RU,ru;q=0.9" } } as never,
      { vary } as never,
      () => {
        seen = currentLocale();
      },
    );
    expect(vary).toHaveBeenCalledWith("Accept-Language");
    expect(seen).toBe("ru");
  });
});
