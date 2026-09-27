import { streamForContext, unsubscribeScopeFor } from "../../src/modules/email/email-streams";
import {
  isUnsubscribeScope,
  signUnsubscribeToken,
  verifyUnsubscribeToken,
} from "../../src/modules/email/unsubscribe-token";
import { maskEmail } from "../../src/modules/email/email-unsubscribe.service";
import { checkProdSenderDomain } from "../../src/common/config/email-sender";

/**
 * E-POSTA AKIŞLARI + TEK TIK ÇIKIŞ JETONU sözleşmesi (2026-09-27).
 * Akış bağlam tipinden türer; işlem e-postası (kod/şifre/sipariş) ASLA çıkış
 * bağlantısı taşımaz, kullanıcının kapatabildiği her tür taşır.
 */
describe("email-streams", () => {
  it("işlem e-postaları TRANSACTIONAL ve çıkış kapsamı YOK", () => {
    for (const t of ["email_verify", "password_reset", "login_2fa", "order_status_changed", "bid_awarded", undefined]) {
      expect(streamForContext(t)).toBe("TRANSACTIONAL");
      expect(unsubscribeScopeFor(t)).toBeNull();
    }
  });

  it("kullanıcının kapatabildiği tür NOTIFICATION, kapsam = tercih anahtarı", () => {
    expect(streamForContext("listing_category_match")).toBe("NOTIFICATION");
    expect(unsubscribeScopeFor("listing_category_match")).toBe("categoryMatch");
    expect(unsubscribeScopeFor("listing_invitation")).toBe("invitation");
    expect(unsubscribeScopeFor("admin_announcement")).toBe("announcement");
  });

  it("kayıtsız adrese davet INVITE akışında, kapsam 'invite'", () => {
    expect(streamForContext("tender_external_invite")).toBe("INVITE");
    expect(streamForContext("referral_invite")).toBe("INVITE");
    expect(unsubscribeScopeFor("tender_external_invite")).toBe("invite");
  });

  it("lifecycle_* LIFECYCLE akışında", () => {
    expect(streamForContext("lifecycle_welcome")).toBe("LIFECYCLE");
    expect(unsubscribeScopeFor("lifecycle_digest")).toBe("lifecycle");
  });
});

describe("unsubscribe-token", () => {
  const SECRET = "test-secret-please-change";

  it("gidiş-dönüş: adres küçük harfe iner, kapsam ve dil korunur", () => {
    const t = signUnsubscribeToken({ email: "Ayse@Firma.com", scope: "categoryMatch", locale: "en" }, SECRET);
    expect(verifyUnsubscribeToken(t, SECRET)).toEqual({
      email: "ayse@firma.com",
      scope: "categoryMatch",
      locale: "en",
    });
  });

  it("jeton adresi AÇIK taşımaz (şifreli) ve URL güvenli", () => {
    const t = signUnsubscribeToken({ email: "gizli@firma.com", scope: "invite", locale: "tr" }, SECRET);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(Buffer.from(t, "base64url").toString("latin1")).not.toContain("gizli");
  });

  it("başka anahtar, bozulmuş jeton ve çöp girdi → null", () => {
    const t = signUnsubscribeToken({ email: "a@b.com", scope: "all", locale: "ru" }, SECRET);
    expect(verifyUnsubscribeToken(t, "baska-anahtar")).toBeNull();
    const flipped = `${t.slice(0, 20)}${t[20] === "A" ? "B" : "A"}${t.slice(21)}`;
    expect(verifyUnsubscribeToken(flipped, SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken("abc.def", SECRET)).toBeNull();
    expect(verifyUnsubscribeToken(undefined, SECRET)).toBeNull();
  });

  it("kapsam beyaz listesi", () => {
    expect(isUnsubscribeScope("categoryMatch")).toBe(true);
    expect(isUnsubscribeScope("invite")).toBe(true);
    expect(isUnsubscribeScope("all")).toBe(true);
    expect(isUnsubscribeScope("password_reset")).toBe(false);
    expect(isUnsubscribeScope("")).toBe(false);
  });

  it("maskEmail adresi ifşa etmez", () => {
    expect(maskEmail("ayse.kaya@firma.com")).toBe("ay•••@firma.com");
    expect(maskEmail("a@b.com")).toBe("a•••@b.com");
  });
});

describe("akış göndericisi alan adı kuralı", () => {
  it("alt alan adı kabul, başka alan adı red (canlıda)", () => {
    const base = { nodeEnv: "production", webUrl: "https://www.rothern.com" };
    expect(checkProdSenderDomain({ ...base, fromAddress: "davet@invite.rothern.com" })).toBeNull();
    expect(checkProdSenderDomain({ ...base, fromAddress: "davet@resend.dev" })).toBe("not_canonical");
  });
});
