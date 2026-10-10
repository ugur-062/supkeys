/**
 * ADAYIN DAVET SONUCU (2026-10-08) — yayın paneli ve talep sayfası bandı yalnız
 * DURUM gösterir: davet edildi / kuyrukta / gönderilmedi (+ neden). Sonuç aday
 * satırından tek başına değil, davet tablolarından türetilir (`candidateInvite`,
 * saf). Tur akışının sözleşmesi: `test/integration/ai-auto-invite.spec.ts`.
 */
import type { QueuedInviteForecast } from "../../src/common/company/external-invite-policy";
import {
  candidateInvite,
  MEMBER_WEAK_MATCH,
  mergeCandidates,
  withQueueForecast,
} from "../../src/modules/ai/supplier-discovery/discovery-runs.service";
import type { AnnotatedCandidate, DiscoveryCandidate } from "../../src/modules/ai/supplier-discovery/supplier-discovery.service";

describe("candidateInvite — adayın davet sonucu (saf)", () => {
  const base = { memberCompanyId: null, memberInvited: false, active: false };
  const STORED = new Date("2030-01-01T09:00:00Z");
  const leaves = (at: Date): QueuedInviteForecast => ({ leavesAt: at, dropReason: null });
  const dropped = (dropReason: "FREQUENCY" | "PAUSED" | "CLOSES_FIRST"): QueuedInviteForecast => ({ leavesAt: null, dropReason });
  /** Sıradaki satır dağıtıcının öngörüsünü taşır (`withQueueForecast`); sırada olmayan satırda öngörü yoktur. */
  const queue = (state: string, cancelReason: string | null = null, forecast: QueuedInviteForecast | null = state === "QUEUED" ? leaves(STORED) : null) => ({
    state,
    cancelReason,
    sendAfter: STORED,
    forecast,
  });

  it.each([
    ["tur bulduğunda zaten davetliydi", { ...base, status: "ALREADY_INVITED", queue: queue("SENT") }, "ALREADY_INVITED", null],
    ["üye talebe davetli", { ...base, status: "INVITED", memberCompanyId: "m1", memberInvited: true }, "INVITED", null],
    ["e-posta gönderildi", { ...base, status: "INVITED", queue: queue("SENT") }, "INVITED", null],
    ["e-posta kuyrukta", { ...base, status: "INVITED", queue: queue("QUEUED") }, "QUEUED", null],
    // AUTO-COUNT-1: kuyrukta ama talep kapanmadan gidemeyecek satır "sırada" DEĞİL — sonuç mesajının saymadığı satır ekranda da sayılmaz.
    ["kuyrukta, 7 günlük fren kapanıştan sonra bitiyor", { ...base, status: "INVITED", queue: queue("QUEUED", null, dropped("FREQUENCY")) }, "NOT_SENT", "FREQUENCY"],
    ["kuyrukta, adres üç davete yanıt vermedi", { ...base, status: "INVITED", queue: queue("QUEUED", null, dropped("PAUSED")) }, "NOT_SENT", "PAUSED"],
    ["kuyrukta, sırası talep kapandıktan sonra geliyor", { ...base, status: "SUGGESTED", queue: queue("QUEUED", null, dropped("CLOSES_FIRST")) }, "NOT_SENT", "CLOSES_FIRST"],
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

  it("AUTO-COUNT-1: frendeki adresin saati frenin bittiği pencere (saklanan değil); gidemeyecek satır saat taşımaz", () => {
    const afterHold = new Date("2030-01-07T06:00:00Z");
    expect(candidateInvite({ ...base, status: "INVITED", queue: queue("QUEUED", null, leaves(afterHold)) })).toEqual({
      invite: "QUEUED",
      inviteReason: null,
      sendAfter: "2030-01-07T06:00:00.000Z",
    });
    expect(candidateInvite({ ...base, status: "INVITED", queue: queue("QUEUED", null, dropped("FREQUENCY")) }).sendAfter).toBeNull();
  });
});

describe("withQueueForecast — kuyruk satırları dağıtıcının öngörüsüyle, adres geçmişi TEK okumayla (AUTO-COUNT-1)", () => {
  const now = new Date("2026-10-09T19:20:00Z");
  const closesAt = new Date("2026-10-16T19:12:00Z");
  const listing = { id: "talep-2", closesAt };
  const stored = new Date("2026-10-12T06:32:00Z");
  const row = (email: string, state: string) => ({ email, state, source: "AI_AUTO" as const, country: "TR", sendAfter: stored });
  type Ahead = { email: string; source: "MANUAL" | "AI_FORM" | "AI_AUTO"; country: string | null; sendAfter: Date; listing: { closesAt: Date | null } };
  /**
   * Öngörünün üç okuması: gönderim günlüğü + bağlantıyı açanlar (`inviteAddressHistories`)
   * ve aynı adreslerin BAŞKA taleplerde sırada bekleyen mektupları.
   */
  const reads = (letters: Array<{ toEmail: string; queuedAt: Date }>, ahead: Ahead[] = []) => ({
    emailLog: { findMany: jest.fn().mockResolvedValue(letters) },
    companyReferralInvite: { findMany: jest.fn().mockResolvedValue([]) },
    externalListingInvite: { findMany: jest.fn().mockResolvedValue(ahead) },
  });

  it("dokuz sıradaki satır için adres geçmişi bir kez okunur; üçü bu hafta davet aldı → üçü gidemez, altısı saklanan saatinde", async () => {
    const held = ["a", "b", "c"].map((n) => `${n}@firma.com.tr`);
    const free = ["d", "e", "f", "g", "h", "i"].map((n) => `${n}@firma.com.tr`);
    const db = reads(held.map((toEmail) => ({ toEmail, queuedAt: new Date("2026-10-09T13:58:00Z") })));
    const rows = [...held, ...free].map((e) => row(e, "QUEUED"));

    const out = await withQueueForecast(db as never, [...rows, row("gitti@firma.com.tr", "SENT")], listing, now);

    expect(db.emailLog.findMany).toHaveBeenCalledTimes(1);
    expect(db.companyReferralInvite.findMany).toHaveBeenCalledTimes(1);
    expect(db.externalListingInvite.findMany).toHaveBeenCalledTimes(1);
    // Yalnız sıradaki adresler sorulur.
    expect(db.emailLog.findMany.mock.calls[0][0].where.toEmail.in).toEqual([...held, ...free]);
    expect(out.slice(0, 3).map((r) => r.forecast)).toEqual(held.map(() => ({ leavesAt: null, dropReason: "FREQUENCY" })));
    expect(out.slice(3, 9).map((r) => r.forecast)).toEqual(free.map(() => ({ leavesAt: stored, dropReason: null })));
    // Sırada olmayan satır öngörü taşımaz.
    expect(out[9]!.forecast).toBeNull();
  });

  it("sırada satır yoksa adres geçmişi hiç okunmaz", async () => {
    const db = reads([]);
    const out = await withQueueForecast(db as never, [row("gitti@firma.com.tr", "SENT"), row("dustu@firma.com.tr", "CANCELLED")], listing, now);
    expect(db.emailLog.findMany).not.toHaveBeenCalled();
    expect(db.companyReferralInvite.findMany).not.toHaveBeenCalled();
    expect(db.externalListingInvite.findMany).not.toHaveBeenCalled();
    expect(out.map((r) => r.forecast)).toEqual([null, null]);
  });

  /**
   * AUTO-COUNT-1 gözden geçirmesi: adres henüz hiçbir mektup ALMADI, ama başka
   * bir talebin mektubu aynı adres için sırada ve on iki dakika ÖNCE çıkacak.
   * Dağıtıcı onu gönderir, bu satırı 7 gün tutar (talep o arada kapanır) — geçmiş
   * boş olduğu için dört yüzey de "sırada, Pazartesi 09:32" diyordu.
   */
  it("aynı adrese BAŞKA talepten daha erken çıkacak sıradaki mektup da sayılır: satır 'sırada' değil; öteki adresler etkilenmez; okuma yine TEK sorgu", async () => {
    const aheadOf = (email: string, sendAfter: string): Ahead => ({
      email,
      source: "AI_AUTO",
      country: "TR",
      sendAfter: new Date(sendAfter),
      listing: { closesAt: new Date("2026-10-30T19:12:00Z") },
    });
    const db = reads(
      [],
      [aheadOf("once@firma.com.tr", "2026-10-12T06:20:00Z"), aheadOf("sonra@firma.com.tr", "2026-10-12T06:44:00Z")],
    );
    const rows = ["once@firma.com.tr", "sonra@firma.com.tr", "yalniz@firma.com.tr"].map((e) => row(e, "QUEUED"));

    const out = await withQueueForecast(db as never, rows, listing, now);

    expect(Object.fromEntries(out.map((r) => [r.email, r.forecast]))).toEqual({
      // Öteki talebin mektubu 09:20'de çıkar; fren talebin kapanışını aşar.
      "once@firma.com.tr": { leavesAt: null, dropReason: "FREQUENCY" },
      // Öteki talebin mektubu DAHA GEÇ: önce bu satır çıkar.
      "sonra@firma.com.tr": { leavesAt: stored, dropReason: null },
      "yalniz@firma.com.tr": { leavesAt: stored, dropReason: null },
    });
    // Satır başına değil, talep başına tek okuma: sıradaki bütün adresler, BU talep hariç,
    // yalnız dağıtıcının okuyacağı satırlar (yayındaki talep, iptal edilmemiş bağlantı, geçerli otomatik davet).
    expect(db.externalListingInvite.findMany).toHaveBeenCalledTimes(1);
    const where = db.externalListingInvite.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({
      state: "QUEUED",
      email: { in: rows.map((r) => r.email) },
      listingId: { not: "talep-2" },
      listing: { status: "OPEN" },
      referralInvite: { status: { not: "CANCELLED" } },
      NOT: { source: "AI_AUTO" },
    });
    expect(where).not.toHaveProperty("sendAfter");
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
