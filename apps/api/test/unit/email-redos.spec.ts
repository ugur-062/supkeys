import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { EMAIL_MAX_LENGTH, isValidEmailLike } from "@rothern/shared";
import { ExternalTenderInviteDto } from "../../src/modules/company-connections/dto/invite-by-email.dto";

/**
 * E-posta biçim regex'leri (`[^\s@]+@[^\s@]+\.[^\s@]+`) ikinci dereceden geri
 * izler: 20.000 karakter ≈ 0,2 sn, 1 MB ≈ dakikalar (gövde sınırı 5 MB) — tek
 * istek olay döngüsünü kilitlerdi (yayın denetimi 2026-09-28, B4-4). Uzunluk
 * regex'ten ÖNCE denetlenir; dış davetin eski `emails` yolu da 200 ile sınırlı.
 */
describe("e-posta doğrulama — ReDoS koruması", () => {
  it("dev girdi regex'e girmeden reddedilir (hızlı)", () => {
    const evil = "a@" + "a.".repeat(500_000) + "@";
    const t = Date.now();
    expect(isValidEmailLike(evil)).toBe(false);
    expect(Date.now() - t).toBeLessThan(100);
  });

  it("sınırdaki geçerli adres kabul, geçersiz biçim red", () => {
    const local = "a".repeat(EMAIL_MAX_LENGTH - "@firma.com".length);
    expect(isValidEmailLike(`${local}@firma.com`)).toBe(true);
    expect(isValidEmailLike(`a${local}@firma.com`)).toBe(false);
    expect(isValidEmailLike("satis@firma.com")).toBe(true);
    expect(isValidEmailLike("satis@firma")).toBe(false);
  });

  it("dış talep davetinin eski `emails` yolu adres başına 200 karakterle sınırlı", () => {
    const errors = (emails: string[]) =>
      validateSync(plainToInstance(ExternalTenderInviteDto, { listingId: "l1", emails })).filter(
        (e) => e.property === "emails",
      );
    expect(errors(["satis@firma.com"])).toHaveLength(0);
    expect(errors(["a".repeat(201)])).toHaveLength(1);
  });
});
