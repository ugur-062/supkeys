import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CompanySignupDto } from "../../src/modules/company-auth/dto/company-signup.dto";
import { UpdateMeDto } from "../../src/modules/company-auth/dto/account.dto";

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
  it("kayıt: kısa ama geçerli numara kabul, 11 haneli TR numarası red", () => {
    expect(phoneErrors(CompanySignupDto, { phone: "+376 312345" }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "+352 4711" }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "+90 555 111 22 33" }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "+90 89161234567" }).errors).toHaveLength(1);
    expect(phoneErrors(CompanySignupDto, { phone: "+7 9161234567" }).errors).toHaveLength(0);
    expect(phoneErrors(CompanySignupDto, { phone: "abc" }).errors).toHaveLength(1);
    expect(phoneErrors(CompanySignupDto, {}).errors).toHaveLength(1);
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
});
