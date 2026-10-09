/**
 * ADAYIN DAVET SONUCU (2026-10-08) — yayın paneli ve talep sayfası bandı yalnız
 * DURUM gösterir: davet edildi / kuyrukta / gönderilmedi (+ neden). Sonuç aday
 * satırından tek başına değil, davet tablolarından türetilir (`candidateInvite`,
 * saf). Tur akışının sözleşmesi: `test/integration/ai-auto-invite.spec.ts`.
 */
import { candidateInvite } from "../../src/modules/ai/supplier-discovery/discovery-runs.service";

describe("candidateInvite — adayın davet sonucu (saf)", () => {
  const base = { memberCompanyId: null, memberInvited: false, active: false };
  const queue = (state: string, cancelReason: string | null = null) => ({ state, cancelReason, sendAfter: new Date("2030-01-01T09:00:00Z") });

  it.each([
    ["tur bulduğunda zaten davetliydi", { ...base, status: "ALREADY_INVITED", queue: queue("SENT") }, "ALREADY_INVITED", null],
    ["üye talebe davetli", { ...base, status: "INVITED", memberCompanyId: "m1", memberInvited: true }, "INVITED", null],
    ["e-posta gönderildi", { ...base, status: "INVITED", queue: queue("SENT") }, "INVITED", null],
    ["e-posta kuyrukta", { ...base, status: "INVITED", queue: queue("QUEUED") }, "QUEUED", null],
    ["dağıtıcı düşürdü (sıklık)", { ...base, status: "INVITED", queue: queue("CANCELLED", "FREQUENCY") }, "NOT_SENT", "FREQUENCY"],
    ["gönderim başarısız", { ...base, status: "INVITED", queue: queue("FAILED") }, "NOT_SENT", "FAILED"],
    ["alıcı davet bağlantısını iptal etti", { ...base, status: "INVITED", queue: queue("CANCELLED", "REFERRAL_CANCELLED") }, "NOT_SENT", "CANCELLED"],
    ["paket düştü", { ...base, status: "INVITED", queue: queue("CANCELLED", "INVITER_DOWNGRADED") }, "NOT_SENT", "NOT_ALLOWED"],
    ["günlük sınır", { ...base, status: "DAILY_LIMIT" }, "NOT_SENT", "DAILY_LIMIT"],
    ["kayıtlı adres", { ...base, status: "SKIPPED_REGISTERED" }, "NOT_SENT", "REGISTERED"],
    ["tur sürüyor", { ...base, status: "SUGGESTED", active: true }, "WAITING", null],
    ["tur bitti, sıra hiç gelmedi (eski akış)", { ...base, status: "MEMBER", memberCompanyId: "m1" }, "NOT_SENT", null],
  ])("%s", (_label, input, invite, inviteReason) => {
    expect(candidateInvite(input)).toMatchObject({ invite, inviteReason });
  });

  it("kuyruktaki davet en erken gönderim anını taşır", () => {
    expect(candidateInvite({ ...base, status: "INVITED", queue: queue("QUEUED") }).sendAfter).toBe("2030-01-01T09:00:00.000Z");
  });
});
