import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Prisma } from "@supkeys/db";
import type {
  ApprovalFlowType,
  ApprovalRequestStatus,
} from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { EmailService } from "../../email/email.service";
import { ListApprovalRequestsDto } from "../dto/list-approval-requests.dto";

/**
 * Onay onaylandıktan sonra Tender service'inin yapması gereken post-process'i
 * tetiklemek için kullanılan event isimleri (event-emitter dispatch).
 */
export const APPROVAL_EVENT = {
  PUBLISH_APPROVED: "tender.publish.approved",
  AWARD_APPROVED: "tender.award.approved",
} as const;

export interface ApprovalApprovedEvent {
  tenderId: string;
}

const REQUEST_INCLUDE = {
  flow: { select: { id: true, name: true, flowNumber: true, type: true } },
  tender: {
    select: {
      id: true,
      tenderNumber: true,
      title: true,
      status: true,
      primaryCurrency: true,
    },
  },
  initiatedBy: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  steps: {
    include: {
      approver: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          isActive: true,
        },
      },
    },
    orderBy: { orderIndex: "asc" as const },
  },
} as const;

@Injectable()
export class TenantApprovalRequestsService {
  private readonly logger = new Logger(TenantApprovalRequestsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ============================================================
  // MATCH + CREATE — tender service'den çağrılır (transaction içinde)
  // ============================================================

  /**
   * Aktif kural varsa ApprovalRequest oluşturur ve döndürür; aktif kural yoksa
   * (veya tüm adımlar SKIPPED'sa) `null` döner — caller direkt OPEN_FOR_BIDS /
   * AWARDED flow'una devam eder.
   */
  async findMatchAndCreate(
    tx: Prisma.TransactionClient,
    params: {
      tenantId: string;
      tenderId: string;
      type: ApprovalFlowType;
      amount: number;
      currency: string;
      initiatedById: string;
      initiatorNote?: string;
    },
  ) {
    const { tenantId, tenderId, type, amount, currency, initiatedById } =
      params;

    if (!Number.isFinite(amount) || amount <= 0) {
      this.logger.log(
        `Skipping approval match: amount ${amount} (non-positive). tender=${tenderId} type=${type}`,
      );
      return null;
    }

    // 1) Aktif akış ara — bu type için + initiator approved listede mi
    const flow = await tx.approvalFlow.findFirst({
      where: {
        tenantId,
        type,
        status: "ACTIVE",
        initiators: { some: { userId: initiatedById } },
      },
      include: { steps: { orderBy: { orderIndex: "asc" } } },
    });

    if (!flow) {
      this.logger.log(
        `No active approval flow for ${type}, initiator ${initiatedById}, tenant ${tenantId}. Skipping approval.`,
      );
      return null;
    }

    if (flow.steps.length === 0) {
      this.logger.warn(
        `Active flow ${flow.id} has no steps; skipping approval.`,
      );
      return null;
    }

    // 2) Adım planı + condition kontrolü
    type StepDraft = {
      flowStepId: string;
      approverUserId: string;
      orderIndex: number;
      conditionMinAmount: Prisma.Decimal | null;
      displayLabel: string | null;
      status: "WAITING" | "PENDING" | "SKIPPED";
    };

    const drafts: StepDraft[] = flow.steps.map((s) => {
      const min = s.conditionMinAmount?.toNumber() ?? 0;
      const skipped = min > 0 && amount < min;
      return {
        flowStepId: s.id,
        approverUserId: s.approverUserId,
        orderIndex: s.orderIndex,
        conditionMinAmount: s.conditionMinAmount ?? null,
        displayLabel: s.displayLabel ?? null,
        status: skipped ? "SKIPPED" : "WAITING",
      };
    });

    const firstActiveIdx = drafts.findIndex((d) => d.status !== "SKIPPED");
    if (firstActiveIdx === -1) {
      this.logger.log(
        `All steps SKIPPED (amount ${amount} below all thresholds). Skipping approval.`,
      );
      return null;
    }
    drafts[firstActiveIdx].status = "PENDING";

    // 3) APR-YYYY-NNNN üret
    const approvalNumber = await this.generateApprovalNumber(tx, tenantId);

    // 4) Request + Step'ler
    const request = await tx.approvalRequest.create({
      data: {
        approvalNumber,
        tenantId,
        flowId: flow.id,
        type,
        tenderId,
        status: "PENDING",
        amount: new Prisma.Decimal(amount),
        currency,
        initiatedById,
        initiatorNote: params.initiatorNote ?? null,
        steps: {
          create: drafts.map((d) => ({
            flowStepId: d.flowStepId,
            approverUserId: d.approverUserId,
            orderIndex: d.orderIndex,
            conditionMinAmount: d.conditionMinAmount,
            displayLabel: d.displayLabel,
            status: d.status,
          })),
        },
      },
      include: REQUEST_INCLUDE,
    });

    return request;
  }

  // ============================================================
  // EMAIL DISPATCH — public (tender service de PENDING geçişi sonrası kullanır)
  // ============================================================

  async sendApprovalRequiredEmailForRequest(requestId: string) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });
    if (!req) return;
    const pending = req.steps.find((s) => s.status === "PENDING");
    if (!pending) return;
    await this.dispatchApprovalRequiredEmail(req, pending);
  }

  // ============================================================
  // READ
  // ============================================================

  async list(
    tenantId: string,
    userId: string,
    filters: ListApprovalRequestsDto,
  ) {
    const where: Prisma.ApprovalRequestWhereInput = { tenantId };

    if (filters.status) where.status = filters.status as ApprovalRequestStatus;
    if (filters.type) where.type = filters.type as ApprovalFlowType;
    if (filters.initiatorUserId) where.initiatedById = filters.initiatorUserId;
    if (filters.tenderNumber) {
      where.tender = {
        tenderNumber: { contains: filters.tenderNumber, mode: "insensitive" },
      };
    }
    if (filters.approvalNumber) {
      where.approvalNumber = {
        contains: filters.approvalNumber,
        mode: "insensitive",
      };
    }
    // Polish-1 — generic search OR (approvalNumber + tender.tenderNumber + tender.title)
    if (filters.search?.trim()) {
      const term = filters.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { approvalNumber: { contains: term, mode: "insensitive" } },
            {
              tender: {
                OR: [
                  { tenderNumber: { contains: term, mode: "insensitive" } },
                  { title: { contains: term, mode: "insensitive" } },
                ],
              },
            },
          ],
        },
      ];
    }
    if (filters.pendingForMe === "true") {
      where.status = "PENDING";
      where.steps = {
        some: { approverUserId: userId, status: "PENDING" },
      };
    }

    return this.prisma.approvalRequest.findMany({
      where,
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async getOne(tenantId: string, id: string) {
    const request = await this.prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        flow: true,
        tender: {
          include: {
            items: {
              orderBy: { orderIndex: "asc" },
              take: 10,
              select: {
                id: true,
                orderIndex: true,
                name: true,
                quantity: true,
                unit: true,
                targetUnitPrice: true,
              },
            },
            invitations: {
              include: {
                supplier: { select: { id: true, companyName: true } },
              },
            },
            createdBy: {
              select: { id: true, firstName: true, lastName: true },
            },
            _count: { select: { items: true } },
          },
        },
        initiatedBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        steps: {
          include: {
            approver: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                isActive: true,
              },
            },
          },
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!request) throw new NotFoundException("Onay süreci bulunamadı");
    if (request.tenantId !== tenantId)
      throw new ForbiddenException("Bu onay sürecine erişim yetkiniz yok");

    return request;
  }

  async getPendingCount(
    tenantId: string,
    userId: string,
  ): Promise<{ count: number }> {
    const count = await this.prisma.approvalRequest.count({
      where: {
        tenantId,
        status: "PENDING",
        steps: {
          some: { approverUserId: userId, status: "PENDING" },
        },
      },
    });
    return { count };
  }

  // ============================================================
  // APPROVE / REJECT / CANCEL
  // ============================================================

  async approve(
    tenantId: string,
    requestId: string,
    userId: string,
    note?: string,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: { steps: { orderBy: { orderIndex: "asc" } } },
      });

      if (!request) throw new NotFoundException("Onay süreci bulunamadı");
      if (request.tenantId !== tenantId)
        throw new ForbiddenException("Bu onay sürecine erişim yetkiniz yok");
      if (request.status !== "PENDING") {
        throw new ConflictException("Bu onay süreci aktif değil");
      }

      const pending = request.steps.find(
        (s) => s.status === "PENDING" && s.approverUserId === userId,
      );
      if (!pending) {
        throw new ForbiddenException("Bu adımda onaylama yetkiniz yok");
      }

      await tx.approvalRequestStep.update({
        where: { id: pending.id },
        data: {
          status: "APPROVED",
          decidedAt: new Date(),
          decisionNote: note?.trim() || null,
        },
      });

      // Sıradaki SKIPPED olmayan adım
      const nextStep = request.steps
        .filter(
          (s) =>
            s.orderIndex > pending.orderIndex &&
            s.status !== "SKIPPED" &&
            s.status === "WAITING",
        )
        .sort((a, b) => a.orderIndex - b.orderIndex)[0];

      if (nextStep) {
        await tx.approvalRequestStep.update({
          where: { id: nextStep.id },
          data: { status: "PENDING" },
        });
        return {
          status: "STEP_APPROVED" as const,
          requestId: request.id,
          nextStepId: nextStep.id,
          tenderId: request.tenderId,
          type: request.type,
        };
      }

      // Tüm adımlar tamamlandı — request APPROVED + tender'ı ileri taşı
      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { status: "APPROVED", completedAt: new Date() },
      });

      await this.advanceTenderAfterApproval(tx, {
        tenderId: request.tenderId,
        type: request.type,
      });

      return {
        status: "REQUEST_APPROVED" as const,
        requestId: request.id,
        tenderId: request.tenderId,
        type: request.type,
      };
    });

    // Post-commit: e-postalar + tender post-process event'i
    if (result.status === "STEP_APPROVED" && result.nextStepId) {
      setImmediate(() =>
        this.sendApprovalRequiredEmailForRequest(result.requestId).catch(
          (e) =>
            this.logger.error(
              `approval_required dispatch failed: ${
                e instanceof Error ? e.message : String(e)
              }`,
            ),
        ),
      );
    } else if (result.status === "REQUEST_APPROVED") {
      setImmediate(() =>
        this.sendApprovalApprovedEmailForRequest(result.requestId).catch(
          (e) =>
            this.logger.error(
              `approval_approved dispatch failed: ${
                e instanceof Error ? e.message : String(e)
              }`,
            ),
        ),
      );

      // Tender publish/award post-processing event'i
      const eventName =
        result.type === "TENDER_PUBLISH"
          ? APPROVAL_EVENT.PUBLISH_APPROVED
          : APPROVAL_EVENT.AWARD_APPROVED;
      setImmediate(() => {
        this.eventEmitter.emit(eventName, {
          tenderId: result.tenderId,
        } as ApprovalApprovedEvent);
      });
    }

    return result;
  }

  async reject(
    tenantId: string,
    requestId: string,
    userId: string,
    note?: string,
  ) {
    const trimmed = (note ?? "").trim();
    if (trimmed.length < 10) {
      throw new BadRequestException(
        "Reddetme nedeni en az 10 karakter olmalıdır",
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({
        where: { id: requestId },
        include: { steps: true },
      });
      if (!request) throw new NotFoundException("Onay süreci bulunamadı");
      if (request.tenantId !== tenantId)
        throw new ForbiddenException("Bu onay sürecine erişim yetkiniz yok");
      if (request.status !== "PENDING") {
        throw new ConflictException("Bu onay süreci aktif değil");
      }

      const pending = request.steps.find(
        (s) => s.status === "PENDING" && s.approverUserId === userId,
      );
      if (!pending) {
        throw new ForbiddenException("Bu adımda reddetme yetkiniz yok");
      }

      await tx.approvalRequestStep.update({
        where: { id: pending.id },
        data: {
          status: "REJECTED",
          decidedAt: new Date(),
          decisionNote: trimmed,
        },
      });

      await tx.approvalRequest.update({
        where: { id: requestId },
        data: { status: "REJECTED", completedAt: new Date() },
      });

      await this.revertTenderAfterRejection(tx, {
        tenderId: request.tenderId,
        type: request.type,
      });

      return {
        status: "REQUEST_REJECTED" as const,
        requestId: request.id,
        rejectedStepId: pending.id,
      };
    });

    setImmediate(() =>
      this.sendApprovalRejectedEmailForRequest(
        result.requestId,
        result.rejectedStepId,
      ).catch((e) =>
        this.logger.error(
          `approval_rejected dispatch failed: ${
            e instanceof Error ? e.message : String(e)
          }`,
        ),
      ),
    );

    return result;
  }

  async cancel(
    tenantId: string,
    requestId: string,
    userId: string,
    userRole: string,
    reason?: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const request = await tx.approvalRequest.findUnique({
        where: { id: requestId },
      });
      if (!request) throw new NotFoundException("Onay süreci bulunamadı");
      if (request.tenantId !== tenantId)
        throw new ForbiddenException("Bu onay sürecine erişim yetkiniz yok");

      // V1: sadece initiator veya COMPANY_ADMIN iptal edebilir
      if (
        request.initiatedById !== userId &&
        userRole !== "COMPANY_ADMIN"
      ) {
        throw new ForbiddenException(
          "Bu onayı sadece başlatan veya Yönetici iptal edebilir",
        );
      }

      if (request.status !== "PENDING") {
        throw new ConflictException("Bu onay süreci aktif değil");
      }

      await tx.approvalRequest.update({
        where: { id: requestId },
        data: {
          status: "CANCELLED",
          completedAt: new Date(),
          initiatorNote: reason?.trim()
            ? `${request.initiatorNote ? `${request.initiatorNote}\n\n` : ""}İptal sebebi: ${reason.trim()}`
            : request.initiatorNote,
        },
      });

      await this.revertTenderAfterRejection(tx, {
        tenderId: request.tenderId,
        type: request.type,
      });

      return {
        status: "CANCELLED" as const,
        requestId,
        tenderId: request.tenderId,
      };
    });
  }

  // ============================================================
  // TENDER STATE TRANSITIONS (transaction içinde — caller commit eder)
  // ============================================================

  private async advanceTenderAfterApproval(
    tx: Prisma.TransactionClient,
    payload: { tenderId: string; type: ApprovalFlowType },
  ) {
    if (payload.type === "TENDER_PUBLISH") {
      await tx.tender.update({
        where: { id: payload.tenderId },
        data: {
          status: "OPEN_FOR_BIDS",
          publishedAt: new Date(),
          // bidsOpenAt dokunulmaz — DRAFT'ta set edilmediyse null kalmasın
          // diye event handler'da gerekirse fallback yapılabilir.
        },
      });
    } else if (payload.type === "TENDER_AWARD") {
      // Tender state'i AWARDED'a geçişi event handler içinde, finalize akışıyla
      // birlikte yapılır (Order create transaction'ı). Burada IN_AWARD'da bırak;
      // event listener finalize'ı çalıştırınca AWARDED olur.
    }
  }

  private async revertTenderAfterRejection(
    tx: Prisma.TransactionClient,
    payload: { tenderId: string; type: ApprovalFlowType },
  ) {
    if (payload.type === "TENDER_PUBLISH") {
      await tx.tender.update({
        where: { id: payload.tenderId },
        data: { status: "DRAFT" },
      });
    } else if (payload.type === "TENDER_AWARD") {
      await tx.tender.update({
        where: { id: payload.tenderId },
        data: { status: "IN_AWARD" },
      });
    }
  }

  // ============================================================
  // EMAIL DISPATCHERS
  // ============================================================

  private webUrl(): string {
    return (this.config.get<string>("WEB_URL") ?? "http://localhost:3000")
      .replace(/\/$/, "");
  }

  private async dispatchApprovalRequiredEmail(
    request: {
      id: string;
      approvalNumber: string;
      type: ApprovalFlowType;
      amount: Prisma.Decimal;
      currency: string;
      initiatorNote: string | null;
      flow: { name: string };
      tender: { tenderNumber: string; title: string };
      initiatedBy: { firstName: string; lastName: string };
    },
    step: {
      id: string;
      approver: {
        email: string;
        firstName: string;
        lastName: string;
        isActive: boolean;
      };
    },
    fallbackInfo?: { originalApproverName: string },
  ) {
    if (!step.approver.isActive) {
      this.logger.warn(
        `Skipping approval_required email — approver ${step.approver.email} pasif. step=${step.id}`,
      );
      return;
    }
    try {
      await this.emailService.send({
        to: {
          email: step.approver.email,
          name: `${step.approver.firstName} ${step.approver.lastName}`,
        },
        templateData: {
          template: "approval_required",
          data: {
            approverFirstName: step.approver.firstName,
            approvalNumber: request.approvalNumber,
            tenderNumber: request.tender.tenderNumber,
            tenderTitle: request.tender.title,
            initiatorName: `${request.initiatedBy.firstName} ${request.initiatedBy.lastName}`,
            flowName: request.flow.name,
            amount: Number(request.amount),
            currency: request.currency,
            approvalType: request.type,
            approvalUrl: `${this.webUrl()}/dashboard/onay-bekleyenler/${request.id}`,
            initiatorNote: request.initiatorNote,
            isFallback: fallbackInfo ? true : undefined,
            originalApproverName: fallbackInfo?.originalApproverName,
          },
        },
        context: { type: "approval_request_step", id: step.id },
        subject: fallbackInfo
          ? `🔔 [Otomatik Atama] Onayınız bekleniyor: ${request.tender.title} — Supkeys`
          : `🔔 Onayınız bekleniyor: ${request.tender.title} — Supkeys`,
      });
    } catch (err) {
      this.logger.error(
        `approval_required enqueue failed step=${step.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async sendApprovalApprovedEmailForRequest(requestId: string) {
    // Bug fix #759 — findFirst kullan (findUnique relation required olarak
    // belirtiyor; initiator user silinmişse "Inconsistent query result"
    // fırlatır). findFirst aynı sonucu döner ama relation null olabilir
    // varsayar. Ayrıca initiatedBy varlığını defansif kontrol et — production
    // RESTRICT FK ile silinemez ama test/race senaryolarında null gelebilir.
    const req = await this.prisma.approvalRequest.findFirst({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });
    if (!req || !req.initiatedBy) return;

    const approvedSteps = req.steps.filter((s) => s.status === "APPROVED");
    const lastApprover = approvedSteps[approvedSteps.length - 1]?.approver;

    try {
      await this.emailService.send({
        to: {
          email: req.initiatedBy.email,
          name: `${req.initiatedBy.firstName} ${req.initiatedBy.lastName}`,
        },
        templateData: {
          template: "approval_approved",
          data: {
            initiatorFirstName: req.initiatedBy.firstName,
            approvalNumber: req.approvalNumber,
            tenderNumber: req.tender.tenderNumber,
            tenderTitle: req.tender.title,
            flowName: req.flow.name,
            approvalType: req.type,
            approverCount: approvedSteps.length,
            lastApproverName: lastApprover
              ? `${lastApprover.firstName} ${lastApprover.lastName}`
              : "Belirsiz",
            tenderUrl: `${this.webUrl()}/dashboard/ihaleler/${req.tender.id}`,
          },
        },
        context: { type: "approval_request", id: req.id },
        subject: `✅ Onayınız tamamlandı: ${req.tender.title} — Supkeys`,
      });
    } catch (err) {
      this.logger.error(
        `approval_approved enqueue failed request=${req.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async sendApprovalRejectedEmailForRequest(
    requestId: string,
    rejectedStepId: string,
  ) {
    // Bug fix #759 — findFirst + null check (yukarıdaki yorum)
    const req = await this.prisma.approvalRequest.findFirst({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });
    if (!req || !req.initiatedBy) return;
    const rejectedStep = req.steps.find((s) => s.id === rejectedStepId);
    if (!rejectedStep || !rejectedStep.approver) return;

    try {
      await this.emailService.send({
        to: {
          email: req.initiatedBy.email,
          name: `${req.initiatedBy.firstName} ${req.initiatedBy.lastName}`,
        },
        templateData: {
          template: "approval_rejected",
          data: {
            initiatorFirstName: req.initiatedBy.firstName,
            approvalNumber: req.approvalNumber,
            tenderNumber: req.tender.tenderNumber,
            tenderTitle: req.tender.title,
            flowName: req.flow.name,
            approvalType: req.type,
            rejectorName: `${rejectedStep.approver.firstName} ${rejectedStep.approver.lastName}`,
            rejectionNote:
              rejectedStep.decisionNote || "Sebep belirtilmemiş",
            tenderUrl: `${this.webUrl()}/dashboard/ihaleler/${req.tender.id}`,
          },
        },
        context: { type: "approval_request", id: req.id },
        subject: `❌ Onay süreciniz reddedildi: ${req.tender.title} — Supkeys`,
      });
    } catch (err) {
      this.logger.error(
        `approval_rejected enqueue failed request=${req.id}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ============================================================
  // UTIL
  // ============================================================

  private async generateApprovalNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const last = await tx.approvalRequest.findFirst({
      where: {
        tenantId,
        approvalNumber: { startsWith: `APR-${year}-` },
      },
      orderBy: { createdAt: "desc" },
      select: { approvalNumber: true },
    });

    let nextSeq = 1;
    if (last) {
      const parts = last.approvalNumber.split("-");
      const seq = parseInt(parts[2] ?? "0", 10);
      if (Number.isFinite(seq) && seq > 0) nextSeq = seq + 1;
    }

    return `APR-${year}-${String(nextSeq).padStart(4, "0")}`;
  }

  // ============================================================
  // V1.5 — Inactive approver fallback cron
  // ============================================================

  /**
   * Her dakika çalışır. PENDING request'lerde PENDING step'i olup approver'ı
   * pasif olan adımları bulur ve her birini ilgili tenant'taki ilk aktif
   * COMPANY_ADMIN'e yeniden atar. Yeni approver'a `approval_required`
   * e-postası `isFallback: true` ile gider.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async fallbackInactiveApprovers(): Promise<void> {
    const inactiveSteps = await this.prisma.approvalRequestStep.findMany({
      where: {
        status: "PENDING",
        approver: { isActive: false },
        request: { status: "PENDING" },
      },
      include: {
        approver: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        request: {
          include: {
            tender: {
              select: {
                id: true,
                tenantId: true,
                tenderNumber: true,
                title: true,
              },
            },
            flow: { select: { name: true } },
            initiatedBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
      take: 50,
    });

    if (inactiveSteps.length === 0) return;

    this.logger.log(
      `fallbackInactiveApprovers: ${inactiveSteps.length} adım pasif approver içeriyor, fallback uygulanıyor`,
    );

    for (const step of inactiveSteps) {
      try {
        await this.applyApproverFallback(step);
      } catch (err) {
        this.logger.error(
          `applyApproverFallback failed for step ${step.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  private async applyApproverFallback(step: {
    id: string;
    approverUserId: string;
    approver: { firstName: string; lastName: string; email: string };
    request: {
      id: string;
      approvalNumber: string;
      type: ApprovalFlowType;
      amount: Prisma.Decimal;
      currency: string;
      initiatorNote: string | null;
      tender: { tenantId: string; tenderNumber: string; title: string };
      flow: { name: string };
      initiatedBy: { firstName: string; lastName: string };
    };
  }): Promise<void> {
    const tenantId = step.request.tender.tenantId;
    const oldApproverName = `${step.approver.firstName} ${step.approver.lastName}`;

    // Bu tenant'taki ilk ACTIVE COMPANY_ADMIN (pasif approver hariç)
    const fallbackAdmin = await this.prisma.user.findFirst({
      where: {
        tenantId,
        role: "COMPANY_ADMIN",
        isActive: true,
        id: { not: step.approverUserId },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, firstName: true, lastName: true },
    });

    if (!fallbackAdmin) {
      this.logger.error(
        `No active COMPANY_ADMIN for fallback in tenant ${tenantId}, step ${step.id}, request ${step.request.approvalNumber}. Skipping.`,
      );
      return;
    }

    // Idempotency: aynı admin'e zaten atanmışsa atla
    if (fallbackAdmin.id === step.approverUserId) {
      return;
    }

    await this.prisma.approvalRequestStep.update({
      where: { id: step.id },
      data: { approverUserId: fallbackAdmin.id },
    });

    this.logger.log(
      `Fallback applied: step ${step.id} (${step.request.approvalNumber}) reassigned from ${oldApproverName} to admin ${fallbackAdmin.email}`,
    );

    // Yeni approver'a fallback flag'li e-posta
    await this.dispatchApprovalRequiredEmail(
      {
        id: step.request.id,
        approvalNumber: step.request.approvalNumber,
        type: step.request.type,
        amount: step.request.amount,
        currency: step.request.currency,
        initiatorNote: step.request.initiatorNote,
        flow: step.request.flow,
        tender: {
          tenderNumber: step.request.tender.tenderNumber,
          title: step.request.tender.title,
        },
        initiatedBy: step.request.initiatedBy,
      },
      {
        id: step.id,
        approver: {
          email: fallbackAdmin.email,
          firstName: fallbackAdmin.firstName,
          lastName: fallbackAdmin.lastName,
          isActive: true,
        },
      },
      { originalApproverName: oldApproverName },
    );
  }
}
