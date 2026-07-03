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
    events,
    email as never,
    config as never,
    notifications,
  );
  // İlan servisi — approvals GERÇEK; diğer yan etkiler makeService kalıbı.
  const { service: listings } = makeService();
  // @ts-expect-error test: mock'lanmış approvals gerçek servisle değiştirilir.
  listings["approvals"] = approvals;
  // @OnEvent bağları Nest dışı testte elle kurulur; handler promise'ları
  // biriktirilir ki karar sonrası deterministik beklenebilsin.
  const inflight: Promise<unknown>[] = [];
  events.on("listing.publish.approved", (p) =>
    inflight.push(listings.onPublishApproved(p as never)),
  );
  events.on("listing.publish.rejected", (p) =>
    inflight.push(listings.onPublishRejected(p as never)),
  );
  const flush = async () => {
    await Promise.all(inflight.splice(0));
  };
  return { approvals, listings, flush, email };
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
      tier: "PAKET",
    } as never,
  };
}

const flowInput = (approverIds: string[], over: Record<string, unknown> = {}) => ({
  name: "Yayın onayı",
  type: "LISTING_PUBLISH" as const,
  steps: approverIds.map((id) => ({ approverUserId: id })),
  ...over,
});

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

describe("Yayın onayı — uçtan uca", () => {
  it("aktif akış: publish → IN_APPROVAL; yanlış onaycı reddedilir; zincir onaylanınca OPEN", async () => {
    const { approvals, listings, flush } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const a2 = await addUser(owner.company.id, "TR", ["YONETICI"]);
    const stranger = await makeCompanyWithUser(prisma, { country: "TR" });

    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id, a2.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);

    const draft = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      closesAt: future(3),
    });
    const published = await listings.publishListing(owner.auth, draft.id);
    expect(published.status).toBe("IN_APPROVAL");

    const req = await prisma.approvalRequest.findFirstOrThrow({
      where: { listingId: draft.id, status: "PENDING" },
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
    // 2. adım onayı → istek APPROVED + event → ilan OPEN.
    const r2 = await approvals.decide(a2.auth, req.id, "approve", {} as never);
    expect(r2.status).toBe("APPROVED");
    await flush();
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(listing.status).toBe("OPEN");
    expect(listing.publishedAt).not.toBeNull();
  });

  it("ret: ilan DRAFT'a döner; başlatana in-app bildirim düşer (not ile)", async () => {
    const { approvals, listings, flush } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const draft = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      closesAt: future(3),
    });
    await listings.publishListing(owner.auth, draft.id);
    const req = await prisma.approvalRequest.findFirstOrThrow({
      where: { listingId: draft.id },
    });

    const res = await approvals.decide(a1.auth, req.id, "reject", {
      note: "bütçe uygun değil",
    } as never);
    expect(res.status).toBe("REJECTED");
    await flush();
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(listing.status).toBe("DRAFT");

    // Başlatana bildirim (notifyRequester) — fire-and-forget'i bekle.
    await new Promise((r) => setTimeout(r, 300));
    const notif = await prisma.notification.findFirst({
      where: {
        companyUserId: owner.user.id,
        title: { contains: "reddedildi" },
      },
    });
    expect(notif).not.toBeNull();
    expect(notif!.body).toContain("bütçe uygun değil");
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
      status: "DRAFT",
    });

    const res = await approvals.requestApproval(owner.auth, {
      listingId: listing.id,
      type: "LISTING_PUBLISH",
      listingType: "ALIM",
      amount: 500, // eşik altı → adım atlanır
      currency: "TRY",
    });
    expect(res).toEqual({ approved: true });
  });

  it("iptal: yalnız başlatan/sahip; ilan DRAFT'a döner; geçmişte görünür", async () => {
    const { approvals, listings } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const other = await addUser(owner.company.id, "TR", ["SATIN_ALMACI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const draft = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      closesAt: future(3),
    });
    await listings.publishListing(owner.auth, draft.id);
    const req = await prisma.approvalRequest.findFirstOrThrow({
      where: { listingId: draft.id },
    });

    await expect(
      approvals.cancelRequest(other.auth, req.id),
    ).rejects.toThrow(/başlatan/);
    await approvals.cancelRequest(owner.auth, req.id);
    const listing = await prisma.listing.findUniqueOrThrow({
      where: { id: draft.id },
    });
    expect(listing.status).toBe("DRAFT");

    // Geçmiş: başlatan kendi isteğini iptal edilmiş görür (adımlarla).
    const hist = await approvals.listHistory(owner.auth);
    expect(hist).toHaveLength(1);
    expect(hist[0]!.status).toBe("CANCELLED");
    expect(hist[0]!.mine).toBe(true);
    expect(hist[0]!.steps.length).toBeGreaterThan(0);
  });

  it("pasif onaycı fallback: bekleyen adım aktif YONETICI'ye devredilir", async () => {
    const { approvals, listings } = makeApprovalRig();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" }); // YONETICI (sahip)
    const a1 = await addUser(owner.company.id, "TR", ["ONAYLAYICI"]);
    const flow = await approvals.createFlow(
      owner.auth,
      flowInput([a1.user.id]) as never,
    );
    await approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
    const draft = await makeListing(prisma, {
      companyId: owner.company.id,
      createdById: owner.user.id,
      type: "ALIM",
      status: "DRAFT",
      closesAt: future(3),
    });
    await listings.publishListing(owner.auth, draft.id);

    // Onaycı işten ayrıldı (pasif) → cron fallback'i devreder.
    await prisma.companyUser.update({
      where: { id: a1.user.id },
      data: { isActive: false },
    });
    const n = await approvals.fallbackInactiveApprovers();
    expect(n).toBe(1);
    const step = await prisma.approvalRequestStep.findFirstOrThrow({
      where: { status: "PENDING" },
    });
    expect(step.approverUserId).toBe(owner.user.id); // aktif YONETICI
  });
});

describe("Kullanıcı/rol yönetimi kuralları", () => {
  function makeUsersService() {
    const supabase = {
      createUser: jest.fn().mockResolvedValue({ authId: `auth-${Date.now()}` }),
      deleteUser: jest.fn(),
    };
    const passwordReset = { requestForCompany: jest.fn() };
    return new CompanyUsersService(
      prisma as never,
      supabase as never,
      passwordReset as never,
    );
  }

  it("rol kombinasyonu: Yönetici/Onaylayıcı tek başına; son Yönetici düşürülemez; sahip korunur", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, {
      country: "TR",
      roles: ["YONETICI"] as never,
    });
    const member = await addUser(owner.company.id, "TR", ["SATIN_ALMACI"]);

    // Yönetici + operasyon rolü birlikte olamaz.
    await expect(
      svc.updateRoles(owner.auth, member.user.id, {
        roles: ["YONETICI", "SATISCI"],
      } as never),
    ).rejects.toThrow(/tek başına/);
    // Satın Almacı + Satışçı birlikte OLUR.
    await svc.updateRoles(owner.auth, member.user.id, {
      roles: ["SATIN_ALMACI", "SATISCI"],
    } as never);

    // Sahibin Yönetici rolü kaldırılamaz.
    await expect(
      svc.updateRoles(owner.auth, owner.user.id, {
        roles: ["SATIN_ALMACI"],
      } as never),
    ).rejects.toThrow(/sahibinin Yönetici rolü/);

    // Sahip pasifleştirilemez / çıkarılamaz.
    await expect(
      svc.setActive(owner.auth, owner.user.id, false),
    ).rejects.toThrow(/pasifleştirilemez|Kendinizi/);
    await expect(svc.remove(owner.auth, owner.user.id)).rejects.toThrow(
      /sahibi çıkarılamaz|Kendinizi/,
    );
  });

  it("izin override yalnız SAHİP; rol-varsayılanıyla örtüşen kayıtlar sadeleştirilir", async () => {
    const svc = makeUsersService();
    const owner = await makeCompanyWithUser(prisma, { country: "TR" });
    const member = await addUser(owner.company.id, "TR", ["SATIN_ALMACI"]);
    const notOwner = await addUser(owner.company.id, "TR", ["YONETICI"]);

    await expect(
      svc.updatePermissions(
        { ...(notOwner.auth as object), isOwner: false } as never,
        member.user.id,
        { added: [], removed: [] } as never,
      ),
    ).rejects.toThrow(/yalnızca firma sahibi/);

    await svc.updatePermissions(
      { ...(owner.auth as object), isOwner: true } as never,
      member.user.id,
      // sell:listing:create SATIN_ALMACI'da yok → added'a girer;
      // buy:bid:review roldeyse added'dan sadeleşir.
      { added: ["sell:listing:create", "buy:bid:review"], removed: [] } as never,
    );
    const u = await prisma.companyUser.findUniqueOrThrow({
      where: { id: member.user.id },
      select: { permissionsOverride: true },
    });
    const ov = u.permissionsOverride as { added: string[]; removed: string[] };
    expect(ov.added).toContain("sell:listing:create");
    expect(ov.added).not.toContain("buy:bid:review"); // rolde zaten var
  });
});
