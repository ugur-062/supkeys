import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { InviteCompanyUserDto } from "../../src/modules/company-users/dto/company-user.dto";

/**
 * Ekip daveti DİLİ (2026-09-27): isteğe bağlı; yalnız desteklenen arayüz
 * dilleri (tr/en/ru). Verilmezse davet edenin kayıtlı dili kullanılır.
 */
function localeErrors(body: Record<string, unknown>) {
  const dto = plainToInstance(InviteCompanyUserDto, { email: "a@firma.com", ...body });
  return validateSync(dto).filter((e) => e.property === "locale");
}

describe("InviteCompanyUserDto.locale", () => {
  it("desteklenen dil kabul, desteklenmeyen dil red, boş bırakmak serbest", () => {
    expect(localeErrors({ locale: "en" })).toHaveLength(0);
    expect(localeErrors({ locale: "ru" })).toHaveLength(0);
    expect(localeErrors({})).toHaveLength(0);
    expect(localeErrors({ locale: "de" })).toHaveLength(1);
    expect(localeErrors({ locale: "EN" })).toHaveLength(1);
  });
});
