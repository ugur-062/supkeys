import {
  REFERRAL_TTL_DAYS,
  deliverInvite,
  formatInviteDeadline,
  isReferralExpired,
} from "../../src/common/company/invite-delivery";
import { discoveryLocationLine } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";
import { inviteRoleLine } from "../../src/modules/company-users/company-users.service";

/**
 * Davet e-postaları denetimi (2026-09-27) — saf yardımcıların sözleşmesi:
 * teslim sonucu gerçek (SENT/SUPPRESSED/FAILED + zaman aşımı), referral token
 * ömrü, İstanbul duvar saatiyle son teklif tarihi, web araması konumu ve
 * yalnız görüntüleme izinli davetin rol satırı.
 */
describe("deliverInvite — teslim sonucu BEKLENİR ve dürüst döner", () => {
  it("sağlayıcı kabul etti → SENT", async () => {
    await expect(deliverInvite(async () => ({ sent: true }))).resolves.toEqual({
      delivery: "SENT",
    });
  });

  it("suppress (hata atmaz, sent:false) → SUPPRESSED — eskiden 'gönderildi' sayılıyordu", async () => {
    await expect(deliverInvite(async () => ({ sent: false }))).resolves.toEqual({
      delivery: "SUPPRESSED",
    });
  });

  it("sağlayıcı hatası → FAILED + hata metni (istisna yutulmaz, sınıflanır)", async () => {
    const res = await deliverInvite(async () => {
      throw new Error("resend 500");
    });
    expect(res).toEqual({ delivery: "FAILED", error: "resend 500" });
  });

  it("süre sınırı → FAILED + timedOut (istek sonsuza dek beklemez)", async () => {
    const res = await deliverInvite(
      () => new Promise<{ sent: boolean }>(() => undefined),
      20,
    );
    expect(res).toEqual({ delivery: "FAILED", timedOut: true });
  });
});

describe("isReferralExpired — son gönderimden 30 gün", () => {
  const now = new Date("2026-09-27T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

  it("30 günün içinde geçerli, aşınca süresi dolmuş", () => {
    expect(REFERRAL_TTL_DAYS).toBe(30);
    expect(isReferralExpired(daysAgo(1), now)).toBe(false);
    expect(isReferralExpired(daysAgo(30), now)).toBe(false);
    expect(isReferralExpired(daysAgo(31), now)).toBe(true);
  });
});

describe("formatInviteDeadline — Europe/Istanbul duvar saati", () => {
  it("UTC 22:30 kapanış İstanbul'da ERTESİ gün 01:30 — ham UTC günü basılmaz", () => {
    // 2026-10-04T22:30Z = 5 Ekim 01:30 (+03). Eski `toISOString().slice(0,10)`
    // "2026-10-04" basıyordu — bir gün önce.
    const d = new Date("2026-10-04T22:30:00Z");
    const tr = formatInviteDeadline(d, "tr");
    expect(tr).toContain("5 Ekim 2026");
    expect(tr).toContain("01:30");
    const en = formatInviteDeadline(d, "en");
    expect(en).toContain("October 5, 2026");
    const ru = formatInviteDeadline(d, "ru");
    expect(ru).toContain("5 октября 2026");
  });
});

describe("discoveryLocationLine — web araması talebin ülkesinden", () => {
  it("hedef ülkeler doluysa yalnız o ülkeler (Türkiye sabiti YOK)", () => {
    const line = discoveryLocationLine({
      targetCountries: ["DE", "FR", "DE", "ZZ"],
      buyerCountry: "TR",
    });
    expect(line).toContain("Almanya, Fransa ülkelerinde");
    expect(line).not.toContain("Türkiye");
  });

  it("tüm ülkeler (boş) → alıcının ülkesi öncelikli, arama sınırlanmaz", () => {
    const line = discoveryLocationLine({ targetCountries: [], buyerCountry: "AE" });
    expect(line).toContain("Birleşik Arap Emirlikleri öncelikli");
    expect(line).toContain("herhangi bir ülkede");
  });

  it("ülke bilinmiyorsa uluslararası; bölge serbest metni kısaltılıp parantezde", () => {
    const line = discoveryLocationLine({
      targetCountries: [],
      buyerCountry: null,
      region: `  Ege ${"x".repeat(100)}`,
    });
    expect(line.startsWith("Herhangi bir ülkede")).toBe(true);
    expect(line).toMatch(/\(bölge önceliği: Ege x+\)$/);
    expect(line.length).toBeLessThan(150);
  });
});

describe("inviteRoleLine — yalnız görüntüleme izinli davet", () => {
  it("rol seti boşsa 'Görüntüleyici' (satır boş kalmaz), dilde", () => {
    expect(inviteRoleLine([], "tr")).toBe("Görüntüleyici");
    expect(inviteRoleLine([], "en")).toBe("Viewer");
    expect(inviteRoleLine([], "ru")).toBe("Наблюдатель");
  });

  it("dolu rol seti etiketleri birleştirir", () => {
    expect(inviteRoleLine(["SATIN_ALMACI", "SATISCI"] as never, "tr")).toBe(
      "Satın Almacı + Satışçı",
    );
  });
});
