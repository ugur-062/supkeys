import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { RETENTION_REDUCED_SUBJECT, displaySubject, emailResendBlock } from "../status";

/**
 * Saklama ve İmha Politikası: süresi dolan spam şikâyeti ret kaydına indirgenir
 * (konu sabit işaret, içerik verisi ve bağlam silinir). API bu kaydın yeniden
 * gönderimini reddeder; panel düğmeyi çizmez ve makine işareti yerine açıklama
 * gösterir. İşaret API'deki sabitle AYNI (kaynak dosyadan okunur).
 */
describe("ret kaydına indirgenen e-posta kaydı", () => {
  const base = { provider: "resend", template: "notification", contextType: null, payload: { a: 1 } };

  it("işaret API'deki REDUCED_EMAIL_LOG_SUBJECT ile aynı", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../../../api/src/modules/data-retention/retention-policy.ts"),
      "utf8",
    );
    const m = src.match(/export const REDUCED_EMAIL_LOG_SUBJECT = "([^"]+)";/);
    expect(m?.[1]).toBe(RETENTION_REDUCED_SUBJECT);
  });

  it("ret kaydı ve içerik verisi olmayan kayıt yeniden gönderilemez; sıradan kayıt gönderilebilir", () => {
    expect(emailResendBlock({ ...base, subject: RETENTION_REDUCED_SUBJECT, payload: null })).toBe("noContent");
    expect(emailResendBlock({ ...base, payload: null })).toBe("noContent");
    expect(emailResendBlock({ ...base, subject: "Talep daveti" })).toBeNull();
    // İç kayıt ve gizli içerik önceliklerini korur.
    expect(emailResendBlock({ ...base, provider: "internal", payload: null })).toBe("internal");
    expect(emailResendBlock({ ...base, payload: { __redacted: "x" } })).toBe("redacted");
  });

  it("başlıkta makine işareti yerine açıklama", () => {
    expect(displaySubject(RETENTION_REDUCED_SUBJECT)).toBe("Ret kaydı — saklama süresi doldu");
    expect(displaySubject("Talep daveti")).toBe("Talep daveti");
  });
});
