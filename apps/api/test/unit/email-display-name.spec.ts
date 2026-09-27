import { inviteFromName, ResendProvider } from "@rothern/email";
import { quoteDisplayName } from "../../../../packages/email/src/providers/resend";

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
    expect(ResendProvider).toBeDefined();
  });
});
