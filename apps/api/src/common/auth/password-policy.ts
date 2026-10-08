import { applyDecorators } from "@nestjs/common";
import { IsString, Matches, MinLength, ValidateBy, minLength } from "class-validator";
import { tApi } from "../i18n/i18n.service";

/**
 * Company-user password policy: THE single source of the API.
 *
 * Every path that SETS a password (sign-up, team invitation acceptance,
 * change password, reset password) puts `@PasswordPolicy()` on its field, so
 * no path can accept a password another one refuses (contract:
 * test/unit/password-policy-parity.spec.ts). The web shows the same rules from
 * apps/web/src/lib/company-auth/password-rules.ts.
 *
 * UNICODE AWARE (arayuz testi 2026-10 login-4). The rules were ASCII regexes:
 *  - `/[a-z]/` and `/[A-Z]/` did not see Cyrillic or Turkish-only letters:
 *    "Пароль-Секрет1!" and "ŞİĞÜÖÇ-şığüöç1!" were told "no lowercase letter";
 *  - `/[^a-zA-Z0-9]/` counted every non-ASCII LETTER as the special
 *    character: "şifreŞİFRE12" (letters and digits only) was accepted.
 * Now a letter of any alphabet counts for case, and the special character is
 * anything that is not a letter, a number or whitespace. The digit rule stays
 * ASCII 0-9 (what the message and every keyboard mean by "digit").
 *
 * UPPER LIMIT = 72 UTF-8 BYTES, not characters. The auth provider cuts a
 * password at 72 bytes (bcrypt); a non-ASCII letter is 2 bytes and an emoji 4.
 * The old `MaxLength(72)` counted characters: a Cyrillic password of 37 to 72
 * letters passed here and was then refused by the provider with an
 * unreadable error. The web form measures the same number
 * (`passwordByteLength` / `PASSWORD_MAX_BYTES` in its password-rules.ts).
 *
 * LOWER LIMIT is counted by class-validator (`MinLength`): a character
 * outside the Basic Multilingual Plane (an emoji) counts as ONE, while the web
 * counts UTF-16 units (`string.length`, two for an emoji). The two only differ
 * for a password with such a character right at ten; this was so before and
 * is left as it is.
 */
export const PASSWORD_MIN_LENGTH = 10;
/** Upper limit in UTF-8 bytes (see above). */
export const PASSWORD_MAX_BYTES = 72;
/**
 * Same number under its old name: no password above 72 bytes has fewer than
 * 73 bytes, so 72 is also the highest possible character count. Kept for the
 * input `maxLength` on the web and for callers that only need a size cap.
 */
export const PASSWORD_MAX_LENGTH = PASSWORD_MAX_BYTES;
export const PASSWORD_LOWERCASE_RE = /\p{Ll}/u;
export const PASSWORD_UPPERCASE_RE = /\p{Lu}/u;
export const PASSWORD_DIGIT_RE = /[0-9]/;
export const PASSWORD_SPECIAL_RE = /[^\p{L}\p{N}\s]/u;

/** The rules as data: the parity spec compares them with the web source. */
export const PASSWORD_POLICY = {
  minLength: PASSWORD_MIN_LENGTH,
  maxBytes: PASSWORD_MAX_BYTES,
  lowercase: PASSWORD_LOWERCASE_RE,
  uppercase: PASSWORD_UPPERCASE_RE,
  digit: PASSWORD_DIGIT_RE,
  special: PASSWORD_SPECIAL_RE,
} as const;

/** Length of the password in UTF-8 bytes: what the upper limit measures. */
export function passwordByteLength(password: string): number {
  return Buffer.byteLength(password, "utf8");
}

/** True when the value is a string of at most `PASSWORD_MAX_BYTES` UTF-8 bytes. */
export function fitsPasswordByteLimit(password: unknown): password is string {
  return typeof password === "string" && passwordByteLength(password) <= PASSWORD_MAX_BYTES;
}

/** True when the password satisfies every rule (same result as the decorator). */
export function isPolicyPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    minLength(password, PASSWORD_MIN_LENGTH) &&
    fitsPasswordByteLimit(password) &&
    PASSWORD_LOWERCASE_RE.test(password) &&
    PASSWORD_UPPERCASE_RE.test(password) &&
    PASSWORD_DIGIT_RE.test(password) &&
    PASSWORD_SPECIAL_RE.test(password)
  );
}

/**
 * Field decorator for a NEW password. Messages are produced at validation
 * time in the request language (function form, see `tApi`).
 *
 * ORDER: the four character rules are all `matches` constraints, and
 * class-validator keeps ONE message per constraint name: the rule registered
 * last wins. The list below is written in the order the user should be told
 * (lowercase, uppercase, digit, special: the order of the web checklist) and
 * registered in reverse, exactly like stacked `@Matches` lines on a field are.
 */
export function PasswordPolicy(): PropertyDecorator {
  const inReadingOrder = [
    IsString(),
    MinLength(PASSWORD_MIN_LENGTH, {
      message: () => tApi("api.dto.companySignup.parolaEnAz10KarakterOlmali"),
    }),
    ValidateBy(
      {
        name: "passwordMaxBytes",
        constraints: [PASSWORD_MAX_BYTES],
        validator: { validate: (value: unknown): boolean => fitsPasswordByteLimit(value) },
      },
      { message: () => tApi("api.dto.companySignup.parolaEnFazla72Karakter") },
    ),
    Matches(PASSWORD_LOWERCASE_RE, {
      message: () => tApi("api.dto.companySignup.parolaEnAzBirKucukHarfIcermeli"),
    }),
    Matches(PASSWORD_UPPERCASE_RE, {
      message: () => tApi("api.dto.companySignup.parolaEnAzBirBuyukHarfIcermeli"),
    }),
    Matches(PASSWORD_DIGIT_RE, {
      message: () => tApi("api.dto.companySignup.parolaEnAzBirRakamIcermeli"),
    }),
    Matches(PASSWORD_SPECIAL_RE, {
      message: () => tApi("api.dto.companySignup.parolaEnAzBirOzelKarakterIcermeli"),
    }),
  ];
  return applyDecorators(...inReadingOrder.reverse()) as PropertyDecorator;
}
