/**
 * checkJwtSecret / isSecretAcceptable — #6 config-matrix.
 *
 * Allowlist / fail-closed: placeholder yalnız açıkça development/test'te kabul
 * edilir. NODE_ENV unset veya "staging"/"prod" gibi tanınmayan değer → sıkı
 * (production gibi) davranır → placeholder + kısa secret reddedilir.
 */
import {
  checkJwtSecret,
  isSecretAcceptable,
} from "../../src/common/config/jwt-secret";

const STRONG = "a".repeat(48); // 48 char, placeholder değil
const PLACEHOLDER = "change_me_in_production_minimum_32_chars_long";
const SHORT = "short_secret"; // < 32, placeholder-prefix değil

describe("checkJwtSecret (allowlist / fail-closed)", () => {
  it("NODE_ENV unset → placeholder REDDEDİLİR (eski denylist deliği kapandı)", () => {
    expect(checkJwtSecret(undefined, PLACEHOLDER)).toBe("placeholder");
    expect(isSecretAcceptable(undefined, PLACEHOLDER)).toBe(false);
  });

  it("NODE_ENV unset → kısa secret REDDEDİLİR", () => {
    expect(checkJwtSecret(undefined, SHORT)).toBe("too_short");
  });

  it("NODE_ENV unset → güçlü secret kabul", () => {
    expect(checkJwtSecret(undefined, STRONG)).toBeNull();
    expect(isSecretAcceptable(undefined, STRONG)).toBe(true);
  });

  it('tanınmayan env ("prod"/"staging") → placeholder REDDEDİLİR', () => {
    expect(checkJwtSecret("prod", PLACEHOLDER)).toBe("placeholder");
    expect(checkJwtSecret("staging", PLACEHOLDER)).toBe("placeholder");
    expect(checkJwtSecret("Production", PLACEHOLDER)).toBe("placeholder"); // büyük/küçük harf tam eşleşme
  });

  it("production → placeholder + kısa secret reddedilir, güçlü kabul", () => {
    expect(checkJwtSecret("production", PLACEHOLDER)).toBe("placeholder");
    expect(checkJwtSecret("production", SHORT)).toBe("too_short");
    expect(checkJwtSecret("production", STRONG)).toBeNull();
  });

  it("development/test → placeholder KABUL (yerel geliştirme akmasın)", () => {
    expect(checkJwtSecret("development", PLACEHOLDER)).toBeNull();
    expect(checkJwtSecret("test", PLACEHOLDER)).toBeNull();
    expect(checkJwtSecret("development", SHORT)).toBeNull();
    expect(isSecretAcceptable("test", PLACEHOLDER)).toBe(true);
  });

  it("prefix bazlı placeholder tespiti (change_me/ci_test/test_)", () => {
    expect(checkJwtSecret("production", "change_me_now_xxxxxxxxxxxxxxxxxxxxxxxx")).toBe(
      "placeholder",
    );
    expect(checkJwtSecret("production", "ci_test_whatever_long_enough_string_xx")).toBe(
      "placeholder",
    );
    expect(checkJwtSecret("production", "test_secret_value_long_enough_string_x")).toBe(
      "placeholder",
    );
  });
});
