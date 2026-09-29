jest.mock("../../src/modules/notifications/notification.service", () => ({
  pickCompanyRecipients: jest.fn(),
}));

import { pickCompanyRecipients } from "../../src/modules/notifications/notification.service";
import { CompanyMessagesService } from "../../src/modules/company-messages/company-messages.service";
import { appRoutes } from "../../src/common/company/app-routes";

/**
 * Derin denetim 2026-09-29 Y-18 (ORTA): yeni mesaj e-postasının CTA'sı yalnız
 * `?with=` taşıyordu; iki izinli (alıcı + satıcı) kullanıcıda gelen kutusu
 * "satinalma"yı seçip satıcı tarafa ters yöndeki BOŞ konuşmayı açıyordu.
 * Sözleşme: CTA, ALICI firmanın konuşmadaki tarafını `portal` olarak taşır.
 */
const BASE = "https://www.rothern.com";

function makeService() {
  const send = jest.fn().mockResolvedValue(undefined);
  const svc = new CompanyMessagesService(
    {} as never,
    {} as never,
    { send } as never,
    { get: (k: string) => (k === "WEB_URL" ? BASE : undefined) } as never,
  );
  return { svc, send };
}

type EmailFn = (
  companyId: string,
  senderCompanyId: string,
  senderName: string,
  recipientSide: "buy" | "sell",
) => Promise<void>;

function ctaOf(send: jest.Mock): string {
  const arg = send.mock.calls[0]![0] as {
    templateData: { data: { ctaUrl: string } };
  };
  return arg.templateData.data.ctaUrl;
}

describe("CompanyMessagesService — yeni mesaj e-postası CTA yönü", () => {
  beforeEach(() => {
    (pickCompanyRecipients as jest.Mock).mockResolvedValue(
      new Map([["rcv", { email: "r@x.com", name: "R", locale: "tr" }]]),
    );
  });

  it("alıcı satıcı taraftaysa (sell) link portal=satis taşır", async () => {
    const { svc, send } = makeService();
    await (svc as unknown as { emailNewMessage: EmailFn }).emailNewMessage(
      "rcv",
      "sender1",
      "Gönderen",
      "sell",
    );
    expect(ctaOf(send)).toBe(
      `${BASE}/company/mesajlar?with=sender1&portal=satis`,
    );
  });

  it("alıcı alıcı taraftaysa (buy) link portal=satinalma taşır", async () => {
    const { svc, send } = makeService();
    await (svc as unknown as { emailNewMessage: EmailFn }).emailNewMessage(
      "rcv",
      "sender1",
      "Gönderen",
      "buy",
    );
    expect(ctaOf(send)).toBe(
      `${BASE}/company/mesajlar?with=sender1&portal=satinalma`,
    );
  });
});

describe("appRoutes.messagesWith — portal parametresi", () => {
  it("portal verilince sorguya eklenir, yol yine dile çevrilir", () => {
    expect(appRoutes.messagesWith(BASE, "c1", "tr", "satis")).toBe(
      `${BASE}/company/mesajlar?with=c1&portal=satis`,
    );
    expect(appRoutes.messagesWith(BASE, "c1", "en", "satinalma")).toBe(
      `${BASE}/en/company/messages?with=c1&portal=satinalma`,
    );
  });

  it("portal verilmezse eski adres birebir korunur", () => {
    expect(appRoutes.messagesWith(BASE, "c1")).toBe(
      `${BASE}/company/mesajlar?with=c1`,
    );
  });
});
