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
import { CompanyRole, Prisma } from "@rothern/db";
import { isNotificationEnabled } from "../../common/notifications/notification-prefs";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { AuditService } from "../audit/audit.service";
import { EmailService } from "../email/email.service";
import { NotificationService } from "../notifications/notification.service";
import { resolveWebUrl } from "../../common/config/web-url";
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
    private readonly audit: AuditService,
  ) {}

  /** Sırası gelen onaycıya "onayınız bekleniyor" bildirimi (fire-and-forget). */
  private async notifyApprover(
    approverUserId: string,
    listingId: string,
    daysWaiting?: number,
  ) {
    try {
      await this.notifyApproverInner(approverUserId, listingId, daysWaiting);
    } catch (err) {
      // Best-effort: bildirim öncesi DB okuması bile hata verse onay akışı
      // çökmesin (void ile çağrıldığından unhandled rejection'ı yut).
      this.logger.warn(
        `Onay bildirimi hazırlanamadı: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async notifyApproverInner(
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
      resolveWebUrl(this.config);
    // In-app kanal — onaycı kullanıcısına. Best-effort: yazım hatası (ör.
    // kullanıcı bu arada silindi) onay akışını çökertmesin.
    await this.notifications
      .pushToUser(approverUserId, {
        type: "approval_pending",
        title: "Onayınız bekleniyor",
        body: `"${listing?.title ?? "İhale"}" (${listing?.number ?? "—"}) için onay sırası sizde. Lütfen Onaylar sayfasından inceleyip karar verin.`,
        ctaLabel: "Onaylar Sayfası",
        ctaUrl: `${webUrl}/company/onaylar`,
        listingId,
      })
      .catch((err) =>
        this.logger.warn(
          `Onay in-app bildirimi yazılamadı: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
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

  /**
   * Nihai karar (onay/ret) isteği BAŞLATANA bildirilir — eski sistem
   * paritesi: başlatan sonucu sayfada beklemeden öğrenir.
   */
  private async notifyRequester(
    requestCreatorId: string,
    listingId: string,
    decision: "APPROVED" | "REJECTED",
    note?: string,
  ) {
    try {
      await this.notifyRequesterInner(requestCreatorId, listingId, decision, note);
    } catch (err) {
      this.logger.warn(
        `Onay sonucu bildirimi hazırlanamadı: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  private async notifyRequesterInner(
    requestCreatorId: string,
    listingId: string,
    decision: "APPROVED" | "REJECTED",
    note?: string,
  ) {
    const [creator, listing] = await Promise.all([
      this.prisma.companyUser.findUnique({
        where: { id: requestCreatorId },
        select: { email: true, firstName: true, lastName: true },
      }),
      this.prisma.listing.findUnique({
        where: { id: listingId },
        select: { title: true, number: true },
      }),
    ]);
    if (!creator) return;
    const approved = decision === "APPROVED";
    const webUrl =
      resolveWebUrl(this.config);
    const title = approved ? "Onay isteğiniz onaylandı" : "Onay isteğiniz reddedildi";
    const body = `"${listing?.title ?? "İhale"}" (${listing?.number ?? "—"}) için başlattığınız onay isteği ${
      approved ? "onaylandı ve işlem uygulandı" : "reddedildi"
    }.${note ? ` Not: ${note}` : ""}`;
    await this.notifications
      .pushToUser(requestCreatorId, {
        // Karar SONUCU (onaylandı/reddedildi) — "sıra sizde" (approval_pending)
        // tipiyle değil; sonuç kapatılamaz olmalı, başlatan kendi isteğinin
        // sonucunu tercihle susturamasın.
        type: "approval_decided",
        title,
        body,
        ctaLabel: "İhaleyi Gör",
        ctaUrl: `${webUrl}/company/ilan/${listingId}`,
        listingId,
      })
      .catch((err) =>
        this.logger.warn(
          `Onay sonucu in-app bildirimi yazılamadı: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    void this.email
      .send({
        to: {
          email: creator.email,
          name: `${creator.firstName} ${creator.lastName}`,
        },
        subject: title,
        templateData: {
          template: "notification",
          data: {
            subject: title,
            heading: title,
            paragraphs: ["Merhaba,", body],
            ctaLabel: "İhaleyi Gör",
            ctaUrl: `${webUrl}/company/ilan/${listingId}`,
          },
        },
        context: { type: "approval_decided", id: listingId },
      })
      .catch((err) =>
        this.logger.error(
          `Onay sonucu bildirimi gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  // ─────────────────────────── Akış CRUD (Ayarlar) ───────────────────────────

  /** Akış girdisi doğrulama: bütçe eşiği monoton artan + başlatıcı rol kısıtı. */
  private validateFlowInput(dto: CreateApprovalFlowDto) {
    // Yayın onayı kaldırıldı — onay akışı yalnız KAZANDIRMA için tanımlanır.
    if (dto.type !== "LISTING_AWARD") {
      throw new BadRequestException(
        "Onay akışı yalnızca kazandırma için tanımlanabilir",
      );
    }
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
        displayLabel: s.displayLabel,
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
            displayLabel: s.displayLabel?.trim() || null,
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
              displayLabel: s.displayLabel?.trim() || null,
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
            displayLabel: s.displayLabel,
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
      amount: number | Prisma.Decimal;
      currency: string;
      payload?: Prisma.InputJsonValue;
      /** Başlatanın onaycılara notu (opsiyonel). */
      initiatorNote?: string;
      /**
       * INV-FX-1 (X3 fail-closed): tutarın TRY karşılığı hesaplanamadığında
       * (kur bazı bilinmiyor) true geçilir → eşik atlanamaz, HER adım aktif
       * kalır (SKIPPED yok). "Bilmiyorsam insana sor" — sessiz baypas yerine.
       */
      forceRequireApproval?: boolean;
    },
  ): Promise<{ approved: true } | { approved: false; requestId: string }> {
    const flow = await this.findMatchingFlow(
      user,
      input.type,
      input.listingType,
    );
    if (!flow || flow.steps.length === 0) return { approved: true };

    // INV-MONEY-1: eşik karşılaştırması DECIMAL (iki taraf da float değil). award
    // artık .toNumber()'sız Decimal geçer; number gelse de normalize edilir.
    const amountDec = new Prisma.Decimal(input.amount);
    const drafts = flow.steps.map((s) => {
      const min = s.conditionMinAmount
        ? new Prisma.Decimal(s.conditionMinAmount)
        : new Prisma.Decimal(0);
      // INV-FX-1: kur bilinmiyorsa hiçbir adım atlanmaz (eşik değerlendirilemez).
      const skipped = !input.forceRequireApproval && amountDec.lt(min);
      return {
        order: s.order,
        approverUserId: s.approverUserId,
        // Etiket snapshot — akış sonradan değişse de görünen ad sabit kalır.
        displayLabel: s.displayLabel,
        status: (skipped ? "SKIPPED" : "WAITING") as
          | "SKIPPED"
          | "WAITING"
          | "PENDING",
      };
    });
    const firstActive = drafts.findIndex((d) => d.status !== "SKIPPED");
    if (firstActive === -1) return { approved: true }; // hepsi atlandı
    drafts[firstActive]!.status = "PENDING";

    // INV-APPR-1 (görev ayrılığı): ilk aktif adımın onaycısı BAŞLATAN'ın kendisi
    // ise anında ikame et — initiator kendi isteğini onaylayamaz (decide de
    // reddeder). İkame edecek initiator-dışı uygun onaylayıcı yoksa award'ı
    // ANINDA reddet: doomed PENDING oluşmasın, kullanıcı ~1dk fallback-cron'unu
    // beklemeden net hata alsın (tek-admin firma senaryosu). Sonraki adımların
    // (ilerideki adım == initiator) ikamesi fallback cron'undadır.
    if (drafts[firstActive]!.approverUserId === user.userId) {
      const substitute = await this.findEligibleApprover(user.companyId, [
        user.userId,
      ]);
      if (!substitute) {
        throw new ForbiddenException(
          "Onay akışında sizden başka uygun bir onaylayıcı yok — akışa bir onaylayıcı ekleyin veya firma sahibine başvurun.",
        );
      }
      drafts[firstActive]!.approverUserId = substitute;
    }

    // İlan başına aynı tipte tek açık istek. İki eşzamanlı kazandırma (~round-trip
    // penceresinde) iki PENDING istek üretip, biri onaylanıp sipariş oluştuktan
    // sonra diğerinin reddi/iptali ilanı geri açarak çift-sipariş riski
    // doğuruyordu. Mükerrer isteği baştan reddet.
    const existingPending = await this.prisma.approvalRequest.findFirst({
      where: {
        listingId: input.listingId,
        type: input.type,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (existingPending) {
      throw new ConflictException(
        "Bu ilan için zaten bekleyen bir onay isteği var",
      );
    }

    // APR-YYYY-NNNN — yarışta unique constraint patlarsa yeniden dene.
    let req: { id: string } | null = null;
    for (let attempt = 0; attempt < 3 && !req; attempt++) {
      const requestNo = await this.nextRequestNo(user.companyId);
      try {
        req = await this.prisma.approvalRequest.create({
          data: {
            companyId: user.companyId,
            listingId: input.listingId,
            type: input.type,
            status: "PENDING",
            requestNo,
            amount: amountDec,
            currency: input.currency as never,
            payload: input.payload ?? Prisma.JsonNull,
            initiatorNote: input.initiatorNote?.trim() || null,
            createdById: user.userId,
            steps: { create: drafts },
          },
          select: { id: true },
        });
      } catch (e) {
        const conflict =
          e instanceof Prisma.PrismaClientKnownRequestError &&
          e.code === "P2002";
        if (!conflict || attempt === 2) throw e;
      }
    }
    // İlk aktif adımın onaycısına bildir.
    const firstApprover = drafts[firstActive]!.approverUserId;
    void this.notifyApprover(firstApprover, input.listingId);
    return { approved: false, requestId: req!.id };
  }

  /** Eşleşen aktif akış: tip + ilan tipi + başlatıcı rol (requestApproval/preview ortak). */
  private findMatchingFlow(
    user: AuthenticatedCompanyUser,
    type: ApprovalType,
    listingType: "ALIM" | "SATIS",
  ) {
    // BK-1: SAHIP rol-kapsamlı onay akışından MUAF DEĞİLDİR — görev-ayrılığının
    // tüm amacı, kendine büyük tutarı kazandıran kişiyi durdurmaktır ve bunu en
    // çok yapabilecek olan SAHIP'tir (self-onay yasağının kardeşi). Eskiden SAHIP
    // hiçbir initiatorRoles'e girmediğinden (DTO'da seçilemez) rol-kapsamlı akış
    // ONA HİÇ eşleşmiyordu → {approved:true}, ONAYSIZ kazandırma. Çözüm: SAHIP'i,
    // kazandırma authz'ının kullandığı OPERASYONEL rolle (ALIM→SATIN_ALMACI,
    // SATIS→SATISCI) genişlet. Deadlock riski YOK: SAHIP initiator → requestApproval
    // ikame-sonra-reddet (Grup C, INV-APPR-1) devreye girer (tek-admin firma net
    // hata alır, yeni deadlock oluşmaz).
    const roles = user.roles.includes(CompanyRole.SAHIP)
      ? [
          ...user.roles,
          listingType === "ALIM"
            ? CompanyRole.SATIN_ALMACI
            : CompanyRole.SATISCI,
        ]
      : user.roles;
    return this.prisma.approvalFlow.findFirst({
      where: {
        companyId: user.companyId,
        type,
        status: "ACTIVE",
        AND: [
          // İlan tipi: akış belirli tipe bağlıysa eşleşmeli; null = her ikisi.
          { OR: [{ listingType: null }, { listingType }] },
          // Başlatıcı rol: boşsa kısıt yok; doluysa kullanıcının (SAHIP ise
          // operasyonel-rolle genişletilmiş) rollerinden biri.
          {
            OR: [
              { initiatorRoles: { isEmpty: true } },
              { initiatorRoles: { hasSome: roles } },
            ],
          },
        ],
      },
      include: { steps: { orderBy: { order: "asc" } } },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Ön kontrol: bu kullanıcı KAZANDIRMA yaptığında onay akışı devreye girecek
   * mi? UI, girecekse başlatıcı notu alanı gösterir. (Yayın onayı kaldırıldı.)
   */
  async preview(user: AuthenticatedCompanyUser, listingType: "ALIM" | "SATIS") {
    const award = await this.findMatchingFlow(user, "LISTING_AWARD", listingType);
    return {
      publish: false as const,
      award: !!award && award.steps.length > 0,
    };
  }

  /** Firma bazında sıradaki onay numarası (APR-YYYY-NNNN). */
  private async nextRequestNo(companyId: string): Promise<string> {
    const prefix = `APR-${new Date().getFullYear()}-`;
    const last = await this.prisma.approvalRequest.findFirst({
      where: { companyId, requestNo: { startsWith: prefix } },
      orderBy: { requestNo: "desc" },
      select: { requestNo: true },
    });
    const n = last?.requestNo
      ? parseInt(last.requestNo.slice(prefix.length), 10) + 1
      : 1;
    return `${prefix}${String(n).padStart(4, "0")}`;
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
    // INV-APPR-1 (görev ayrılığı): başlatan kendi isteğini ONAYLAYAMAZ. Bir adımın
    // approver'ı yanlışlıkla/kötü niyetle initiator'a eşitlenmişse burada kesilir;
    // geçersiz-approver (initiator) ikamesi requestApproval + fallback cron'da.
    if (user.userId === req.createdById) {
      throw new ForbiddenException(
        "Kendi başlattığınız kazandırmayı onaylayamazsınız (görev ayrılığı).",
      );
    }

    // ── Yarış koruması ──
    // Karar, adım statüsü üzerinde atomik compare-and-swap ile uygulanır:
    // updateMany(where status=PENDING). İki eşzamanlı onay (çift tıklama / iki
    // sekme) durumunda yalnızca biri count=1 alır; diğeri count=0 → "zaten
    // sonuçlandı" hatası. Bu, SON adımda çift finalize → ÇİFT SİPARİŞ üretimini
    // önler. Event emit yalnızca commit sonrası ve yalnızca kazanan tarafından.
    const now = new Date();

    if (action === "reject") {
      const won = await this.prisma.$transaction(async (tx) => {
        // İlişki filtresi (request.status=PENDING) ters sıralı iptal yarışını da
        // yakalar: istek bu arada iptal edildiyse adım flip'i hiç olmaz.
        const cas = await tx.approvalRequestStep.updateMany({
          where: {
            id: step.id,
            status: "PENDING",
            request: { status: "PENDING" },
          },
          data: { status: "REJECTED", note: dto.note, decidedAt: now },
        });
        if (cas.count === 0) return false;
        await tx.approvalRequest.updateMany({
          where: { id: req.id, status: "PENDING" },
          data: { status: "REJECTED", decidedAt: now },
        });
        return true;
      });
      if (!won) {
        throw new BadRequestException("Bu adım zaten sonuçlandırıldı");
      }
      // INV-AUDIT-1: yetki kararı (onay adımı reddi) — commit SONRASI, emit'ten önce.
      // Kim, hangi adımı reddetti? (Kazandırmanın kendisi ayrı iz bırakır.)
      await this.audit.log({
        action: "company.approval.rejected",
        actorType: "company",
        actorId: user.userId,
        actorEmail: user.email,
        tenantId: user.companyId,
        entityType: "approval_request",
        entityId: req.id,
        critical: true,
        metadata: {
          type: req.type,
          listingId: req.listingId,
          stepId: step.id,
          stepOrder: step.order,
          isFinal: false,
          note: dto.note ?? null,
        },
      });
      this.events.emit(`${eventBase(req.type as ApprovalType)}.rejected`, {
        requestId: req.id,
        listingId: req.listingId,
        payload: req.payload,
      });
      void this.notifyRequester(
        req.createdById,
        req.listingId,
        "REJECTED",
        dto.note,
      );
      return { ok: true, status: "REJECTED" as const };
    }

    const next = req.steps.find(
      (s) => s.order > step.order && s.status === "WAITING",
    );
    const outcome = await this.prisma.$transaction(async (tx) => {
      const cas = await tx.approvalRequestStep.updateMany({
        where: {
          id: step.id,
          status: "PENDING",
          request: { status: "PENDING" },
        },
        data: { status: "APPROVED", note: dto.note, decidedAt: now },
      });
      if (cas.count === 0) return "conflict" as const;
      if (next) {
        await tx.approvalRequestStep.update({
          where: { id: next.id },
          data: { status: "PENDING" },
        });
        return "next" as const;
      }
      const fin = await tx.approvalRequest.updateMany({
        where: { id: req.id, status: "PENDING" },
        data: { status: "APPROVED", decidedAt: now },
      });
      // İstek bu arada iptal edildiyse throw → adım flip'i geri alınır (rollback),
      // hayalet sipariş üretilmez.
      if (fin.count === 0) {
        throw new BadRequestException("Bu istek artık beklemede değil");
      }
      return "final" as const;
    });

    if (outcome === "conflict") {
      throw new BadRequestException("Bu adım zaten sonuçlandırıldı");
    }
    if (outcome === "next") {
      // INV-AUDIT-1: yetki kararı (ara adım onayı) — commit SONRASI, bildirimden önce.
      await this.audit.log({
        action: "company.approval.step_approved",
        actorType: "company",
        actorId: user.userId,
        actorEmail: user.email,
        tenantId: user.companyId,
        entityType: "approval_request",
        entityId: req.id,
        critical: true,
        metadata: {
          type: req.type,
          listingId: req.listingId,
          stepId: step.id,
          stepOrder: step.order,
          isFinal: false,
          note: dto.note ?? null,
        },
      });
      void this.notifyApprover(next!.approverUserId, req.listingId);
      return { ok: true, status: "STEP_APPROVED" as const };
    }
    // İstek transaction içinde APPROVED işaretlendi → iptal artık kilitli.
    // Kazandırmayı SENKRON uygula (emitAsync handler'ı bekler): başarısızsa
    // FAIL-CLOSED — finalize'ı geri al ki "onay var ama sipariş yok" tutarsızlığı
    // oluşmasın; onaycı tekrar deneyebilsin.
    try {
      await this.events.emitAsync(
        `${eventBase(req.type as ApprovalType)}.approved`,
        {
          requestId: req.id,
          listingId: req.listingId,
          payload: req.payload,
          // Insider incelemesi için initiator (kazandırmayı başlatan) ile
          // approver (son adımı onaylayan) ayrımı — finalize audit'i buradan okur.
          initiatorUserId: req.createdById,
          approverUserId: user.userId,
        },
      );
    } catch (err) {
      await this.prisma.$transaction([
        this.prisma.approvalRequestStep.update({
          where: { id: step.id },
          data: { status: "PENDING", decidedAt: null, note: null },
        }),
        this.prisma.approvalRequest.update({
          where: { id: req.id },
          data: { status: "PENDING", decidedAt: null },
        }),
      ]);
      this.logger.error(
        `Kazandırma uygulanamadı, onay geri alındı (istek ${req.id}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      throw new BadRequestException(
        "Kazandırma uygulanamadı — teklif durumu değişmiş olabilir. Lütfen tekrar deneyin.",
      );
    }
    // INV-AUDIT-1: yetki kararı (SON adım onayı) — YALNIZ kazandırma başarıyla
    // uygulandıktan SONRA. Yukarıdaki catch rollback edip throw ettiğinden buraya
    // yalnız emitAsync başarısında ulaşılır: onay verildi ama kazandırma
    // fail/rollback ederse bu iz DÜŞMEZ (INV-AUDIT-1 dalga-2 kuralı).
    await this.audit.log({
      action: "company.approval.approved",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "approval_request",
      entityId: req.id,
      critical: true,
      metadata: {
        type: req.type,
        listingId: req.listingId,
        stepId: step.id,
        stepOrder: step.order,
        isFinal: true,
        note: dto.note ?? null,
      },
    });
    void this.notifyRequester(req.createdById, req.listingId, "APPROVED");
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
    // Eski sistem paritesi: başlatan VEYA yönetim (Kurucu/Yönetici) iptal eder.
    const isManager =
      user.isOwner ||
      user.roles.includes(CompanyRole.SAHIP) ||
      user.roles.includes(CompanyRole.YONETICI);
    if (req.createdById !== user.userId && !isManager) {
      throw new ForbiddenException(
        "Bu isteği yalnızca başlatan veya Yönetici iptal edebilir",
      );
    }
    if (req.status !== "PENDING") {
      throw new BadRequestException("Yalnızca bekleyen istek iptal edilebilir");
    }
    // Yarış koruması: iptal, onaycı kararıyla eşzamanlı gelebilir. İsteği yalnız
    // hâlâ PENDING iken CANCELLED'a çevir (atomik CAS). Kaybeden taraf listing'i
    // yanlışlıkla eski duruma döndürmesin (ör. onay bitip sipariş oluştuktan
    // sonra iptal listing'i CLOSED'a düşürmesin).
    const won = await this.prisma.$transaction(async (tx) => {
      const cas = await tx.approvalRequest.updateMany({
        where: { id: req.id, status: "PENDING" },
        data: { status: "CANCELLED", decidedAt: new Date() },
      });
      if (cas.count === 0) return false;
      // İlanı yalnız hâlâ ONAY-BEKLİYOR durumundaysa geri al. Award bu arada
      // başka bir yolla tamamlandıysa (AWARDED + sipariş) koşullu updateMany
      // count=0 döner ve dokunmayız — iptal, biten kazandırmayı bozamaz.
      const expected =
        req.type === "LISTING_PUBLISH" ? "DRAFT" : "IN_AWARD_APPROVAL";
      // Kazandırma isteği iptali → IN_AWARD (CLOSED ara durumu kaldırıldı;
      // kapanan ihale değerlendirmededir).
      const target = req.type === "LISTING_PUBLISH" ? "DRAFT" : "IN_AWARD";
      await tx.listing.updateMany({
        where: { id: req.listingId, status: expected },
        data: { status: target },
      });
      return true;
    });
    if (!won) {
      throw new BadRequestException("Yalnızca bekleyen istek iptal edilebilir");
    }
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
      // Günlük cron — birikmiş backlog'da sınırsız yükleme yapmasın; kalanlar
      // ertesi gün işlenir (lastReminderAt dedup zaten sağlıyor).
      take: 200,
      orderBy: { createdAt: "asc" },
    });
    let sent = 0;
    for (const r of reqs) {
      const approverId = r.steps[0]?.approverUserId;
      if (!approverId) continue;
      // Atomik claim ÖNCE: lastReminderAt'i yalnız hâlâ eski/null iken güncelleyen
      // worker e-posta atar. Eskiden e-posta gönderilip SONRA update yapılıyordu;
      // iki replica 09:00'te aynı reqs'i okuyup çift hatırlatma atabilirdi.
      const claimed = await this.prisma.approvalRequest.updateMany({
        where: {
          id: r.id,
          status: "PENDING",
          OR: [{ lastReminderAt: null }, { lastReminderAt: { lt: dedupAfter } }],
        },
        data: { lastReminderAt: new Date() },
      });
      if (claimed.count !== 1) continue; // başka worker aldı
      const daysWaiting = Math.floor(
        (now - r.createdAt.getTime()) / 86_400_000,
      );
      await this.notifyApprover(approverId, r.listingId, daysWaiting);
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
        request: {
          select: {
            id: true,
            companyId: true,
            listingId: true,
            type: true,
            payload: true,
            createdById: true,
          },
        },
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
    // INV-APPR-1: GEÇERSİZ approver = inaktif/silinmiş VEYA initiator (görev
    // ayrılığı — self-onay decide'da da reddedilir; burada zinciri açar).
    const toFix = steps.filter(
      (s) =>
        isInactive.get(s.approverUserId) ||
        s.approverUserId === s.request.createdById,
    );

    let reassigned = 0;
    for (const step of toFix) {
      // Havuz: aktif SAHIP/YONETICI/ONAYLAYICI ∖ {eski approver, initiator}
      // ("approver-uygun = fallback-uygun" tutarsızlığı kapatıldı; ONAYLAYICI dahil).
      const fallback = await this.findEligibleApprover(step.request.companyId, [
        step.approverUserId,
        step.request.createdById,
      ]);
      if (!fallback) {
        // Uygun onaylayıcı YOK → SESSİZ PENDING DEĞİL (eski deadlock): tanımlı
        // reddet + initiator'ı bilgilendir (tek-admin senaryosu buraya düşer).
        this.logger.warn(
          `Onay fallback: firma ${step.request.companyId} isteği ${step.request.id} için initiator-dışı uygun onaylayıcı yok → REJECTED`,
        );
        await this.rejectForNoApprover(step.request);
        continue;
      }
      await this.prisma.approvalRequestStep.update({
        where: { id: step.id },
        data: { approverUserId: fallback },
      });
      void this.notifyApprover(fallback, step.request.listingId);
      reassigned++;
      this.logger.log(`Onay fallback: adım ${step.id} → ${fallback}`);
    }
    return reassigned;
  }

  /**
   * INV-APPR-1: bir adım için UYGUN onaylayıcı — aktif SAHIP/YONETICI/ONAYLAYICI
   * (onaycı-uygun rolleriyle AYNI küme; eski fallback'in yalnız SAHIP/YONETICI
   * araması tutarsızdı), `excludeIds` dışında (eski/geçersiz approver + initiator).
   * Uygun kimse yoksa null.
   */
  private async findEligibleApprover(
    companyId: string,
    excludeIds: string[],
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<string | null> {
    const u = await client.companyUser.findFirst({
      where: {
        companyId,
        isActive: true,
        deletedAt: null,
        roles: { hasSome: ["SAHIP", "YONETICI", "ONAYLAYICI"] },
        id: { notIn: excludeIds },
      },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    return u?.id ?? null;
  }

  /**
   * INV-APPR-1: initiator-dışı uygun onaylayıcı bulunamayınca isteği TANIMLI
   * biçimde reddeder (sessiz PENDING deadlock yerine): request + bekleyen/açık
   * adımlar REJECTED, listing IN_AWARD'a döner (rejected event), initiator net
   * mesajla bilgilendirilir. Sistem kararı (adminId/actorId yok).
   */
  private async rejectForNoApprover(req: {
    id: string;
    companyId: string;
    type: string;
    listingId: string;
    payload: unknown;
    createdById: string;
  }): Promise<void> {
    const done = await this.prisma.approvalRequest.updateMany({
      where: { id: req.id, status: "PENDING" },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    if (done.count !== 1) return; // yarış: başka worker/karar sonuçlandırdı
    await this.prisma.approvalRequestStep.updateMany({
      where: { requestId: req.id, status: { in: ["PENDING", "WAITING"] } },
      data: { status: "REJECTED", decidedAt: new Date() },
    });
    await this.audit.log({
      action: "company.approval.rejected",
      actorType: "system",
      tenantId: req.companyId,
      entityType: "approval_request",
      entityId: req.id,
      critical: true,
      metadata: {
        type: req.type,
        listingId: req.listingId,
        reason: "no_eligible_approver",
        isFinal: true,
      },
    });
    this.events.emit(`${eventBase(req.type as ApprovalType)}.rejected`, {
      requestId: req.id,
      listingId: req.listingId,
      payload: req.payload,
    });
    void this.notifyRequester(
      req.createdById,
      req.listingId,
      "REJECTED",
      "Onay akışında sizden başka uygun bir onaylayıcı yok — akışa bir onaylayıcı ekleyin veya firma sahibine başvurun.",
    );
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
    const creatorIds = [...new Set(reqs.map((r) => r.createdById))];
    const creators = await this.prisma.companyUser.findMany({
      where: { id: { in: creatorIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(
      creators.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );
    return reqs.map((r) => ({
      id: r.id,
      requestNo: r.requestNo,
      type: r.type,
      amount: Number(r.amount),
      currency: r.currency,
      initiatorNote: r.initiatorNote,
      createdBy: nameById.get(r.createdById) ?? "—",
      createdAt: r.createdAt,
      listing: r.listing,
      currentStepOrder: r.steps.find((s) => s.status === "PENDING")?.order ?? 0,
      totalSteps: r.steps.filter((s) => s.status !== "SKIPPED").length,
    }));
  }

  /**
   * Onay geçmişi + taleplerim — kullanıcının PARÇASI olduğu istekler:
   * başlattıkları (her durumda — bekleyeni iptal edebilsin) + onaycısı olduğu
   * sonuçlanmışlar. Adım zaman çizelgesi (onaycı adı, karar, not) ile döner.
   */
  async listHistory(user: AuthenticatedCompanyUser) {
    const reqs = await this.prisma.approvalRequest.findMany({
      where: {
        companyId: user.companyId,
        OR: [
          { createdById: user.userId },
          {
            status: { not: "PENDING" },
            steps: { some: { approverUserId: user.userId } },
          },
        ],
      },
      include: {
        listing: { select: { id: true, number: true, title: true, type: true } },
        steps: { orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const userIds = [
      ...new Set([
        ...reqs.flatMap((r) => r.steps.map((s) => s.approverUserId)),
        ...reqs.map((r) => r.createdById),
      ]),
    ];
    const users = await this.prisma.companyUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );
    return reqs.map((r) => this.serializeRequest(r, nameById, user.userId));
  }

  /**
   * Tüm Süreçler — firma genelindeki onay istekleri (eski sistem paritesi:
   * herkes firmadaki onay süreçlerini izleyebilir). Filtreler: durum, tip, arama
   * (onay no / ilan no / ilan başlığı).
   */
  async listAll(
    user: AuthenticatedCompanyUser,
    filters: { status?: string; type?: string; search?: string },
  ) {
    const where: Prisma.ApprovalRequestWhereInput = {
      companyId: user.companyId,
    };
    if (
      filters.status &&
      ["PENDING", "APPROVED", "REJECTED", "CANCELLED"].includes(filters.status)
    ) {
      where.status = filters.status as never;
    }
    if (
      filters.type &&
      ["LISTING_PUBLISH", "LISTING_AWARD"].includes(filters.type)
    ) {
      where.type = filters.type as never;
    }
    const search = filters.search?.trim();
    if (search) {
      where.OR = [
        { requestNo: { contains: search, mode: "insensitive" } },
        { listing: { number: { contains: search, mode: "insensitive" } } },
        { listing: { title: { contains: search, mode: "insensitive" } } },
      ];
    }
    const reqs = await this.prisma.approvalRequest.findMany({
      where,
      include: {
        listing: { select: { id: true, number: true, title: true, type: true } },
        steps: { orderBy: { order: "asc" } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const userIds = [
      ...new Set([
        ...reqs.flatMap((r) => r.steps.map((s) => s.approverUserId)),
        ...reqs.map((r) => r.createdById),
      ]),
    ];
    const users = await this.prisma.companyUser.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameById = new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );
    return reqs.map((r) => this.serializeRequest(r, nameById, user.userId));
  }

  /** İstek + adım zaman çizelgesini UI şekline indir (history/all ortak). */
  private serializeRequest(
    r: Prisma.ApprovalRequestGetPayload<{
      include: {
        listing: {
          select: { id: true; number: true; title: true; type: true };
        };
        steps: true;
      };
    }>,
    nameById: Map<string, string>,
    viewerId: string,
  ) {
    const pendingStep = r.steps.find((s) => s.status === "PENDING");
    return {
      id: r.id,
      requestNo: r.requestNo,
      type: r.type,
      status: r.status,
      amount: Number(r.amount),
      currency: r.currency,
      initiatorNote: r.initiatorNote,
      createdAt: r.createdAt,
      decidedAt: r.decidedAt,
      createdBy: nameById.get(r.createdById) ?? "—",
      mine: r.createdById === viewerId,
      listing: r.listing,
      currentStepOrder: pendingStep?.order ?? 0,
      currentApprover: pendingStep
        ? (nameById.get(pendingStep.approverUserId) ?? "—")
        : null,
      totalSteps: r.steps.filter((s) => s.status !== "SKIPPED").length,
      decidedSteps: r.steps.filter(
        (s) => s.status === "APPROVED" || s.status === "REJECTED",
      ).length,
      steps: r.steps.map((s) => ({
        order: s.order,
        approverName: nameById.get(s.approverUserId) ?? "—",
        displayLabel: s.displayLabel,
        status: s.status,
        note: s.note,
        decidedAt: s.decidedAt,
      })),
    };
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
    const rows = await this.prisma.companyUser.findMany({
      where: { id: { in: uniq }, companyId, deletedAt: null, isActive: true },
      select: { id: true, roles: true, firstName: true, lastName: true },
    });
    if (rows.length !== uniq.length) {
      throw new BadRequestException("Geçersiz veya pasif onaycı kullanıcı");
    }
    // Eski sistem kuralı: onaycı YONETICI veya ONAYLAYICI rolünde olmalı —
    // operasyon rolleri (satın almacı/satışçı) onay zincirinde karar veremez.
    // Kurucu (SAHIP) ⊇ Yönetici → onaycı olabilir.
    const bad = rows.find(
      (u) =>
        !u.roles.includes(CompanyRole.SAHIP) &&
        !u.roles.includes(CompanyRole.YONETICI) &&
        !u.roles.includes(CompanyRole.ONAYLAYICI),
    );
    if (bad) {
      throw new BadRequestException(
        `${bad.firstName} ${bad.lastName} onaycı olamaz — onaycı Kurucu, Yönetici veya Onaylayıcı rolünde olmalı`,
      );
    }
  }
}
