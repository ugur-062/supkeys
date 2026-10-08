import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CompanySignupDto } from "../../src/modules/company-auth/dto/company-signup.dto";
import { UpdateMeDto } from "../../src/modules/company-auth/dto/account.dto";
import { AcceptCompanyInvitationDto } from "../../src/modules/company-users/dto/company-user.dto";
import { ConfirmPasswordResetDto } from "../../src/modules/password-reset/dto/confirm-password-reset.dto";

/**
 * Telefon DTO kuralı (2026-09-27): ülke koduna göre ulusal uzunluk, tek kaynak
 * `isValidPhoneNumber` (web kayıt formu da aynı fonksiyonu okur). Eski kural
 * "10-20 karakter" idi: kısa geçerli numaralar reddediliyor, 11 haneli "Türk"
 * numarası kabul ediliyordu.
 */
function phoneErrors<T extends object>(cls: new () => T, body: Record<string, unknown>) {
  const dto = plainToInstance(cls, body);
  return {
    dto,
    errors: validateSync(dto as object).filter((e) => e.property === "phone"),
  };
}

describe("telefon DTO — ülke uzunluğu", () => {
  // Eski web paketi telefonu göndermeyi sürdürebilir: gelen numara eskisi gibi doğrulanır.
  it("kayıt: gönderilen numara doğrulanır — kısa ama geçerli kabul, 11 haneli TR numarası red", () => {
    expect(phoneErrors(CompanySignupDto, { phone: "+376 312345" }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "+352 4711" }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "+90 555 111 22 33" }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "+90 89161234567" }).errors).toHaveLength(1);
    expect(phoneErrors(CompanySignupDto, { phone: "+7 9161234567" }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "abc" }).errors).toHaveLength(1);
    expect(phoneErrors(CompanySignupDto, { phone: "+90 532" }).errors).toHaveLength(1);
    // Dize olmayan değer "telefon yok" sayılmaz.
    expect(phoneErrors(CompanySignupDto, { phone: 5551112233 }).errors).toHaveLength(1);
  });

  // Sahip kararı 2026-10-08: kayıt formu telefonu sormaz → alan isteğe bağlı.
  it("kayıt: telefon YOK / null / boş dize = numara verilmedi (hata yok)", () => {
    expect(phoneErrors(CompanySignupDto, {}).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: undefined }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: null }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "" }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "   " }).errors).toHaveLength(0);
  });

  it("kayıt: telefonsuz tam gövde hiçbir alanda hata vermez", () => {
    const dto = plainToInstance(CompanySignupDto, {
      firstName: "Ada",
      lastName: "Yılmaz",
      email: "ada@firma.com",
      password: "Guclu!Parola9",
      termsAccepted: true,
      mediationAccepted: true,
      kvkkAccepted: true,
    });
    expect(validateSync(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(dto.phone).toBeUndefined();
  });

  it("Arap-Hint rakamlar ASCII'ye çevrilir ve öyle saklanır", () => {
    const { dto, errors } = phoneErrors(CompanySignupDto, { phone: " +٢٠ ١٠٠ ١٢٣ ٤٥٦٧ " });
    expect(errors).toHaveLength(0);
    expect(dto.phone).toBe("+20 100 123 4567");
  });

  it("hesap bilgileri: boş dize numarayı siler (geçerli), bozuk numara red", () => {
    expect(phoneErrors(UpdateMeDto, { phone: "" }).errors).toHaveLength(0);
    expect(phoneErrors(UpdateMeDto, {}).errors).toHaveLength(0);
    expect(phoneErrors(UpdateMeDto, { phone: "+49 30 1234567" }).errors).toHaveLength(0);
    expect(phoneErrors(UpdateMeDto, { phone: "+49 1" }).errors).toHaveLength(1);
  });

  // Arayüz testi O-121: davet kabulü eski "10-20 karakter" kuralındaydı —
  // "+90 532123" (eksik numara) kabul ediliyordu.
  it("davet kabulü: kayıtla aynı kural; boş/yok = numara verilmedi", () => {
    expect(phoneErrors(AcceptCompanyInvitationDto, { phone: "+90 532123" }).errors).toHaveLength(1);
    expect(phoneErrors(AcceptCompanyInvitationDto, { phone: "+90 532" }).errors).toHaveLength(1);
    expect(phoneErrors(AcceptCompanyInvitationDto, { phone: "+90 532 123 45 67" }).errors).toHaveLength(0);
    expect(phoneErrors(AcceptCompanyInvitationDto, { phone: "+376 312345" }).errors).toHaveLength(0);
    expect(phoneErrors(AcceptCompanyInvitationDto, { phone: "" }).errors).toHaveLength(0);
    expect(phoneErrors(AcceptCompanyInvitationDto, {}).errors).toHaveLength(0);
  });
});

// Arayüz testi D-085: kesik sıfırlama bağlantısı ham "en az 40 karakter"
// yerine geçersiz bağlantı metni döner.
describe("şifre sıfırlama — kesik token", () => {
  it("kısa token alan hatası 'geçersiz bağlantı' metnidir", () => {
    const dto = plainToInstance(ConfirmPasswordResetDto, { token: "deadbeef", newPassword: "Guclu!Sifre9" });
    const errs = validateSync(dto as object).filter((e) => e.property === "token");
    expect(errs).toHaveLength(1);
    const messages = Object.values(errs[0]!.constraints ?? {});
    expect(messages.join(" ")).not.toMatch(/40/);
    expect(messages[0]).toMatch(/bağlantı/i);
  });
});
