import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CompanyRole, Prisma } from "@supkeys/db";
import { isNotificationEnabled } from "../../common/notifications/notification-prefs";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { EmailService } from "../email/email.service";
import { NotificationService } from "../notifications/notification.service";
import {
  CreateApprovalFlowDto,
  DecideApprovalDto,
  UpdateApprovalFlowStatusDto,
} from "./dto/approval.dto";

type ApprovalType = "LISTING_PUBLISH" | "LISTING_AWARD";

/** type → event-bus kök adı. */
function eventBase(type: ApprovalType): string {
  return type === "LISTING_PUBLISH" ? "listing.publish" : "listing.award";
}

@Injectable()
export class CompanyApprovalsService {
  private readonly logger = new Logger(CompanyApprovalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventEmitter2,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
  ) {}

  /** Sırası gelen onaycıya "onayınız bekleniyor" bildirimi (fire-and-forget). */
  private async notifyApprover(
    approverUserId: string,
    listingId: string,
    daysWaiting?: number,
  ) {
    const [approver, listing] = await Promise.all([
      this.prisma.companyUser.findUnique({
        where: { id: approverUserId },
        select: {
          email: true,
          firstName: true,
          lastName: true,
          notificationPrefs: true,
        },
      }),
      this.prisma.listing.findUnique({
        where: { id: listingId },
        select: { title: true, number: true },
      }),
    ]);
    if (!approver) return;
    // Kullanıcı bu bildirimi kapattıysa gönderme (tek kaynak tercih helper'ı).
    const prefs = approver.notificationPrefs as Record<string, boolean> | null;
    if (!isNotificationEnabled(prefs, "approval_pending")) return;
    const webUrl =
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
    // In-app kanal — onaycı kullanıcısına.
    await this.notifications.pushToUser(approverUserId, {
      type: "approval_pending",
      title: "Onayınız bekleniyor",
      body: `"${listing?.title ?? "İhale"}" (${listing?.number ?? "—"}) için onay sırası sizde. Lütfen Onaylar sayfasından inceleyip karar verin.`,
      ctaLabel: "Onaylar Sayfası",
      ctaUrl: `${webUrl}/company/onaylar`,
      listingId,
    });
    void this.email
      .send({
        to: {
          email: approver.email,
          name: `${approver.firstName} ${approver.lastName}`,
        },
        subject: "Onayınız bekleniyor",
        templateData: {
          template: "notification",
          data: {
            subject: "Onayınız bekleniyor",
            heading: "Onayınız bekleniyor",
            paragraphs: [
              "Merhaba,",
              `"${listing?.title ?? "İhale"}" (${listing?.number ?? "—"}) için onay sırası sizde. Lütfen Onaylar sayfasından inceleyip karar verin.`,
              ...(daysWaiting && daysWaiting > 0
                ? [`Bu onay ${daysWaiting} gündür bekliyor.`]
                : []),
            ],
            ctaLabel: "Onaylar Sayfası",
            ctaUrl: `${webUrl}/company/onaylar`,
          },
        },
        context: { type: "approval_pending", id: listingId },
      })
      .catch((err) =>
        this.logger.error(
          `Onay bildirimi gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  // ─────────────────────────── Akış CRUD (Ayarlar) ───────────────────────────

  /** Akış girdisi doğrulama: bütçe eşiği monoton artan + başlatıcı rol kısıtı. */
  private validateFlowInput(dto: CreateApprovalFlowDto) {
    if ((dto.initiatorRoles ?? []).includes("ONAYLAYICI" as never)) {
      throw new BadRequestException(
        "Onaylayıcı rolü onay akışını başlatamaz",
      );
    }
    let prev = -1;
    for (const s of dto.steps) {
      const min = s.conditionMinAmount ?? 0;
      if (min < prev) {
        throw new BadRequestException(
          "Adım bütçe eşikleri artan sırada olmalı (her adım öncekinden büyük/eşit)",
        );
      }
      prev = min;
    }
  }

  async listFlows(companyId: string) {
    const flows = await this.prisma.approvalFlow.findMany({
      where: { companyId },
      include: { steps: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "desc" },
    });
    // Onaycı adlarını çöz.
    const userIds = [
      ...new Set(flows.flatMap((f) => f.steps.map((s) => s.approverUserId))),
    ];
    const users = await this.prisma.companyUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );
    return flows.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.type,
      listingType: f.listingType,
      status: f.status,
      initiatorRoles: f.initiatorRoles,
      steps: f.steps.map((s) => ({
        order: s.order,
        approverUserId: s.approverUserId,
        approverName: nameById.get(s.approverUserId) ?? "—",
        conditionMinAmount: s.conditionMinAmount
          ? Number(s.conditionMinAmount)
          : null,
      })),
      createdAt: f.createdAt,
    }));
  }

  async createFlow(user: AuthenticatedCompanyUser, dto: CreateApprovalFlowDto) {
    this.validateFlowInput(dto);
    await this.assertApproversValid(user.companyId, dto.steps.map((s) => s.approverUserId));
    const flow = await this.prisma.approvalFlow.create({
      data: {
        companyId: user.companyId,
        name: dto.name.trim(),
        type: dto.type,
        listingType: dto.listingType ?? null,
        initiatorRoles: (dto.initiatorRoles ?? []) as CompanyRole[],
        status: "DRAFT",
        createdById: user.userId,
        steps: {
          create: dto.steps.map((s, i) => ({
            order: i + 1,
            approverUserId: s.approverUserId,
            conditionMinAmount: s.conditionMinAmount ?? null,
          })),
        },
      },
    });
    return { id: flow.id };
  }

  async updateFlow(
    user: AuthenticatedCompanyUser,
    flowId: string,
    dto: CreateApprovalFlowDto,
  ) {
    await this.requireOwnFlow(user.companyId, flowId);
    this.validateFlowInput(dto);
    await this.assertApproversValid(user.companyId, dto.steps.map((s) => s.approverUserId));
    await this.prisma.$transaction(async (tx) => {
      await tx.approvalFlowStep.deleteMany({ where: { flowId } });
      await tx.approvalFlow.update({
        where: { id: flowId },
        data: {
          name: dto.name.trim(),
          type: dto.type,
          listingType: dto.listingType ?? null,
          initiatorRoles: (dto.initiatorRoles ?? []) as CompanyRole[],
          steps: {
            create: dto.steps.map((s, i) => ({
              order: i + 1,
              approverUserId: s.approverUserId,
              conditionMinAmount: s.conditionMinAmount ?? null,
            })),
          },
        },
      });
    });
    return { ok: true };
  }

  async setStatus(
    user: AuthenticatedCompanyUser,
    flowId: string,
    dto: UpdateApprovalFlowStatusDto,
  ) {
    const current = await this.requireOwnFlow(user.companyId, flowId);
    if (dto.status === "ACTIVE") {
      // Tek aktif kural: aynı tip + örtüşen ilan tipindeki diğer aktif akışları
      // pasifleştir (null ilan tipi her ikisiyle örtüşür).
      await this.prisma.$transaction(async (tx) => {
        await tx.approvalFlow.updateMany({
          where: {
            companyId: user.companyId,
            type: current.type,
            status: "ACTIVE",
            id: { not: flowId },
            OR:
              current.listingType == null
                ? undefined
                : [{ listingType: null }, { listingType: current.listingType }],
          },
          data: { status: "PASSIVE" },
        });
        await tx.approvalFlow.update({
          where: { id: flowId },
          data: { status: "ACTIVE" },
        });
      });
    } else {
      await this.prisma.approvalFlow.update({
        where: { id: flowId },
        data: { status: dto.status },
      });
    }
    return { ok: true };
  }

  async deleteFlow(user: AuthenticatedCompanyUser, flowId: string) {
    await this.requireOwnFlow(user.companyId, flowId);
    await this.prisma.approvalFlow.delete({ where: { id: flowId } });
    return { ok: true };
  }

  /** Akışı DRAFT kopya olarak çoğaltır (adımlarıyla birlikte). */
  async duplicateFlow(user: AuthenticatedCompanyUser, flowId: string) {
    await this.requireOwnFlow(user.companyId, flowId);
    const src = await this.prisma.approvalFlow.findUnique({
      where: { id: flowId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!src) throw new NotFoundException("Onay akışı bulunamadı");
    const copy = await this.prisma.approvalFlow.create({
      data: {
        companyId: user.companyId,
        name: `${src.name} (kopya)`,
        type: src.type,
        listingType: src.listingType,
        initiatorRoles: src.initiatorRoles,
        status: "DRAFT",
        createdById: user.userId,
        steps: {
          create: src.steps.map((s) => ({
            order: s.order,
            approverUserId: s.approverUserId,
            conditionMinAmount: s.conditionMinAmount,
          })),
        },
      },
    });
    return { id: copy.id };
  }

  // ─────────────────────────── Çalışma anı motoru ────────────────────────────

  /**
   * Eşleşen aktif akışı bul ve onay isteği oluştur. Akış yoksa veya tüm adımlar
   * bütçe eşiği nedeniyle atlanırsa `{ approved: true }` döner (caller doğrudan
   * ilerler). Aksi halde istek oluşturulur, ilk aktif adım PENDING olur.
   */
  async requestApproval(
    user: AuthenticatedCompanyUser,
    input: {
      listingId: string;
      type: ApprovalType;
      listingType: "ALIM" | "SATIS";
      amount: number;
      currency: string;
      payload?: Prisma.InputJsonValue;
    },
  ): Promise<{ approved: true } | { approved: false; requestId: string }> {
    const flow = await this.prisma.approvalFlow.findFirst({
      where: {
        companyId: user.companyId,
        type: input.type,
        status: "ACTIVE",
        AND: [
          // İlan tipi: akış belirli tipe bağlıysa eşleşmeli; null = her ikisi.
          { OR: [{ listingType: null }, { listingType: input.listingType }] },
          // Başlatıcı rol: boşsa kısıt yok; doluysa kullanıcının rollerinden biri.
          {
            OR: [
              { initiatorRoles: { isEmpty: true } },
              { initiatorRoles: { hasSome: user.roles } },
            ],
          },
        ],
      },
      include: { steps: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
    if (!flow || flow.steps.length === 0) return { approved: true };

    const drafts = flow.steps.map((s) => {
      const min = s.conditionMinAmount ? Number(s.conditionMinAmount) : 0;
      const skipped = input.amount < min;
      return {
        order: s.order,
        approverUserId: s.approverUserId,
        status: (skipped ? "SKIPPED" : "WAITING") as
          | "SKIPPED"
          | "WAITING"
          | "PENDING",
      };
    });
    const firstActive = drafts.findIndex((d) => d.status !== "SKIPPED");
    if (firstActive === -1) return { approved: true }; // hepsi atlandı
    drafts[firstActive]!.status = "PENDING";

    const req = await this.prisma.approvalRequest.create({
      data: {
        companyId: user.companyId,
        listingId: input.listingId,
        type: input.type,
        status: "PENDING",
        amount: input.amount,
        currency: input.currency as never,
        payload: input.payload ?? Prisma.JsonNull,
        createdById: user.userId,
        steps: { create: drafts },
      },
    });
    // İlk aktif adımın onaycısına bildir.
    const firstApprover = drafts[firstActive]!.approverUserId;
    void this.notifyApprover(firstApprover, input.listingId);
    return { approved: false, requestId: req.id };
  }

  /** Bekleyen istek üzerinde onaycı kararı (onayla/reddet). */
  async decide(
    user: AuthenticatedCompanyUser,
    requestId: string,
    action: "approve" | "reject",
    dto: DecideApprovalDto,
  ) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!req || req.companyId !== user.companyId) {
      throw new NotFoundException("Onay isteği bulunamadı");
    }
    if (req.status !== "PENDING") {
      throw new BadRequestException("Bu istek beklemede değil");
    }
    const step = req.steps.find((s) => s.status === "PENDING");
    if (!step || step.approverUserId !== user.userId) {
      throw new ForbiddenException("Bu adımın onaycısı değilsiniz");
    }

    if (action === "reject") {
      await this.prisma.$transaction([
        this.prisma.approvalRequestStep.update({
          where: { id: step.id },
          data: { status: "REJECTED", note: dto.note, decidedAt: new Date() },
        }),
        this.prisma.approvalRequest.update({
          where: { id: req.id },
          data: { status: "REJECTED", decidedAt: new Date() },
        }),
      ]);
      this.events.emit(`${eventBase(req.type as ApprovalType)}.rejected`, {
        requestId: req.id,
        listingId: req.listingId,
        payload: req.payload,
      });
      return { ok: true, status: "REJECTED" as const };
    }

    await this.prisma.approvalRequestStep.update({
      where: { id: step.id },
      data: { status: "APPROVED", note: dto.note, decidedAt: new Date() },
    });
    const next = req.steps.find(
      (s) => s.order > step.order && s.status === "WAITING",
    );
    if (next) {
      await this.prisma.approvalRequestStep.update({
        where: { id: next.id },
        data: { status: "PENDING" },
      });
      void this.notifyApprover(next.approverUserId, req.listingId);
      return { ok: true, status: "STEP_APPROVED" as const };
    }
    await this.prisma.approvalRequest.update({
      where: { id: req.id },
      data: { status: "APPROVED", decidedAt: new Date() },
    });
    this.events.emit(`${eventBase(req.type as ApprovalType)}.approved`, {
      requestId: req.id,
      listingId: req.listingId,
      payload: req.payload,
    });
    return { ok: true, status: "APPROVED" as const };
  }

  /**
   * Bekleyen onay isteğini iptal et — yalnızca isteği başlatan veya firma
   * sahibi. İlan eski durumuna döner (yayın→DRAFT, kazandırma→CLOSED).
   */
  async cancelRequest(user: AuthenticatedCompanyUser, requestId: string) {
    const req = await this.prisma.approvalRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        companyId: true,
        listingId: true,
        type: true,
        status: true,
        createdById: true,
      },
    });
    if (!req || req.companyId !== user.companyId) {
      throw new NotFoundException("Onay isteği bulunamadı");
    }
    if (req.createdById !== user.userId && !user.isOwner) {
      throw new ForbiddenException("Bu isteği yalnızca başlatan iptal edebilir");
    }
    if (req.status !== "PENDING") {
      throw new BadRequestException("Yalnızca bekleyen istek iptal edilebilir");
    }
    await this.prisma.$transaction([
      this.prisma.approvalRequest.update({
        where: { id: req.id },
        data: { status: "CANCELLED", decidedAt: new Date() },
      }),
      this.prisma.listing.update({
        where: { id: req.listingId },
        data: {
          status: req.type === "LISTING_PUBLISH" ? "DRAFT" : "CLOSED",
        },
      }),
    ]);
    return { ok: true };
  }

  /** Bekleyen istek var mı — ilan için (detayda 'İptal Et' için). */
  async pendingForListing(companyId: string, listingId: string) {
    const req = await this.prisma.approvalRequest.findFirst({
      where: { companyId, listingId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    return req?.id ?? null;
  }

  /** Günlük hatırlatma — bekleyen onayların sırası gelen onaycısına e-posta. */
  async remindPending() {
    // Eski sistemle aynı: yalnızca 3 günden uzun bekleyen istekler + günde-bir-kez.
    const REMINDER_THRESHOLD_DAYS = 3;
    const now = Date.now();
    const olderThan = new Date(now - REMINDER_THRESHOLD_DAYS * 86_400_000);
    const dedupAfter = new Date(now - 86_400_000); // son 24 saatte hatırlatıldıysa atla

    const reqs = await this.prisma.approvalRequest.findMany({
      where: {
        status: "PENDING",
        createdAt: { lt: olderThan },
        OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: dedupAfter } }],
      },
      select: {
        id: true,
        listingId: true,
        createdAt: true,
        steps: {
          where: { status: "PENDING" },
          select: { approverUserId: true },
          take: 1,
        },
      },
    });
    let sent = 0;
    for (const r of reqs) {
      const approverId = r.steps[0]?.approverUserId;
      if (!approverId) continue;
      const daysWaiting = Math.floor(
        (now - r.createdAt.getTime()) / 86_400_000,
      );
      await this.notifyApprover(approverId, r.listingId, daysWaiting);
      await this.prisma.approvalRequest.update({
        where: { id: r.id },
        data: { lastReminderAt: new Date() },
      });
      sent++;
    }
    return sent;
  }

  /**
   * Pasif onaycı fallback (eski sistemle aynı): PENDING isteklerin bekleyen
   * adımında onaycı pasif/silinmişse, aynı firmadaki ilk aktif YONETICI'ye
   * yeniden atar ve yeni onaycıya bildirim gönderir. Onay zinciri tıkanmaz.
   */
  async fallbackInactiveApprovers(): Promise<number> {
    const steps = await this.prisma.approvalRequestStep.findMany({
      where: { status: "PENDING", request: { status: "PENDING" } },
      select: {
        id: true,
        approverUserId: true,
        request: { select: { companyId: true, listingId: true } },
      },
      take: 100,
    });
    if (steps.length === 0) return 0;

    const approverIds = [...new Set(steps.map((s) => s.approverUserId))];
    const approvers = await this.prisma.companyUser.findMany({
      where: { id: { in: approverIds } },
      select: { id: true, isActive: true, deletedAt: true },
    });
    const isInactive = new Map(
      approvers.map((a) => [a.id, !a.isActive || a.deletedAt != null]),
    );
    const toFix = steps.filter((s) => isInactive.get(s.approverUserId));

    let reassigned = 0;
    for (const step of toFix) {
      const fallback = await this.prisma.companyUser.findFirst({
        where: {
          companyId: step.request.companyId,
          roles: { has: "YONETICI" },
          isActive: true,
          deletedAt: null,
          id: { not: step.approverUserId },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!fallback) {
        this.logger.error(
          `Pasif onaycı fallback: firma ${step.request.companyId} için aktif YONETICI yok, adım ${step.id} atlanıyor`,
        );
        continue;
      }
      await this.prisma.approvalRequestStep.update({
        where: { id: step.id },
        data: { approverUserId: fallback.id },
      });
      void this.notifyApprover(fallback.id, step.request.listingId);
      reassigned++;
      this.logger.log(
        `Pasif onaycı fallback: adım ${step.id} → aktif YONETICI ${fallback.id}`,
      );
    }
    return reassigned;
  }

  /** Kullanıcının onayını bekleyen istekler (Onaylar sayfası). */
  async listPending(user: AuthenticatedCompanyUser) {
    const reqs = await this.prisma.approvalRequest.findMany({
      where: {
        companyId: user.companyId,
        status: "PENDING",
        steps: { some: { approverUserId: user.userId, status: "PENDING" } },
      },
      include: {
        listing: { select: { id: true, number: true, title: true, type: true } },
        steps: { orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "asc" },
    });
    return reqs.map((r) => ({
      id: r.id,
      type: r.type,
      amount: Number(r.amount),
      currency: r.currency,
      createdAt: r.createdAt,
      listing: r.listing,
      currentStepOrder: r.steps.find((s) => s.status === "PENDING")?.order ?? 0,
      totalSteps: r.steps.filter((s) => s.status !== "SKIPPED").length,
    }));
  }

  async pendingCount(user: AuthenticatedCompanyUser) {
    const count = await this.prisma.approvalRequest.count({
      where: {
        companyId: user.companyId,
        status: "PENDING",
        steps: { some: { approverUserId: user.userId, status: "PENDING" } },
      },
    });
    return { count };
  }

  // ─────────────────────────── Yardımcılar ───────────────────────────

  private async requireOwnFlow(companyId: string, flowId: string) {
    const f = await this.prisma.approvalFlow.findUnique({
      where: { id: flowId },
      select: { id: true, companyId: true, type: true, listingType: true },
    });
    if (!f || f.companyId !== companyId) {
      throw new NotFoundException("Onay akışı bulunamadı");
    }
    return f;
  }

  private async assertApproversValid(companyId: string, ids: string[]) {
    const uniq = [...new Set(ids)];
    // Onaycılar firmaya ait + aktif olmalı (pasif onaycı zinciri tıkar).
    const count = await this.prisma.companyUser.count({
      where: { id: { in: uniq }, companyId, deletedAt: null, isActive: true },
    });
    if (count !== uniq.length) {
      throw new BadRequestException("Geçersiz veya pasif onaycı kullanıcı");
    }
  }
}
