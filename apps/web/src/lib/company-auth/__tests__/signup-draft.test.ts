// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearSignupDraft, readSignupDraft, saveSignupDraft, SIGNUP_DRAFT_KEY, type SignupDraft } from "../signup-draft";
import { bindSessionOwner, clearTenantSessionData } from "../tenant-storage";

const consents = { terms: true, mediation: true, kvkk: false, marketing: false, profile: true };
const draft: SignupDraft = {
  firstName: "Ada",
  lastName: "Yılmaz",
  email: "ada@firma.com",
  consents,
  verifyEmail: null,
  emailSeed: "",
};

// Arayüz testi 2026-10 code-auth-5/10, signup-enru-1, signup-tr-15.
describe("kayıt taslağı", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("yazılan okunur: alanlar, onaylar, kod adımının adresi", () => {
    saveSignupDraft({ ...draft, verifyEmail: "ada@firma.com" });
    expect(readSignupDraft()).toEqual({ ...draft, verifyEmail: "ada@firma.com" });
  });

  it("ŞİFRE ASLA yazılmaz — çağıran form nesnesinin tamamını verse bile", () => {
    const withSecrets = { ...draft, password: "Guclu!Parola9", passwordConfirm: "Guclu!Parola9" };
    saveSignupDraft(withSecrets as SignupDraft);
    const raw = sessionStorage.getItem(SIGNUP_DRAFT_KEY) ?? "";
    expect(raw).toContain("ada@firma.com");
    expect(raw).not.toContain("Guclu!Parola9");
    expect(raw).not.toMatch(/password/i);
    expect(readSignupDraft()).not.toHaveProperty("password");
  });

  it("boş taslak depoda yer tutmaz", () => {
    saveSignupDraft(draft);
    saveSignupDraft({
      ...draft,
      firstName: "",
      lastName: "",
      email: "",
      consents: { terms: false, mediation: false, kvkk: false, marketing: false, profile: false },
    });
    expect(sessionStorage.getItem(SIGNUP_DRAFT_KEY)).toBeNull();
    expect(readSignupDraft()).toBeNull();
  });

  it("bozuk ya da yabancı kayıt çökertmez: tanınmayan alanlar boş/false okunur", () => {
    sessionStorage.setItem(SIGNUP_DRAFT_KEY, "{bozuk");
    expect(readSignupDraft()).toBeNull();
    sessionStorage.setItem(
      SIGNUP_DRAFT_KEY,
      JSON.stringify({ firstName: 5, consents: { terms: "yes", kvkk: true }, verifyEmail: "   ", password: "x" }),
    );
    expect(readSignupDraft()).toEqual({
      firstName: "",
      lastName: "",
      email: "",
      consents: { terms: false, mediation: false, kvkk: true, marketing: false, profile: false },
      verifyEmail: null,
      emailSeed: "",
    });
  });

  // Sahip kararı 2026-10-08: kayıt formu telefonu sormaz. Sürüm geçişinde açık
  // sekmedeki eski taslak `phone` taşıyabilir.
  it("TELEFON taslağa yazılmaz ve eski taslaktan okunmaz", () => {
    // Çağıran yanlışlıkla telefon verse bile depoya gitmez (alanlar tek tek kopyalanır).
    saveSignupDraft({ ...draft, phone: "+90 5551112233" } as SignupDraft);
    const raw = sessionStorage.getItem(SIGNUP_DRAFT_KEY) ?? "";
    expect(raw).toContain("ada@firma.com");
    expect(raw).not.toMatch(/phone/i);
    expect(raw).not.toContain("5551112233");

    // Eski sürümün yazdığı taslak: öteki alanlar geri gelir, telefon gelmez.
    sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify({ ...draft, phone: "+90 5551112233" }));
    const restored = readSignupDraft();
    expect(restored).toEqual(draft);
    expect(restored).not.toHaveProperty("phone");
  });

  it("yalnız telefon taşıyan eski taslak boş sayılır: yeniden yazılınca depoda yer tutmaz", () => {
    const empty = { terms: false, mediation: false, kvkk: false, marketing: false, profile: false };
    sessionStorage.setItem(
      SIGNUP_DRAFT_KEY,
      JSON.stringify({ firstName: "", lastName: "", email: "", phone: "+90 5551112233", consents: empty, verifyEmail: null, emailSeed: "" }),
    );
    const restored = readSignupDraft();
    expect(restored).toEqual({ firstName: "", lastName: "", email: "", consents: empty, verifyEmail: null, emailSeed: "" });
    saveSignupDraft(restored!);
    expect(sessionStorage.getItem(SIGNUP_DRAFT_KEY)).toBeNull();
  });

  it("clearSignupDraft siler", () => {
    saveSignupDraft(draft);
    clearSignupDraft();
    expect(readSignupDraft()).toBeNull();
  });

  // Önek `TENANT_SESSION_PREFIXES`te (CLAUDE.md: firma verisi taşıyan her
  // sessionStorage anahtarı çıkışta silinir).
  it("çıkışta ve aynı sekmede BAŞKA hesap girince silinir; aynı hesapta kalır", () => {
    saveSignupDraft(draft);
    bindSessionOwner("u1");
    bindSessionOwner("u1");
    expect(readSignupDraft()).not.toBeNull();
    bindSessionOwner("u2");
    expect(readSignupDraft()).toBeNull();

    saveSignupDraft(draft);
    clearTenantSessionData();
    expect(sessionStorage.getItem(SIGNUP_DRAFT_KEY)).toBeNull();
  });
});
