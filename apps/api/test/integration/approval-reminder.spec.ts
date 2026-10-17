/**
 * Bekleyen onay hatırlatması — `ApprovalsScheduler.remind` →
 * `CompanyApprovalsService.remindPending` (günlük 09:00 İstanbul + açılış
 * telafisi). Sözleşme: yalnız 3 günden uzun bekleyen PENDING istek, sırası
 * gelen onaycıya, 24 saatte EN FAZLA bir kez; sahiplenme atomik (iki örnek aynı
 * anda koşsa da tek e-posta). Hatalı tekilleştirme = her gün çift e-posta ya
 * da hiç hatırlatma.
 */
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ApprovalsScheduler } from "../../src/modules/company-approvals/approvals.scheduler";
import { CompanyApprovalsService } from "../../src/modules/company-approvals/company-approvals.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import { prisma, truncateAll } from "./test-db";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(Date.now() - ms);

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

function makeRig() {
  const email = {
    send: jest.fn().mockResolvedValue({ emailLogId: "t", sent: true }),
  };
  const config = { get: jest.fn().mockReturnValue("http://localhost:3000") };
  const approvals = new CompanyApprovalsService(
    prisma as never,
    prisma as never, // bypass client (testte RLS kapalı → aynı istemci)
    new EventEmitter2(),
    email as never,
    config as never,
    new NotificationService(prisma as never),
    new AuditService(prisma as never),
  );
  // Cron kaydı olmadan (DI dışı) — `trackCronRun` kayıtsız da işi koşturur.
  const scheduler = new ApprovalsScheduler(approvals);
  return { approvals, scheduler, email };
}

async function addApprover(companyId: string, role = "ONAYLAYICI") {
  return makeUser(prisma, companyId, [role] as never);
}

/**
 * Aktif kazandırma akışı + bekleyen istek. İstek açılırken giden "onayınız
 * bekleniyor" e-postası beklenip sayaç sıfırlanır: sonraki her `email.send`
 * çağrısı HATIRLATMADIR.
 */
async function pendingRequest(
  rig: ReturnType<typeof makeRig>,
  opts: { createdAgoMs: number; approverCount?: number },
) {
  const owner = await makeCompanyWithUser(prisma, { country: "TR" });
  const approvers = [];
  for (let i = 0; i < (opts.approverCount ?? 1); i++) {
    approvers.push(await addApprover(owner.company.id, i === 0 ? "ONAYLAYICI" : "YONETICI"));
  }
  const flow = await rig.approvals.createFlow(owner.auth, {
    name: "Kazandırma onayı",
    type: "LISTING_AWARD",
    steps: approvers.map((a) => ({ approverUserId: a.id })),
  } as never);
  await rig.approvals.setStatus(owner.auth, flow.id, { status: "ACTIVE" } as never);
  const listing = await makeListing(prisma, {
    companyId: owner.company.id,
    createdById: owner.user.id,
    type: "ALIM",
    status: "CLOSED",
  });
  const res = (await rig.approvals.requestApproval(owner.auth, {
    listingId: listing.id,
    type: "LISTING_AWARD",
    listingType: "ALIM",
    amount: 5000,
    currency: "TRY",
    payload: { kind: "full", bidId: "test-bid" },
  } as never)) as { approved: boolean; requestId?: string };
  expect(res.approved).toBe(false);
  const requestId = res.requestId!;
  // İlk bildirim arka planda (void) gidebilir → yerleşmesini bekle.
  for (let i = 0; i < 100 && rig.email.send.mock.calls.length === 0; i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  expect(rig.email.send).toHaveBeenCalledTimes(1);
  rig.email.send.mockClear();
  await prisma.approvalRequest.update({
    where: { id: requestId },
    data: { createdAt: ago(opts.createdAgoMs) },
  });
  return { owner, approvers, listing, requestId };
}

const recipients = (rig: ReturnType<typeof makeRig>) =>
  rig.email.send.mock.calls.map(
    (c) => (c[0] as { to: { email: string } }).to.email,
  );

const lastReminderAt = async (id: string) =>
  (await prisma.approvalRequest.findUniqueOrThrow({ where: { id } }))
    .lastReminderAt;

describe("Onay hatırlatma cron'u — ApprovalsScheduler.remind", () => {
  it("2 gündür bekleyen istek hatırlatılmaz (eşik 3 gün), damga yazılmaz", async () => {
    const rig = makeRig();
    const { requestId } = await pendingRequest(rig, { createdAgoMs: 2 * DAY });

    await rig.scheduler.remind();

    expect(rig.email.send).not.toHaveBeenCalled();
    expect(await lastReminderAt(requestId)).toBeNull();
  });

  it("4 gündür bekleyen istek: sırası gelen onaycıya TAM BİR hatırlatma (bekleme süresiyle), damga yazılır", async () => {
    const rig = makeRig();
    const { requestId, approvers, listing } = await pendingRequest(rig, {
      createdAgoMs: 4 * DAY + HOUR,
    });
    const before = Date.now();

    expect(await rig.approvals.remindPending()).toBe(1);

    expect(recipients(rig)).toEqual([approvers[0]!.email]);
    const sent = rig.email.send.mock.calls[0]![0] as {
      templateData: { data: { paragraphs: string[] } };
      context: { type: string; id: string };
    };
    // "N gündür bekliyor" satırı gerçek bekleme süresini taşır.
    expect(sent.templateData.data.paragraphs.join(" ")).toMatch(/\b4\b/);
    expect(sent.context).toEqual({ type: "approval_pending", id: listing.id });
    const stamp = await lastReminderAt(requestId);
    expect(stamp).not.toBeNull();
    expect(stamp!.getTime()).toBeGreaterThanOrEqual(before - 1000);
    // Uygulama içi bildirim de düşer (istek açılışındaki + hatırlatma).
    expect(
      await prisma.notification.count({
        where: { companyUserId: approvers[0]!.id, type: "approval_pending" },
      }),
    ).toBe(2);
  });

  it("aynı gün ikinci koşu (ve açılış telafisi) yeniden hatırlatmaz", async () => {
    const rig = makeRig();
    const { requestId } = await pendingRequest(rig, { createdAgoMs: 4 * DAY });

    await rig.scheduler.remind();
    const stamp = await lastReminderAt(requestId);
    await rig.scheduler.remind();
    await rig.scheduler.remind();

    expect(rig.email.send).toHaveBeenCalledTimes(1);
    expect((await lastReminderAt(requestId))!.getTime()).toBe(stamp!.getTime());
  });

  it("24 saat penceresi: 23 saat önce hatırlatılan atlanır, 25 saat sonra yeniden hatırlatılır", async () => {
    const rig = makeRig();
    const { requestId, approvers } = await pendingRequest(rig, {
      createdAgoMs: 6 * DAY,
    });

    await prisma.approvalRequest.update({
      where: { id: requestId },
      data: { lastReminderAt: ago(23 * HOUR) },
    });
    await rig.scheduler.remind();
    expect(rig.email.send).not.toHaveBeenCalled();

    const old = ago(25 * HOUR);
    await prisma.approvalRequest.update({
      where: { id: requestId },
      data: { lastReminderAt: old },
    });
    await rig.scheduler.remind();
    expect(recipients(rig)).toEqual([approvers[0]!.email]);
    expect((await lastReminderAt(requestId))!.getTime()).toBeGreaterThan(
      old.getTime(),
    );

    // Yeni damga pencereyi yeniden başlatır.
    await rig.scheduler.remind();
    expect(rig.email.send).toHaveBeenCalledTimes(1);
  });

  it("atomik sahiplenme: aynı anda koşan iki örnek TEK hatırlatma gönderir", async () => {
    const rig = makeRig();
    await pendingRequest(rig, { createdAgoMs: 5 * DAY });

    // İki çağrı da adayı okur (findMany'ler sahiplenmeden önce sıraya girer);
    // koşullu `updateMany`'yi yalnız biri kazanır.
    const counts = await Promise.all([
      rig.approvals.remindPending(),
      rig.approvals.remindPending(),
      rig.approvals.remindPending(),
    ]);

    expect(counts.reduce((a, b) => a + b, 0)).toBe(1);
    expect(rig.email.send).toHaveBeenCalledTimes(1);
  });

  it("okuma ile sahiplenme arasında sonuçlanan istek hatırlatılmaz (claim durumu yeniden okur)", async () => {
    const rig = makeRig();
    const { requestId } = await pendingRequest(rig, { createdAgoMs: 5 * DAY });

    // Aday listesi okunduktan SONRA istek iptal edilir.
    const bypass = (rig.approvals as unknown as { bypass: typeof prisma }).bypass;
    const realFindMany = bypass.approvalRequest.findMany.bind(
      bypass.approvalRequest,
    );
    const spy = jest
      .spyOn(bypass.approvalRequest, "findMany")
      .mockImplementationOnce((async (args: never) => {
        const rows = await realFindMany(args);
        await prisma.approvalRequest.update({
          where: { id: requestId },
          data: { status: "CANCELLED" },
        });
        return rows;
      }) as never);
    try {
      expect(await rig.approvals.remindPending()).toBe(0);
    } finally {
      spy.mockRestore();
    }
    expect(rig.email.send).not.toHaveBeenCalled();
    expect(await lastReminderAt(requestId)).toBeNull();
  });

  it("yalnız PENDING istek ve yalnız SIRASI GELEN adımın onaycısı hatırlatılır", async () => {
    const rig = makeRig();
    // İki adımlı zincir: 1. adım PENDING, 2. adım WAITING.
    const live = await pendingRequest(rig, {
      createdAgoMs: 4 * DAY,
      approverCount: 2,
    });
    // Sonuçlanmış (iptal) eski istek — hatırlatma almaz.
    const done = await pendingRequest(rig, { createdAgoMs: 10 * DAY });
    await prisma.approvalRequest.update({
      where: { id: done.requestId },
      data: { status: "CANCELLED" },
    });

    expect(await rig.approvals.remindPending()).toBe(1);

    expect(recipients(rig)).toEqual([live.approvers[0]!.email]);
    expect(await lastReminderAt(done.requestId)).toBeNull();
  });

  it("bildirimi kapatmış ya da pasifleşmiş onaycıya e-posta gitmez; açık olana gider", async () => {
    const rig = makeRig();
    const muted = await pendingRequest(rig, { createdAgoMs: 4 * DAY });
    await prisma.companyUser.update({
      where: { id: muted.approvers[0]!.id },
      data: { notificationPrefs: { approvalPending: false } },
    });
    const passive = await pendingRequest(rig, { createdAgoMs: 4 * DAY });
    await prisma.companyUser.update({
      where: { id: passive.approvers[0]!.id },
      data: { isActive: false },
    });
    const open = await pendingRequest(rig, { createdAgoMs: 4 * DAY });

    await rig.scheduler.remind();

    expect(recipients(rig)).toEqual([open.approvers[0]!.email]);
  });
});
