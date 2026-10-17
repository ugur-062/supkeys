import { EmailProgramsService } from "../../src/modules/email-programs/email-programs.service";

/**
 * Karşılama serisi "pazar" adımı (derin denetim boşluk taraması GA2), ücretsiz
 * dönem (2026-10-07): açık talepleri göremeyen firma DOĞRULANMAMIŞ firmadır —
 * gövde doğrulama ister ve düğme doğrulama sayfasına gider; düğme etiketi de
 * "Açık talepleri gör" DEĞİL, doğrulamayı söyler (incelemedeki firmada "durumu
 * gör"). Paket adı / paket sayfası hiçbir dilde geçmez. Tam yetkili firma açık
 * taleplere gider, etiket aynen kalır.
 */
const PACKAGE_WORD = /silver|gold|premium|paket|package|plans|тариф|tarify/i;
describe("lifecycle market CTA", () => {
  function setup() {
    const send = jest.fn(async (_input: unknown) => ({ emailLogId: "log", sent: true }));
    const svc = new EmailProgramsService(
      {} as never,
      { send } as never,
      { get: () => "https://www.rothern.com" } as never,
    );
    const call = (locale: string, free: boolean, pending = false) =>
      (svc as unknown as {
        sendLifecycleEmail: (
          companyId: string,
          owner: { email: string; firstName: string; locale: string },
          step: "market",
          p: { matches: number; free: boolean; pending: boolean },
        ) => Promise<boolean>;
      }).sendLifecycleEmail("c1", { email: "a@b.co", firstName: "Ayşe", locale }, "market", {
        matches: 3,
        free,
        pending,
      });
    const data = (i: number) =>
      (
        send.mock.calls[i]![0] as {
          templateData: { data: { ctaLabel: string; ctaUrl: string; paragraphs: string[] } };
        }
      ).templateData.data;
    return { call, data };
  }

  it("doğrulanmamış firma: doğrulama sayfası + 'Ücretsiz doğrulan' etiketi (üç dil), paket sözcüğü yok", async () => {
    const { call, data } = setup();
    await call("tr", true);
    await call("en", true);
    await call("ru", true);
    expect(data(0)).toEqual(
      expect.objectContaining({
        ctaLabel: "Ücretsiz doğrulan",
        ctaUrl: "https://www.rothern.com/company/ayarlar/dogrulama",
      }),
    );
    expect(data(0).paragraphs.join(" ")).toMatch(/doğrulanmış olması gerekir/);
    expect(data(1).ctaLabel).toBe("Get verified for free");
    expect(data(1).ctaUrl).toBe("https://www.rothern.com/en/company/settings/verification");
    expect(data(2).ctaLabel).toBe("Пройти бесплатную проверку");
    expect(data(2).ctaUrl).toBe("https://www.rothern.com/ru/kompaniya/nastroyki/verifikatsiya");
    for (const i of [0, 1, 2]) {
      expect(JSON.stringify(data(i))).not.toMatch(PACKAGE_WORD);
    }
  });

  it("doğrulaması incelemedeki firma: aynı sayfa, 'durumu gör' etiketi ve 'inceleniyor' gövdesi", async () => {
    const { call, data } = setup();
    await call("tr", true, true);
    expect(data(0)).toEqual(
      expect.objectContaining({
        ctaLabel: "Doğrulama durumunu gör",
        ctaUrl: "https://www.rothern.com/company/ayarlar/dogrulama",
      }),
    );
    expect(data(0).paragraphs.join(" ")).toMatch(/inceleniyor/);
    expect(JSON.stringify(data(0))).not.toMatch(PACKAGE_WORD);
  });

  it("tam yetkili firma: açık talepler + 'Açık talepleri gör'", async () => {
    const { call, data } = setup();
    await call("tr", false);
    expect(data(0)).toEqual(expect.objectContaining({ ctaLabel: "Açık talepleri gör", ctaUrl: "https://www.rothern.com/company/satis" }));
  });
});
