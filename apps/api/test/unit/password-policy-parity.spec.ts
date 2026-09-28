import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangePasswordDto } from "../../src/modules/company-auth/dto/account.dto";
import { CompanySignupDto } from "../../src/modules/company-auth/dto/company-signup.dto";
import { AcceptCompanyInvitationDto } from "../../src/modules/company-users/dto/company-user.dto";
import { ConfirmPasswordResetDto } from "../../src/modules/password-reset/dto/confirm-password-reset.dto";

/**
 * Şifre politikası TEK: kayıt, ekip daveti kabulü, şifre değiştirme ve şifre
 * sıfırlama AYNI şifreleri kabul/ret eder (yayın denetimi 2026-09-28 Bölüm 9 —
 * değiştirme/sıfırlama 8 karakter + özel karaktersiz kabul ediyor, kayıtta
 * konan 10 karakter + özel karakter kuralı sıfırlamayla zayıflatılabiliyordu).
 * Web tarafı aynı kuralı `lib/company-auth/password-rules.ts`ten okur.
 */
async function passwordOk(cls: new () => object, field: string, pw: string): Promise<boolean> {
  const errs = await validate(plainToInstance(cls, { [field]: pw }) as object);
  return !errs.some((e) => e.property === field);
}

const PATHS: Array<[string, new () => object, string]> = [
  ["kayıt", CompanySignupDto, "password"],
  ["davet kabulü", AcceptCompanyInvitationDto, "password"],
  ["şifre değiştirme", ChangePasswordDto, "newPassword"],
  ["şifre sıfırlama", ConfirmPasswordResetDto, "newPassword"],
];

const CASES: Array<[string, boolean]> = [
  ["Guclu!Sifre9", true],
  ["Kisa!9a", false], // 7 karakter
  ["Parola12!", false], // 9 karakter — eski değiştirme/sıfırlama kuralı kabul ediyordu
  ["GucluParola12", false], // özel karakter yok — eski kural kabul ediyordu
  ["gucluparola!9", false], // büyük harf yok
  ["GUCLUPAROLA!9", false], // küçük harf yok
  ["Guclu!Parola", false], // rakam yok
];

describe("şifre politikası — dört yol aynı kuralı uygular", () => {
  it.each(CASES)("%s → %s", async (pw, expected) => {
    for (const [name, cls, field] of PATHS) {
      expect({ path: name, ok: await passwordOk(cls, field, pw) }).toEqual({ path: name, ok: expected });
    }
  });
});
