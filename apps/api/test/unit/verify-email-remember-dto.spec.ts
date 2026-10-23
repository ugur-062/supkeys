import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { VerifyEmailDto } from "../../src/modules/company-auth/dto/company-signup.dto";

/**
 * Derin denetim MU-23: giris ekranindan e-posta dogrulamasi "Oturumumu acik
 * birak" tercihini (`rememberMe`) tasir. Global ValidationPipe
 * forbidNonWhitelisted:true oldugu icin alan DTO'da yoksa istek 400 alir;
 * gonderilmezse AuthCookieInterceptor varsayilan KALICI cerez basiyordu.
 */
async function errorsOf(body: unknown): Promise<string[]> {
  const errs = await validate(plainToInstance(VerifyEmailDto, body) as object, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return errs.map((e) => e.property);
}

describe("VerifyEmailDto.rememberMe", () => {
  const base = { email: "a@b.com", code: "123456" };

  it("isteğe bağlı: yoksa (kayıt akışı) geçerli", async () => {
    expect(await errorsOf(base)).toEqual([]);
  });

  it("boolean kabul edilir (false = oturum çerezi)", async () => {
    expect(await errorsOf({ ...base, rememberMe: false })).toEqual([]);
    expect(await errorsOf({ ...base, rememberMe: true })).toEqual([]);
  });

  it("boolean olmayan değer reddedilir", async () => {
    expect(await errorsOf({ ...base, rememberMe: "no" })).toContain("rememberMe");
  });
});
