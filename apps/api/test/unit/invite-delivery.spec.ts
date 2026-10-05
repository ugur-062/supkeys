import {
  REFERRAL_TTL_DAYS,
  deliverInvite,
  formatInviteDeadline,
  formatInvitePlace,
  isReferralExpired,
} from "../../src/common/company/invite-delivery";
import { appRoutes } from "../../src/common/company/app-routes";
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

  it("teslim edilemez alan adı → SUPPRESSED + undeliverable (ekran 'adres geri çevirdi' demez)", async () => {
    await expect(
      deliverInvite(async () => ({ sent: false, skipReason: "undeliverable" })),
    ).resolves.toEqual({ delivery: "SUPPRESSED", undeliverable: true });
  });

  it.each(["suppressed", "opted_out"])("skipReason %s → yalın SUPPRESSED", async (skipReason) => {
    await expect(deliverInvite(async () => ({ sent: false, skipReason }))).resolves.toEqual({
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
    // Yabancı alıcı hangi saat olduğunu bilsin: saat dilimi ibaresi.
    expect(en).toContain("GMT+3");
    expect(ru).toContain("GMT+3");
  });
});

describe("formatInvitePlace — yalnız şehir + ülke, alıcının dilinde", () => {
  it("Türkiye ili üç dilde; yabancı şehir kayıtlı yazımıyla; ülke dilde", () => {
    expect(formatInvitePlace("İstanbul", "TR", "tr")).toBe("İstanbul, Türkiye");
    expect(formatInvitePlace("İstanbul", "TR", "ru")).toBe("Стамбул, Турция");
    expect(formatInvitePlace("Munich", "DE", "en")).toBe("Munich, Germany");
    expect(formatInvitePlace("Lefkoşa", "XN", "en")).toBe("Lefkoşa, Northern Cyprus");
  });

  it("eksik parça düşer; ikisi de yoksa null (satır çizilmez)", () => {
    expect(formatInvitePlace(null, "DE", "tr")).toBe("Almanya");
    expect(formatInvitePlace("Bursa", null, "en")).toBe("Bursa");
    expect(formatInvitePlace(null, "ZZ", "en")).toBeNull();
    expect(formatInvitePlace("", "", "tr")).toBeNull();
  });
});

describe("appRoutes.signupWithRef — kayıt sonrası dönüş", () => {
  it("redirect İÇ yol olarak kodlanır, yol parçası alıcının dilinde", () => {
    expect(appRoutes.signupWithRef("https://x.com", "tok", "tr")).toBe("https://x.com/company/kayit?ref=tok");
    expect(appRoutes.signupWithRef("https://x.com", "tok", "en", "/company/ilan/l1")).toBe(
      "https://x.com/en/company/signup?ref=tok&redirect=%2Fcompany%2Filan%2Fl1",
    );
    expect(appRoutes.signupWithRef("https://x.com", "tok", "ru", "/company/ilan/l1")).toBe(
      "https://x.com/ru/kompaniya/registratsiya?ref=tok&redirect=%2Fcompany%2Filan%2Fl1",
    );
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
