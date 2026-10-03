import { EmailProgramsService } from "../../src/modules/email-programs/email-programs.service";

/**
 * Karşılama serisi "pazar" adımı (derin denetim boşluk taraması GA2): ücretsiz
 * firmada gövde "Silver'a geçin" der ve düğme paket sayfasına gider — düğme
 * etiketi de "Açık talepleri gör" DEĞİL, "Silver'a geç" olmalı. Ücretli firma
 * açık taleplere gider, etiket aynen kalır.
 */
describe("lifecycle market CTA", () => {
  function setup() {
    const send = jest.fn(async (_input: unknown) => ({ emailLogId: "log", sent: true }));
    const svc = new EmailProgramsService(
      {} as never,
      { send } as never,
      { get: () => "https://www.rothern.com" } as never,
    );
    const call = (locale: string, free: boolean) =>
      (svc as unknown as {
        sendLifecycleEmail: (
          companyId: string,
          owner: { email: string; firstName: string; locale: string },
          step: "market",
          p: { matches: number; free: boolean },
        ) => Promise<boolean>;
      }).sendLifecycleEmail("c1", { email: "a@b.co", firstName: "Ayşe", locale }, "market", { matches: 3, free });
    const data = (i: number) =>
      (send.mock.calls[i]![0] as { templateData: { data: { ctaLabel: string; ctaUrl: string } } }).templateData.data;
    return { call, data };
  }

  it("ücretsiz firma: paket sayfası + 'Silver'a geç' etiketi (üç dil)", async () => {
    const { call, data } = setup();
    await call("tr", true);
    await call("en", true);
    await call("ru", true);
    expect(data(0)).toEqual(expect.objectContaining({ ctaLabel: "Silver'a geç", ctaUrl: "https://www.rothern.com/company/premium" }));
    expect(data(1).ctaLabel).toBe("Upgrade to Silver");
    expect(data(1).ctaUrl).toBe("https://www.rothern.com/en/company/plans");
    expect(data(2).ctaLabel).toBe("Перейти на Silver");
  });

  it("ücretli firma: açık talepler + 'Açık talepleri gör'", async () => {
    const { call, data } = setup();
    await call("tr", false);
    expect(data(0)).toEqual(expect.objectContaining({ ctaLabel: "Açık talepleri gör", ctaUrl: "https://www.rothern.com/company/satis" }));
  });
});
