/**
 * Onay akışı + rol/kullanıcı yönetimi — eski sistem paritesiyle:
 * akış doğrulama (onaycı rol kuralı, eşik monotonluğu), yayın onayı uçtan uca
 * (IN_APPROVAL → zincir → OPEN / ret → DRAFT + başlatana bildirim), eşik
 * atlama, iptal, geçmiş, pasif onaycı fallback'i; kullanıcı servisi kuralları
 * (rol kombinasyonu, son yönetici, sahip korumaları, izin override).
 */
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CompanyApprovalsService } from "../../src/modules/company-approvals/company-approvals.service";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { makeService } from "./make-service";

const future = (days: number) => new Date(Date.now() + days * 86_400_000);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

/** Gerçek onay servisi + event köprüsüyle ilan servisi (yayın/kazandırma). */
function makeApprovalRig() {
  const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const notifications = new NotificationService(prisma as never);
  const events = new EventEmitter2();
  const approvals = new CompanyApprovalsService(
    prisma as never,
    // P12 #3: bypass client (testte RLS kapalı → aynı client)
    prisma as never,
    events,
    email as never,
    config as never,
    notifications,
    new AuditService(prisma as never),
  );
  // İlan servisi — approvals GERÇEK; diğer yan etkiler makeService kalıbı.
  const { service: listings } = makeService();
  // @ts-expect-error test: mock'lanmış approvals gerçek servisle değiştirilir.
  listings["approvals"] = approvals;
  // @OnEvent bağları Nest dışı testte elle kurulur; handler promise'ları
  // biriktirilir ki karar sonrası deterministik beklenebilsin. Kazandırma
  // onayı: reddi ilanı CLOSED yapar (onAwardRejected); onayı ise gerçek
  // kazandırmayı çalıştırır (payload'daki bidId gerçek olmalı) — motor
  // testlerinde onay olayı YALNIZCA yakalanır (award yürütülmez).
  const inflight: Promise<unknown>[] = [];
  const awardApproved: unknown[] = [];
  events.on("listing.award.rejected", (p) =>
    inflight.push(listings.onAwardRejected(p as never)),
  );
  events.on("listing.award.approved", (p) => awardApproved.push(p));
  const flush = async () => {
    await Promise.all(inflight.splice(0));
  };
  return { approvals, listings, flush, email, awardApproved, events };
}

/** Aynı firmaya ek kullanıcı + auth. */
async function addUser(
  companyId: string,
  country: string,
  roles: string[],
) {
  const u = await makeUser(prisma, companyId, roles as never);
  return {
    user: u,
    auth: {
      userId: u.id,
      companyId,
      email: u.email,
      roles,
      country,
      tier: "GOLD",
    } as never,
  };
}

const flowInput = (approverIds: string[], over: Record<string, unknown> = {}) => ({
  name: "Kazandırma onayı",
  type: "LISTING_AWARD" as const,
  steps: approverIds.map((id) => ({ approverUserId: id })),
  ...over,
});

/** CLOSED ilan + kazandırma onay isteği başlat (publishListing yerine). */
async function startAward(
  approvals: { requestApproval: (...a: never[]) => Promise<unknown> },
  ownerAuth: unknown,
  companyId: string,
  createdById: string,
  amount = 5000,
) {
  const listing = await makeListing(prisma, {
    companyId,
    createdById,
    type: "ALIM",
    status: "CLOSED",
    closesAt: future(3),
  });
  const res = (await approvals.requestApproval(ownerAuth as never, {
    listingId: listing.id,
    type: "LISTING_AWARD",
    listingType: "ALIM",
    amount,
    currency: "TRY",
    payload: { kind: "full", bidId: "test-bid" },
  } as never)) as { approved: boolean; requestId?: string };
  return { listing, res };
}

describe("Akış doğrulama (eski sistem kuralları)", () => {
  it("operasyon rollü kullanıcı onaycı OLAMAZ; eşikler artan olmalı", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const buyerOnly = await addUser(owner.company.id, "TR", ["SATIN_ALMACI"]);
    const approver = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);

    await expect(
      approvals.createFlow(owner.auth, flowInput([buyerOnly.user.id]) as never),
    ).rejects.toThrow(/Yönetici veya Onaylayıcı/);

    await expect(
      approvals.createFlow(
        owner.auth,
        flowInput([approver.user.id, approver.user.id], {
          steps: [
            { approverUserId: approver.user.id, conditionMinAmount: 5000 },
            { approverUserId: approver.user.id, conditionMinAmount: 1000 },
          ],
        }) as never,
      ),
    ).rejects.toThrow(/artan sırada/);

    const ok = await approvals.createFlow(
      owner.auth,
      flowInput([approver.user.id]) as never,
    );
    expect(ok.id).toBeTruthy();
  });
});

describe("Kazandırma onayı — uçtan uca", () => {
  it("aktif akış: award → IN_AWARD_APPROVAL isteği; yanlış onaycı reddedilir; zincir onaylanınca award.approved event'i", async () => {
    const { approvals, awardApproved } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const a2 = await addUser(owner.company.id, "TR", ["YONETICI"]);
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });

    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id, a2.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);

    const { res: started } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
    );
    expect(started.approved).toBe(false);

    const req = await prisma.approvalRequest.findFirstOrThrow({
      where: { id: started.requestId!, status: "PENDING" },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    expect(req.steps.map((s) => s.status)).toEqual(["PENDING", "WAITING"]);

    // Yanlış firma → 404; sırası olmayan onaycı → Forbidden.
    await expect(
      approvals.decide(stranger.auth, req.id, "approve", {} as never),
    ).rejects.toThrow(/bulunamadı/);
    await expect(
      approvals.decide(a2.auth, req.id, "approve", {} as never),
    ).rejects.toThrow(/onaycısı değilsiniz/);

    // 1. adım onayı → 2. adım PENDING olur; istek hâlâ bekler.
    const r1 = await approvals.decide(a1.auth, req.id, "approve", {} as never);
    expect(r1.status).toBe("STEP_APPROVED");
    // 2. adım onayı → istek APPROVED + award.approved event (payload'lı).
    const r2 = await approvals.decide(a2.auth, req.id, "approve", {} as never);
    expect(r2.status).toBe("APPROVED");
    expect(awardApproved).toHaveLength(1);
    expect((awardApproved[0] as { payload: unknown }).payload).toMatchObject({
      kind: "full",
      bidId: "test-bid",
    });
  });

  it("ret: ilan CLOSED'a döner; başlatana in-app bildirim düşer (not ile)", async () => {
    const { approvals, flush } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const { listing, res: started } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
    );
    const req = await prisma.approvalRequest.findFirstOrThrow({
      where: { id: started.requestId! },
    });

    const res = await approvals.decide(a1.auth, req.id, "reject", {
      note: "fiyat uygun değil",
    } as never);
    expect(res.status).toBe("REJECTED");
    await flush();
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.status).toBe("CLOSED");

    // Başlatana bildirim (notifyRequester) — fire-and-forget'i bekle.
    await new Promise((r) => setTimeout(r, 300));
    const notif = await prisma.notification.findFirst({
      where: {
        companyUserId: owner.user.id,
        title: { contains: "reddedildi" },
      },
    });
    expect(notif).not.toBeNull();
    expect(notif!.body).toContain("fiyat uygun değil");
  });

  it("eşik atlama: tutar tüm adım eşiklerinin altındaysa onaysız ilerler", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id], {
        steps: [{ approverUserId: a1.user.id, conditionMinAmount: 100_000 }],
      }) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
    });

    const res = await approvals.requestApproval(owner.auth, {
      listingId: listing.id,
      type: "LISTING_AWARD",
      listingType: "ALIM",
      amount: 500, // eşik altı → adım atlanır
      currency: "TRY",
    });
    expect(res).toEqual({ approved: true });
  });

  it("iptal: yalnız başlatan/sahip; ilan CLOSED'a döner; geçmişte görünür", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const other = await addUser(owner.company.id, "TR", ["SATIN_ALMACI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const { listing, res: started } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
    );
    const req = await prisma.approvalRequest.findFirstOrThrow({
      where: { id: started.requestId! },
    });

    await expect(
      approvals.cancelRequest(other.auth, req.id),
    ).rejects.toThrow(/başlatan/);
    await approvals.cancelRequest(owner.auth, req.id);
    const after = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    expect(after.status).toBe("CLOSED");

    // Geçmiş: başlatan kendi isteğini iptal edilmiş görür (adımlarla).
    const hist = await approvals.listHistory(owner.auth);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.status).toBe("CANCELLED");
    expect(hist[0]!.mine).toBe(true);
    expect(hist[0]!.steps.length).toBeGreaterThan(0);
  });

  it("pasif onaycı fallback: initiator-DIŞI 3. admin'e devredilir (initiator'a DEĞİL)", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // initiator
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const a2 = await addUser(owner.company.id, "TR", ["YONETICI"]); // 3. admin
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    await startAward(approvals, owner.auth, owner.company.id, owner.user.id);

    // Onaycı a1 işten ayrıldı (pasif) → cron fallback'i devreder.
    await prisma.companyUser.update({
      where: { id: a1.user.id },
      data: { isActive: false },
    });
    const n = await approvals.fallbackInactiveApprovers();
    expect(n).toBe(1);
    const step = await prisma.approvalRequestStep.findFirstOrThrow({
      where: { status: "PENDING" },
    });
    // initiator (owner) DEĞİL — initiator-dışı uygun admin (a2, YONETICI).
    expect(step.approverUserId).toBe(a2.user.id);
    expect(step.approverUserId).not.toBe(owner.user.id);
  });

  it("fallback: initiator-dışı uygun onaylayıcı YOK (tek-admin) → request REJECTED (sessiz PENDING DEĞİL)", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // TEK admin + initiator
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const { res } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
    );
    const requestId = (res as { requestId?: string }).requestId!;

    // Tek onaylayıcı a1 pasifleşti; owner initiator (fallback'e uygun değil) →
    // uygun kimse kalmaz.
    await prisma.companyUser.update({
      where: { id: a1.user.id },
      data: { isActive: false },
    });
    const n = await approvals.fallbackInactiveApprovers();
    expect(n).toBe(0); // devredilen yok
    // Sessiz PENDING DEĞİL: request tanımlı biçimde REJECTED.
    const req = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: requestId },
    });
    expect(req.status).toBe("REJECTED");
    // Bekleyen adım da kapandı.
    const pending = await prisma.approvalRequestStep.count({
      where: { requestId, status: "PENDING" },
    });
    expect(pending).toBe(0);
  });

  it("requestApproval: ilk adım approver'ı == initiator + başka admin var → ANINDA ikame", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // initiator + approver
    const a2 = await addUser(owner.company.id, "TR", ["YONETICI"]); // ikame adayı
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([owner.user.id]) as never, // approver = owner (initiator)
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const { res } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
    );
    expect((res as { approved: boolean }).approved).toBe(false);
    const step = await prisma.approvalRequestStep.findFirstOrThrow({
      where: { status: "PENDING" },
    });
    // owner DEĞİL — initiator-dışı admin (a2) ile ikame edildi.
    expect(step.approverUserId).toBe(a2.user.id);
    expect(step.approverUserId).not.toBe(owner.user.id);
  });

  it("requestApproval: ilk adım approver'ı == initiator + başka uygun YOK → award ANINDA reddedilir (doomed PENDING yok)", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // tek admin
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([owner.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    await expect(
      startAward(approvals, owner.auth, owner.company.id, owner.user.id),
    ).rejects.toThrow(/sizden başka uygun bir onaylayıcı yok/i);
    // Doomed PENDING request oluşmadı.
    const cnt = await prisma.approvalRequest.count({
      where: { companyId: owner.company.id },
    });
    expect(cnt).toBe(0);
  });
});

describe("Yarış koruması (atomik karar/iptal)", () => {
  it("çift onay (aynı son adım): yalnız biri kazanır, tek award.approved; diğeri hata", async () => {
    const { approvals, awardApproved } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const { res: started } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
    );
    const reqId = started.requestId!;

    // İki eşzamanlı onay (çift tıklama / iki sekme).
    const results = await Promise.allSettled([
      approvals.decide(a1.auth, reqId, "approve", {} as never),
      approvals.decide(a1.auth, reqId, "approve", {} as never),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    // ÇİFT SİPARİŞ üretilmemeli: yalnız tek approved event.
    expect(awardApproved).toHaveLength(1);
    const req = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: reqId },
    });
    expect(req.status).toBe("APPROVED");
  });

  it("çift reddet: yalnız biri kazanır; istek REJECTED; diğeri hata", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const { res: started } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
    );
    const reqId = started.requestId!;

    const results = await Promise.allSettled([
      approvals.decide(a1.auth, reqId, "reject", { note: "a" } as never),
      approvals.decide(a1.auth, reqId, "reject", { note: "b" } as never),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const req = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: reqId },
    });
    expect(req.status).toBe("REJECTED");
  });

  it("fail-closed: award yürütücü patlarsa onay finalize EDİLMEZ, adım+istek PENDING'e döner", async () => {
    const { approvals, events } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const { res: started } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
    );
    const reqId = started.requestId!;

    // runFullAward'ın patlamasını taklit et (ör. teklif artık SUBMITTED değil).
    events.on("listing.award.approved", async () => {
      throw new Error("teklif durumu değişti");
    });

    await expect(
      approvals.decide(a1.auth, reqId, "approve", {} as never),
    ).rejects.toThrow(/uygulanamadı/);

    // Fail-closed: istek ve adım PENDING'e geri döndü → onaycı tekrar deneyebilir.
    const req = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: reqId },
      include: { steps: true },
    });
    expect(req.status).toBe("PENDING");
    expect(req.steps[0]!.status).toBe("PENDING");
    expect(req.steps[0]!.decidedAt).toBeNull();
  });

  it("onay + iptal yarışı: tutarlı son durum; onaylandıysa event var, iptalse yok", async () => {
    const { approvals, awardApproved } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const { listing, res: started } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
    );
    const reqId = started.requestId!;

    // Onaycı onaylarken başlatan aynı anda iptal ediyor.
    const results = await Promise.allSettled([
      approvals.decide(a1.auth, reqId, "approve", {} as never),
      approvals.cancelRequest(owner.auth, reqId),
    ]);
    // Tam olarak biri başarılı olmalı (ikisi de istek statüsünü PENDING'den
    // kaydırmaya çalışır; atomik CAS yalnız birine izin verir).
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const req = await prisma.approvalRequest.findUniqueOrThrow({
      where: { id: reqId },
    });
    const listingAfter = await prisma.listing.findUniqueOrThrow({
      where: { id: listing.id },
    });
    if (req.status === "APPROVED") {
      // Onay kazandı: tek event, ilan iptalle yanlışlıkla CLOSED'a düşürülmedi.
      expect(awardApproved).toHaveLength(1);
      expect(listingAfter.status).not.toBe("CANCELLED");
    } else {
      // İptal kazandı: hiç award event'i yok, ilan CLOSED.
      expect(req.status).toBe("CANCELLED");
      expect(awardApproved).toHaveLength(0);
      expect(listingAfter.status).toBe("CLOSED");
    }
  });
});

describe("Kullanıcı/rol yönetimi kuralları", () => {
  function makeUsersService() {
    const supabase = {
      createUser: jest.fn().mockResolvedValue({ authId: `auth-${Date.now()}` }),
      deleteUser: jest.fn(),
    };
    const companyAuth = { createSession: jest.fn() };
    const email = { send: jest.fn().mockResolvedValue({ emailLogId: "t" }) };
    const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
    return new CompanyUsersService(
      prisma as never,
      supabase as never,
      companyAuth as never,
      email as never,
      config as never,
      new AuditService(prisma as never),
    );
  }

  it("rol kombinasyonu (Faz R): Yönetici+op serbest; sahip korunur", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: ["YONETICI"] as never,
    });
    const member = await addUser(owner.company.id, "TR", ["SATIN_ALMACI"]);

    // Faz R: Yönetici + operasyon rolü ARTIK GEÇERLİ (münhasırlık kalktı).
    await svc.updateRoles(owner.auth, member.user.id, {
      roles: ["YONETICI", "SATISCI"],
    } as never);
    const combined = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.user.id },
    });
    expect(combined.roles.sort()).toEqual(["SATISCI", "YONETICI"].sort());
    // Satın Almacı + Satışçı birlikte OLUR (eskiden beri).
    await svc.updateRoles(owner.auth, member.user.id, {
      roles: ["SATIN_ALMACI", "SATISCI"],
    } as never);

    // Sahiplik normalizasyonu (2026-07-27): SAHIP'siz küme gönderilse bile
    // etiket SESSİZCE korunur (reddetmek yerine) — bırakmanın tek yolu devir.
    await svc.updateRoles(owner.auth, owner.user.id, {
      roles: ["SATIN_ALMACI"],
    } as never);
    const kept = await prisma.companyUser.findUnique({
      where: { id: owner.user.id },
      select: { roles: true },
    });
    expect(kept?.roles).toEqual(
      expect.arrayContaining(["SAHIP", "SATIN_ALMACI"]),
    );

    // Sahip pasifleştirilemez / çıkarılamaz.
    await expect(
      svc.setActive(owner.auth, owner.user.id, false),
    ).rejects.toThrow(/pasifleştirilemez|Kendinizi/);
    await expect(svc.remove(owner.auth, owner.user.id)).rejects.toThrow(
      /Kurucu çıkarılamaz|Kendinizi/,
    );
  });

  it("izin override yalnız SAHİP; rol-varsayılanıyla örtüşen kayıtlar sadeleştirilir", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const member = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const notOwner = await addUser(owner.company.id, "TR", ["YONETICI"]);

    await expect(
      svc.updatePermissions(
        { ...(notOwner.auth as object), isOwner: false } as never,
        member.user.id,
        { added: [], removed: [] } as never,
      ),
    ).rejects.toThrow(/yalnızca Kurucu/);

    // Faz R: İŞLEM izinleri override ile ATANAMAZ (katalog dışı → 400).
    await expect(
      svc.updatePermissions(
        { ...(owner.auth as object), isOwner: true } as never,
        member.user.id,
        { added: ["sell:listing:create"], removed: [] } as never,
      ),
    ).rejects.toThrow(/Geçersiz izin/);

    await svc.updatePermissions(
      { ...(owner.auth as object), isOwner: true } as never,
      member.user.id,
      // templates:manage ONAYLAYICI'da yok → added'a girer;
      // approval:act roldeyse added'dan sadeleşir.
      { added: ["templates:manage", "approval:act"], removed: [] } as never,
    );
    const u = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.user.id },
      select: { permissionsOverride: true },
    });
    const ov = u.permissionsOverride as { added: string[]; removed: string[] };
    expect(ov.added).toContain("templates:manage");
    expect(ov.added).not.toContain("approval:act"); // rolde zaten var
  });

  it("yükseltme koruması: devredilen users:manage ile operasyon rollü kullanıcı kendini YONETICI yapamaz", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: ["YONETICI"] as never,
    });
    const staff = await addUser(owner.company.id, "TR", ["SATISCI"]);
    // Owner, staff'a users:manage iznini devreder.
    await svc.updatePermissions(
      { ...(owner.auth as object), isOwner: true } as never,
      staff.user.id,
      { added: ["users:manage"], removed: [] } as never,
    );
    // staff kendini/başkasını YONETICI YAPAMAZ (Faz R: etiketi yalnız Kurucu verir).
    await expect(
      svc.updateRoles(staff.auth, staff.user.id, {
        roles: ["YONETICI"],
      } as never),
    ).rejects.toThrow(/Yönetici etiketini yalnızca Kurucu/);
    // Faz R: users:manage override'lı ama ETİKETSİZ kişi op-rol de ATAYAMAZ
    // (rol atama K+Y'ye kapalı — koltuk/yetki üretim kapısı).
    const other = await addUser(owner.company.id, "TR", ["SATIN_ALMACI"]);
    await expect(
      svc.updateRoles(staff.auth, other.user.id, {
        roles: ["SATISCI"],
      } as never),
    ).rejects.toThrow(/yalnızca Kurucu veya Yönetici/);
  });

  it("çıkarılan kullanıcının e-postası serbest kalır (yeniden davet/kayıt dead-end olmaz)", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: ["YONETICI"] as never,
    });
    const staff = await addUser(owner.company.id, "TR", ["SATISCI"]);
    const email = staff.user.email;
    await svc.remove(owner.auth, staff.user.id);
    // Orijinal e-posta artık hiçbir kullanıcıda değil (tombstone) → yeniden kullanılabilir.
    expect(
      await prisma.companyUser.findUnique({ where: { email } }),
    ).toBeNull();
  });
});

describe("BK-1 — SAHIP rol-kapsamlı onay akışından muaf DEĞİL", () => {
  it("SAHIP, [SATIN_ALMACI]-kapsamlı ALIM akışında onay TETİKLER (eski: baypas)", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // SAHIP
    const approver = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([approver.user.id], { initiatorRoles: ["SATIN_ALMACI"] }) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const { res } = await startAward(
      approvals,
      owner.auth,
      owner.company.id,
      owner.user.id,
      5000,
    );
    // Eskiden SAHIP ∉ [SATIN_ALMACI] → {approved:true} (onaysız kazandırma).
    // Artık ALIM'da SAHIP operasyonel rolle genişletilir → akış eşleşir.
    expect(res.approved).toBe(false);
    expect(res.requestId).toBeTruthy();
  });

  it("deadlock: tek-admin SAHIP kendi akışında ikame bulunamaz → REDDEDİLİR (Grup C)", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // TEK admin
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([owner.user.id], { initiatorRoles: ["SATIN_ALMACI"] }) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    // Akış artık SAHIP'e eşleşir; SAHIP kendi isteğini onaylayamaz + başka uygun
    // onaylayıcı yok → ikame-sonra-reddet (yeni deadlock değil, net hata).
    await expect(
      startAward(approvals, owner.auth, owner.company.id, owner.user.id, 5000),
    ).rejects.toThrow(/uygun bir onaylayıcı yok/i);
  });
});

describe("X-CF-3 — ilan+tip başına tek bekleyen istek (kısmi unique index)", () => {
  it("findFirst ön-kontrolü yarışı kaçırsa DB index yakalar → ConflictException", async () => {
    const { approvals } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // SAHIP
    const approver = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([approver.user.id], { initiatorRoles: ["SATIN_ALMACI"] }) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);

    const listing = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "CLOSED",
      closesAt: future(3),
    });
    // Zaten bekleyen bir istek VAR (ilk yarışçı kazandı).
    await prisma.approvalRequest.create({
      data: {
        companyId: owner.company.id,
        listingId: listing.id,
        type: "LISTING_AWARD",
        status: "PENDING",
        requestNo: "APR-2026-90001",
        amount: 1 as never,
        currency: "TRY" as never,
        createdById: owner.user.id,
        payload: {} as never,
      },
    });
    // Yarışı simüle et: existingPending ön-kontrolü bir kez NULL görsün
    // (iki eşzamanlı çağrı da commit'ten önce boş görür). Gerçek koruma DB
    // kısmi unique index — create P2002 → ConflictException'a çevrilmeli.
    const spy = jest
      .spyOn(prisma.approvalRequest, "findFirst")
      .mockResolvedValueOnce(null as never);
    try {
      await expect(
        approvals.requestApproval(owner.auth as never, {
          listingId: listing.id,
          type: "LISTING_AWARD",
          listingType: "ALIM",
          amount: 5000,
          currency: "TRY",
          payload: { kind: "full", bidId: "test-bid" },
        } as never),
      ).rejects.toThrow(/zaten bekleyen/i);
    } finally {
      spy.mockRestore();
    }
    // Hâlâ TEK bekleyen istek — ikinci üretilmedi.
    const n = await prisma.approvalRequest.count({
      where: { listingId: listing.id, type: "LISTING_AWARD", status: "PENDING" },
    });
    expect(n).toBe(1);
  });
});
