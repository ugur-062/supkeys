/**
 * ADAYIN DAVET SONUCU (2026-10-08) — yayın paneli ve talep sayfası bandı yalnız
 * DURUM gösterir: davet edildi / kuyrukta / gönderilmedi (+ neden). Sonuç aday
 * satırından tek başına değil, davet tablolarından türetilir (`candidateInvite`,
 * saf). Tur akışının sözleşmesi: `test/integration/ai-auto-invite.spec.ts`.
 */
import {
  candidateInvite,
  MEMBER_WEAK_MATCH,
  mergeCandidates,
} from "../../src/modules/ai/supplier-discovery/discovery-runs.service";
import type { AnnotatedCandidate, DiscoveryCandidate } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";

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
    // AUTO-MEMBER-1: yalnız segmenti uyan üye otomatik davet edilmez — neden söylenir, tur sürerken de "bekliyor" değildir.
    ["zayıf eşleşen üye", { ...base, status: "WEAK_MATCH", memberCompanyId: "m1" }, "NOT_SENT", "WEAK_MATCH"],
    ["zayıf eşleşen üye, tur sürüyor", { ...base, status: "WEAK_MATCH", memberCompanyId: "m1", active: true }, "NOT_SENT", "WEAK_MATCH"],
    ["zayıf eşleşen üyeyi alıcı pencereden davet etti", { ...base, status: "WEAK_MATCH", memberCompanyId: "m1", memberInvited: true }, "INVITED", null],
  ])("%s", (_label, input, invite, inviteReason) => {
    expect(candidateInvite(input)).toMatchObject({ invite, inviteReason });
  });

  it("kuyruktaki davet en erken gönderim anını taşır", () => {
    expect(candidateInvite({ ...base, status: "INVITED", queue: queue("QUEUED") }).sendAfter).toBe("2030-01-01T09:00:00.000Z");
  });
});

/**
 * Canlı doğrulama 2026-10-09, AUTO-MEMBER-1 — otomatik tur eşleştiricinin
 * döndürdüğü HER üyeyi davet ediyordu, "güçlü değil" dediklerini de (yalnız üst
 * segment uyuyor): hidrolik silindir talebine bir hırdavatçı ve iki makine
 * imalatçısı, elektrik talebine yalnız o segmentte alım yapan bir firma. Davet
 * alıcıya sorulmadan gittiği için yalnız GÜÇLÜ eşleşmeye gider; öteki üye
 * `WEAK_MATCH` yazılır (davet edilmez, durum listesi nedenini söyler).
 */
describe("mergeCandidates — otomatik tur yalnız güçlü eşleşen üyeyi davete yazar (AUTO-MEMBER-1)", () => {
  const member = (companyId: string, strongMatch: boolean, extra: Partial<DiscoveryCandidate> = {}): DiscoveryCandidate => ({
    companyId,
    name: `Firma ${companyId}`,
    city: null,
    country: "TR",
    rothernId: null,
    alreadyInvited: false,
    matchedCategories: [],
    strongMatch,
    matchedItems: [],
    connectionStatus: "NONE",
    ...extra,
  });
  const web = (name: string, extra: Partial<AnnotatedCandidate> = {}): AnnotatedCandidate => ({
    name,
    city: null,
    country: "TR",
    website: null,
    email: `info@${name.toLowerCase()}.com`,
    reason: "r",
    matchedItems: [1],
    scope: "LOCAL",
    status: "SUGGESTED",
    recentlyInvited: false,
    memberCompanyId: null,
    ...extra,
  });
  const statuses = (rows: ReturnType<typeof mergeCandidates>) => rows.map((r) => [r.memberCompanyId ?? r.email, r.status, r.source]);
  const AUTO = { strongMembersOnly: true };

  it("güçlü eşleşen üye MEMBER (davet edilecek), yalnız segmenti uyan üye WEAK_MATCH; zaten davetli olan öyle kalır", () => {
    const rows = mergeCandidates(
      [member("item", true, { matchedItems: [1] }), member("segment", false), member("invited", false, { alreadyInvited: true })],
      [],
      new Set(),
      "TR",
      AUTO,
    );
    expect(MEMBER_WEAK_MATCH).toBe("WEAK_MATCH");
    expect(statuses(rows)).toEqual([
      ["item", "MEMBER", "PLATFORM"],
      ["segment", "WEAK_MATCH", "PLATFORM"],
      ["invited", "ALREADY_INVITED", "PLATFORM"],
    ]);
  });

  it("web araması aynı üyeyi bu talep için de bulduysa (ikinci kaynak) üye davet edilir: BOTH + MEMBER", () => {
    const rows = mergeCandidates(
      [member("segment", false), member("other", false)],
      [web("Segment", { status: "MEMBER", memberCompanyId: "segment" }), web("Yeni")],
      new Set(),
      "TR",
      AUTO,
    );
    expect(statuses(rows)).toEqual([
      ["segment", "MEMBER", "BOTH"],
      ["other", "WEAK_MATCH", "PLATFORM"],
      ["info@yeni.com", "SUGGESTED", "WEB"],
    ]);
  });

  it("yalnız web'de bulunan üye ve kayıtsız aday etkilenmez", () => {
    const rows = mergeCandidates([], [web("Uye", { status: "MEMBER", memberCompanyId: "m9" }), web("Yeni")], new Set(), "TR", AUTO);
    expect(statuses(rows)).toEqual([
      ["m9", "MEMBER", "WEB"],
      ["info@yeni.com", "SUGGESTED", "WEB"],
    ]);
  });

  it("seçenek verilmezse (kendisi davet etmeyen liste) zayıf eşleşen üye de MEMBER kalır", () => {
    expect(statuses(mergeCandidates([member("segment", false)], [], new Set(), "TR"))).toEqual([["segment", "MEMBER", "PLATFORM"]]);
  });
});
