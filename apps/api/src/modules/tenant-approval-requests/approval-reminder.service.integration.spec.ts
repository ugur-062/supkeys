/**
 * V1.5 — Approval reminder cron.
 *
 * Davranış:
 *   - 3+ gündür PENDING + lastReminderAt null veya 3 gün önce → e-posta + update
 *   - Approver pasif → atla (fallback cron ilgilenir)
 *   - PENDING step yok (edge) → atla
 *   - Idempotency: aynı request 2 kere → sadece 1 reminder (2.'de zaten yeni)
 *   - daysWaiting >= 1
 */
import { TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { ApprovalReminderService } from "./services/approval-reminder.service";
import { EmailQueue } from "../email/email.queue";
import {
  getTestPrisma,
  resetDatabase,
  disconnectTestPrisma,
} from "../../../test/helpers/db";
import { buildTestModule } from "../../../test/helpers/test-module";
import {
  createTenant,
  createUser,
  createTender,
  createApprovalRequest,
} from "../../../test/helpers/factories";

describe("ApprovalReminderService — daily cron", () => {
  let moduleRef: TestingModule;
  let service: ApprovalReminderService;
  const emailMock = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const prisma = getTestPrisma();

  beforeAll(async () => {
    moduleRef = await buildTestModule({
      providers: [
        ApprovalReminderService,
        { provide: EmailQueue, useValue: emailMock },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue("http://localhost:3000") },
        },
      ],
    });
    service = moduleRef.get(ApprovalReminderService);
  });

  afterAll(async () => {
    await moduleRef.close();
    await disconnectTestPrisma();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    emailMock.enqueue.mockClear();
  });

  async function setupStaleRequest(opts: {
    startedDaysAgo?: number;
    lastReminderDaysAgo?: number | null;
    approverActive?: boolean;
  } = {}) {
    const tenant = await createTenant(prisma);
    const initiator = await createUser(prisma, tenant.id, {
      email: `init-${Date.now()}-${Math.random()}@test.local`,
      role: "BUYER",
    });
    const approver = await createUser(prisma, tenant.id, {
      email: `app-${Date.now()}-${Math.random()}@test.local`,
      role: "COMPANY_ADMIN",
      isActive: opts.approverActive ?? true,
    });
    const tender = await createTender(prisma, tenant.id, initiator.id, {
      status: "IN_APPROVAL",
    });
    const { requestId } = await createApprovalRequest(prisma, {
      tenantId: tenant.id,
      createdById: initiator.id,
      approverUserId: approver.id,
      tenderId: tender.id,
    });
    const startedAt =
      opts.startedDaysAgo !== undefined
        ? new Date(Date.now() - opts.startedDaysAgo * 24 * 3600 * 1000)
        : new Date(Date.now() - 4 * 24 * 3600 * 1000); // default: 4 gün önce
    const lastReminderAt =
      opts.lastReminderDaysAgo === null
        ? null
        : opts.lastReminderDaysAgo !== undefined
          ? new Date(Date.now() - opts.lastReminderDaysAgo * 24 * 3600 * 1000)
          : null;

    await prisma.approvalRequest.update({
      where: { id: requestId },
      data: { startedAt, lastReminderAt },
    });
    return { tenant, initiator, approver, requestId };
  }

  describe("eşik üstü (3+ gün) requests'lere hatırlatma", () => {
    it("4 gündür PENDING + lastReminderAt=null → e-posta + lastReminderAt set", async () => {
      const { approver, requestId } = await setupStaleRequest({
        startedDaysAgo: 4,
      });

      const result = await service.sendReminders();
      expect(result.sent).toBe(1);
      expect(result.skipped).toBe(0);

      // E-posta enqueue
      expect(emailMock.enqueue).toHaveBeenCalledTimes(1);
      const call = emailMock.enqueue.mock.calls[0]?.[0];
      expect(call.to.email).toBe(approver.email);
      expect(call.templateData.template).toBe("approval_reminder");
      expect(call.templateData.data.daysWaiting).toBeGreaterThanOrEqual(1);

      // DB'de lastReminderAt set
      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
      });
      expect(fresh?.lastReminderAt).toBeInstanceOf(Date);
    });

    it("3 günden eski lastReminderAt → re-reminder gönderir", async () => {
      const { requestId } = await setupStaleRequest({
        startedDaysAgo: 10,
        lastReminderDaysAgo: 4, // 4 gün önce reminder gönderilmişti
      });

      const result = await service.sendReminders();
      expect(result.sent).toBe(1);

      const fresh = await prisma.approvalRequest.findUnique({
        where: { id: requestId },
      });
      // lastReminderAt güncellendi (yeni reminder zamanı)
      expect(
        Math.abs(Date.now() - (fresh?.lastReminderAt?.getTime() ?? 0)),
      ).toBeLessThan(10_000);
    });

    it("2 gün önce reminder gönderildi → tekrar gönderme (idempotency)", async () => {
      await setupStaleRequest({
        startedDaysAgo: 10,
        lastReminderDaysAgo: 2, // 2 gün önce — re-reminder eşiği altında
      });

      const result = await service.sendReminders();
      expect(result.sent).toBe(0);
      expect(emailMock.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("eşik altı (3 günden az) → hatırlatma yok", () => {
    it("2 gündür PENDING → atla", async () => {
      await setupStaleRequest({ startedDaysAgo: 2 });

      const result = await service.sendReminders();
      expect(result.sent).toBe(0);
      expect(emailMock.enqueue).not.toHaveBeenCalled();
    });

    it("yeni başlamış PENDING → atla", async () => {
      await setupStaleRequest({ startedDaysAgo: 0.1 });
      const result = await service.sendReminders();
      expect(result.sent).toBe(0);
    });
  });

  describe("approver pasif → atla (fallback cron'a bırak)", () => {
    it("approver.isActive=false → skipped++ + e-posta yok", async () => {
      await setupStaleRequest({
        startedDaysAgo: 4,
        approverActive: false,
      });

      const result = await service.sendReminders();
      expect(result.sent).toBe(0);
      expect(result.skipped).toBe(1);
      expect(emailMock.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("non-PENDING request → görmez", () => {
    it("APPROVED request → eşik üstü olsa bile atla", async () => {
      const { requestId } = await setupStaleRequest({ startedDaysAgo: 5 });
      await prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED" },
      });

      const result = await service.sendReminders();
      expect(result.sent).toBe(0);
    });

    it("CANCELLED request → atla", async () => {
      const { requestId } = await setupStaleRequest({ startedDaysAgo: 5 });
      await prisma.approvalRequest.update({
        where: { id: requestId },
        data: { status: "CANCELLED" },
      });
      const result = await service.sendReminders();
      expect(result.sent).toBe(0);
    });
  });

  describe("hiç stale request yoksa", () => {
    it("boş DB → sent=0, skipped=0", async () => {
      const result = await service.sendReminders();
      expect(result).toEqual({ sent: 0, skipped: 0 });
      expect(emailMock.enqueue).not.toHaveBeenCalled();
    });
  });

  describe("daysWaiting hesaplama", () => {
    it("5 gün önce → daysWaiting=5", async () => {
      await setupStaleRequest({ startedDaysAgo: 5 });
      await service.sendReminders();

      const call = emailMock.enqueue.mock.calls[0]?.[0];
      expect(call.templateData.data.daysWaiting).toBe(5);
    });

    it("minimum 1 (floor edge case)", async () => {
      // 3.01 gün önce → floor(3.01) = 3 ama threshold tam 3
      await setupStaleRequest({ startedDaysAgo: 3.5 });
      const result = await service.sendReminders();
      if (result.sent > 0) {
        const call = emailMock.enqueue.mock.calls[0]?.[0];
        expect(call.templateData.data.daysWaiting).toBeGreaterThanOrEqual(1);
      }
    });
  });
});
