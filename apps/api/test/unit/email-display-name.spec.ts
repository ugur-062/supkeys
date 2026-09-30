import { inviteFromName } from "@rothern/email";
import {
  quoteDisplayName,
  ResendProvider,
} from "../../../../packages/email/src/providers/resend";

/** Gönderen görünen adı (2026-09-27): davette "Firma (Rothern üzerinden)" — tırnak kuralı. */
describe("gönderen görünen adı", () => {
  it("davet eden firma adı alıcının dilinde", () => {
    expect(inviteFromName("ABC İnşaat", "tr")).toBe("ABC İnşaat (Rothern üzerinden)");
    expect(inviteFromName("ABC İnşaat", "en")).toBe("ABC İnşaat via Rothern");
    expect(inviteFromName("ABC", "ru")).toBe("ABC через Rothern");
  });

  it("özel karakterli ad tırnaklanır, düz ad tırnaksız; satır sonu temizlenir", () => {
    expect(quoteDisplayName("Rothern")).toBe("Rothern");
    expect(quoteDisplayName("ABC İnşaat (Rothern üzerinden)")).toBe('"ABC İnşaat (Rothern üzerinden)"');
    expect(quoteDisplayName('Acme, "Ltd."')).toBe('"Acme, \\"Ltd.\\""');
    expect(quoteDisplayName("A\r\nBcc: x@y.com")).toBe('"A Bcc: x@y.com"');
  });

  /**
   * Sağlayıcı `from` başlığını gerçekten bu kuralla kuruyor mu? Resend
   * istemcisi sahtesiyle değiştirilir; gönderilen istek gövdesi okunur.
   */
  describe("ResendProvider from başlığı", () => {
    const rendered = { subject: "Davet", html: "<p>x</p>", text: "x" };
    const kur = () => {
      const provider = new ResendProvider("re_test_key");
      const send = jest.fn().mockResolvedValue({ data: { id: "msg_1" }, error: null });
      (provider as unknown as { client: unknown }).client = { emails: { send } };
      return { provider, send };
    };

    it("davet gönderen adı tırnaklı görünen ad + adres olarak gider", async () => {
      const { provider, send } = kur();
      const res = await provider.send({
        to: { email: "alici@example.com" },
        from: { email: "davet@rothern.com", name: inviteFromName("ABC İnşaat", "tr") },
        rendered,
      });
      expect(res.providerMessageId).toBe("msg_1");
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].from).toBe('"ABC İnşaat (Rothern üzerinden)" <davet@rothern.com>');
    });

    it("düz ad tırnaksız, ad yoksa yalnız adres", async () => {
      const { provider, send } = kur();
      await provider.send({ to: { email: "a@example.com" }, from: { email: "no-reply@rothern.com", name: "Rothern" }, rendered });
      await provider.send({ to: { email: "a@example.com" }, from: { email: "no-reply@rothern.com" }, rendered });
      expect(send.mock.calls[0][0].from).toBe("Rothern <no-reply@rothern.com>");
      expect(send.mock.calls[1][0].from).toBe("no-reply@rothern.com");
    });

    it("görünen addaki satır sonu başlık enjeksiyonuna dönüşmez", async () => {
      const { provider, send } = kur();
      await provider.send({
        to: { email: "a@example.com" },
        from: { email: "davet@rothern.com", name: "Kötü\r\nBcc: x@y.com" },
        rendered,
      });
      const from: string = send.mock.calls[0][0].from;
      expect(from).not.toMatch(/[\r\n]/);
      expect(from).toBe('"Kötü Bcc: x@y.com" <davet@rothern.com>');
    });
  });
});
