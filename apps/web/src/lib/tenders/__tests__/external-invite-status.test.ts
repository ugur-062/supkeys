/**
 * Dış davet durum yardımcıları (canlı doğrulama turu 2026-10-09):
 *  - D2: "kabul edildi" (sırada ya da gönderildi) ile "gönderildi" AYRI —
 *    sıradaki davet ekranda "Gönderildi" diye yazılmaz; planlanan an yalnız
 *    QUEUED sonucunda ve geçerli tarihse okunur.
 *  - D13: adayın e-posta alan adı firmanın sitesinden farklıysa ipucu.
 */
import { describe, expect, it } from "vitest";
import type { ExternalInviteStatus } from "@/hooks/use-supplier-discovery";
import {
  emailSiteMismatch,
  inviteWillLeave,
  isInviteAccepted,
  isInviteQueued,
  isInviteSent,
  queuedNotSentReason,
  queuedSendTime,
} from "../external-invite-status";

const ALL: ExternalInviteStatus[] = [
  "QUEUED",
  "SENT",
  "FAILED",
  "SUPPRESSED",
  "SKIPPED_REGISTERED",
  "ALREADY_INVITED",
  "OPTED_OUT",
  "DAILY_LIMIT",
  "CONSENT_REQUIRED",
  "COUNTRY_BLOCKED",
  "INVALID",
];

describe("dış davet durumu", () => {
  it("kabul edildi = sırada ya da gönderildi; gönderildi YALNIZ SENT; sırada YALNIZ QUEUED", () => {
    expect(ALL.filter(isInviteAccepted)).toEqual(["QUEUED", "SENT"]);
    expect(ALL.filter(isInviteSent)).toEqual(["SENT"]);
    expect(ALL.filter(isInviteQueued)).toEqual(["QUEUED"]);
  });

  it("planlanan gönderim anı yalnız QUEUED sonucunda ve geçerli tarihse döner", () => {
    expect(queuedSendTime({ status: "QUEUED", sendAfter: "2026-10-09T06:40:00.000Z" })).toBe("2026-10-09T06:40:00.000Z");
    expect(queuedSendTime({ status: "QUEUED" })).toBeNull();
    expect(queuedSendTime({ status: "QUEUED", sendAfter: null })).toBeNull();
    expect(queuedSendTime({ status: "QUEUED", sendAfter: "yarın" })).toBeNull();
    // Gönderilmiş / düşmüş davetin "planlanan" anı gösterilmez.
    expect(queuedSendTime({ status: "SENT", sendAfter: "2026-10-09T06:40:00.000Z" })).toBeNull();
    expect(queuedSendTime({ status: "DAILY_LIMIT", sendAfter: "2026-10-09T06:40:00.000Z" })).toBeNull();
  });
});

describe("emailSiteMismatch — adresin alan adı ile firmanın sitesi", () => {
  it("aynı alan adı: fark yok (şema, www, yol ve harf büyüklüğü önemsiz)", () => {
    expect(emailSiteMismatch("satis@firma.com.tr", "https://www.firma.com.tr/iletisim")).toBeNull();
    expect(emailSiteMismatch("Satis@Firma.com.tr", "FIRMA.com.tr")).toBeNull();
    expect(emailSiteMismatch("info@rohr.de", "rohr.de")).toBeNull();
  });

  it("alt alan adı fark sayılmaz (iki yönde)", () => {
    expect(emailSiteMismatch("info@mail.firma.com", "firma.com")).toBeNull();
    expect(emailSiteMismatch("info@firma.com", "shop.firma.com")).toBeNull();
  });

  it("farklı alan adı: gösterilecek iki değer döner", () => {
    expect(emailSiteMismatch("satis@silkarendas.com", "endas.com")).toEqual({ domain: "silkarendas.com", host: "endas.com" });
    expect(emailSiteMismatch("firma@hotmail.com", "https://www.firma.com.tr")).toEqual({
      domain: "hotmail.com",
      host: "firma.com.tr",
    });
    // Sonu benzeyen ama farklı alan adı (ek değil).
    expect(emailSiteMismatch("sts@stsrulman.com", "stsrulman.com.tr")).toEqual({
      domain: "stsrulman.com",
      host: "stsrulman.com.tr",
    });
  });

  it("site ya da adres okunamıyorsa karşılaştırma yapılmaz", () => {
    expect(emailSiteMismatch("satis@firma.com", null)).toBeNull();
    expect(emailSiteMismatch("satis@firma.com", "")).toBeNull();
    expect(emailSiteMismatch(null, "firma.com")).toBeNull();
    expect(emailSiteMismatch("satis@", "firma.com")).toBeNull();
    expect(emailSiteMismatch("satis", "firma.com")).toBeNull();
    expect(emailSiteMismatch("satis@firma.com", "http://")).toBeNull();
    expect(emailSiteMismatch("satis@firma.com", "localhost")).toBeNull();
  });
});

/**
 * Son canlı kontrol 2026-10-10 (AUTO-COUNT-1 / F3): satır kuyrukta kalır ama
 * API mektubun talep kapanmadan gidemeyeceğini söylüyorsa (`notSentReason`)
 * "sıraya alındı" sayısına girmez; satır kilidi (`isInviteAccepted`) değişmez.
 */
describe("sırada ama gidemeyecek davet", () => {
  it("neden yalnız QUEUED sonucunda okunur", () => {
    expect(queuedNotSentReason({ status: "QUEUED", notSentReason: "FREQUENCY" })).toBe("FREQUENCY");
    expect(queuedNotSentReason({ status: "QUEUED" })).toBeNull();
    expect(queuedNotSentReason({ status: "QUEUED", notSentReason: null })).toBeNull();
    expect(queuedNotSentReason({ status: "SENT", notSentReason: "FREQUENCY" })).toBeNull();
  });

  it("gidecek davet = kabul edildi ve 'gidemeyecek' notu yok", () => {
    expect(inviteWillLeave({ status: "QUEUED" })).toBe(true);
    expect(inviteWillLeave({ status: "SENT" })).toBe(true);
    expect(inviteWillLeave({ status: "QUEUED", notSentReason: "CLOSES_FIRST" })).toBe(false);
    expect(inviteWillLeave({ status: "DAILY_LIMIT" })).toBe(false);
    // Satır kilidi aynı: kuyruktaki satır yeniden gönderilemez.
    expect(isInviteAccepted("QUEUED")).toBe(true);
  });
});
