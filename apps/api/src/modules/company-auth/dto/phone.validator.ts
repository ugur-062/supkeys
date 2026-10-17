import { Transform } from "class-transformer";
import { ValidateBy, type ValidationOptions } from "class-validator";
import { isValidPhoneNumber, normalizeDigits } from "@rothern/shared";

/**
 * Telefon — ülke koduna göre ulusal uzunluk (2026-09-27). Kural TEK KAYNAK
 * `@rothern/shared` `isValidPhoneNumber`: web kayıt formu ve ayar formları
 * aynı fonksiyonu okur. Eskiden DTO `^[0-9+\s()]{10,20}$` diyordu → Andorra
 * (+376 6 hane), Lüksemburg sabit hattı gibi kısa geçerli numaralar reddediliyor,
 * "+90 89161234567" (11 haneli "Türk" numarası) kabul ediliyordu.
 *
 * `allowEmpty`: isteğe bağlı alanda boş dize = "numarayı sil".
 */
export function IsIntlPhone(
  opts: { allowEmpty?: boolean } = {},
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: "isIntlPhone",
      validator: {
        validate: (value: unknown) =>
          typeof value === "string" &&
          ((opts.allowEmpty === true && value.trim() === "") ||
            isValidPhoneNumber(value)),
      },
    },
    validationOptions,
  );
}

/**
 * Latin dışı rakamları (Arap-Hint, Farsça, tam genişlikli) ASCII'ye çevirir ve
 * kenar boşluklarını atar — doğrulamadan ÖNCE çalışır, saklanan değer de
 * normalize olur (web `PhoneInput` zaten çevirir; bu, doğrudan API istemcisi
 * için).
 */
export const NormalizePhone = (): PropertyDecorator =>
  Transform(({ value }) =>
    typeof value === "string" ? normalizeDigits(value).replace(/＋/g, "+").trim() : value,
  );
