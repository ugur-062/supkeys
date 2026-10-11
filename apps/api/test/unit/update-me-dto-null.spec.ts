import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { UpdateMeDto } from "../../src/modules/company-auth/dto/account.dto";

/**
 * Derin denetim LU-06: PATCH /me'de null değer @IsOptional ile tüm
 * doğrulayıcıları atlıyor, serviste null.trim() 500 veriyordu. Ad/soyad için
 * null 400 alır; telefonda null numarayı siler (boş dize gibi).
 */
function errorProps(body: Record<string, unknown>) {
  const dto = plainToInstance(UpdateMeDto, body);
  return validateSync(dto).map((e) => e.property);
}

describe("UpdateMeDto null değerleri", () => {
  it("firstName/lastName null reddedilir; alan hiç yoksa serbest", () => {
    expect(errorProps({ firstName: null })).toEqual(["firstName"]);
    expect(errorProps({ lastName: null })).toEqual(["lastName"]);
    expect(errorProps({})).toEqual([]);
    expect(errorProps({ firstName: "Ada", lastName: "Y" })).toEqual([]);
  });

  it("phone null kabul edilir (numarayı siler)", () => {
    expect(errorProps({ phone: null })).toEqual([]);
    expect(errorProps({ phone: "" })).toEqual([]);
  });
});
