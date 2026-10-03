import { maskEmail } from "../../src/common/logging/mask-email";

/** Günlükte e-posta maskeli (yayın denetimi 2026-09-28 B5-17). */
describe("maskEmail", () => {
  it("yerel kısmı gizler, alan adını bırakır", () => {
    expect(maskEmail("satinalma@ornek.com.tr")).toBe("s***@ornek.com.tr");
    expect(maskEmail("a@b.io")).toBe("a***@b.io");
  });
  it("boş/geçersiz girdi güvenli", () => {
    expect(maskEmail(undefined)).toBe("-");
    expect(maskEmail("noatsign")).toBe("***");
    expect(maskEmail("@x.com")).toBe("***");
  });
});
