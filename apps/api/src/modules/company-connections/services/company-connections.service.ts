import {
  REVIEW_SUMMARY_SELECT,
  REVIEW_SUMMARY_TAKE,
  buildReviewSummary,
} from "../../company-reviews/review-summary";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { isCategoryCode, looksLikeProse, normalizeShortCode, tierAtLeast, validateShortCode } from "@rothern/shared";
import { publicProductWhere } from "../../../common/company/public-profile-gate";
import { buildDirectory, directoryFacets, type DirectoryParams } from "../../../common/company/company-directory";
import { PRODUCT_INDEX_SELECT, toProductIndexCard } from "../../public-marketplace/dto/public-product-index.projection";
import { Prisma } from "@rothern/db";
import {
  PrismaService,
  PrismaBypassService,
} from "../../../common/prisma/prisma.service";
import { CompanyViewsService } from "../../company-views/company-views.service";
import { runTenantTx } from "../../../common/prisma/tenant-tx";
import { AuditService } from "../../audit/audit.service";
import { CompanyBlocksService } from "../../company-blocks/company-blocks.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { EmailService } from "../../email/email.service";
import { NotificationService } from "../../notifications/notification.service";
import { resolveWebUrl } from "../../../common/config/web-url";
import {
  effectiveTier,
  anyPackageWhere,
} from "../../../common/company/effective-tier";
import { visibleOwnerListingWhere } from "../../../common/company/listing-visibility";
import { listingManageDenial } from "../../company-listings/listing-manage-access";
import { affinityReasonTextThirdParty } from "../../company-affinity/company-affinity.service";

type ConnectionOrigin = "INVITE" | "PREMIUM" | "ADMIN";

/** Bağlantı kartı için firma alanları (ihale daveti adımı + bağlantılar). */
const COMPANY_CARD_SELECT = {
  id: true,
  name: true,
  rothernId: true,
  tier: true,
  membershipEndAt: true, // INV-TIER-1: effectiveTier hesabı için
  taxNumber: true,
  city: true,
  country: true,
  industry: true,
  activities: true,
  logoUrl: true,
  companyVerificationStatus: true,
  users: {
    where: { isActive: true, deletedAt: null },
    take: 1,
    orderBy: { createdAt: "asc" as const },
    select: { firstName: true, lastName: true, email: true },
  },
} as const;

@Injectable()
export class CompanyConnectionsService {
  private readonly logger = new Logger(CompanyConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bypass: PrismaBypassService,
    private readonly blocks: CompanyBlocksService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    /** Ziyaret Edenler kaydı — SONDA ve isteğe bağlı (elle kurulan test rig'leri kırılmasın). */
    @Optional() private readonly views?: CompanyViewsService,
  ) {}

  /** Kendi Rothern ID. */
  async getSelf(user: AuthenticatedCompanyUser) {
    const c = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { rothernId: true },
    });
    return { rothernId: c?.rothernId ?? null };
  }

  /**
   * Rothern ID (rothernId) ile bağlantı isteği — PLATFORM (PREMIUM) bağlantısı.
   * Sadece PAKET gönderebilir; premium bitince bu bağlantı pasifleşir.
   */
  async invite(user: AuthenticatedCompanyUser, rothernIdRaw: string) {
    if (!tierAtLeast(user.tier, "BRONZ")) {
      throw new ForbiddenException(
        "Bağlantı daveti göndermek için bir paket (Bronz+) gerekir. Paketsiz üyeler yalnızca gelen davetleri kabul edebilir.",
      );
    }
    const code = normalizeShortCode(rothernIdRaw);
    if (!validateShortCode(code)) {
      throw new BadRequestException("Geçersiz Rothern ID (XXXX-XXXX)");
    }
    const target = await this.prisma.company.findUnique({
      where: { rothernId: code },
      select: { id: true, name: true, isActive: true, isBlocked: true },
    });
    if (!target || !target.isActive || target.isBlocked) {
      throw new NotFoundException("Bu Rothern ID'ye sahip firma bulunamadı");
    }
    return this.createRequest(user, target, "PREMIUM");
  }

  /**
   * E-posta ile davet. Kayıtlıysa doğrudan INVITE bağlantı isteği; değilse
   * ReferralInvite kaydı + davet e-postası. Hedef bu e-posta ile kayıt olunca
   * (signup hook) otomatik INVITE bağlantı kurulur.
   */
  async inviteByEmail(user: AuthenticatedCompanyUser, emailRaw: string) {
    if (!tierAtLeast(user.tier, "BRONZ")) {
      throw new ForbiddenException(
        "Bağlantı daveti göndermek için bir paket (Bronz+) gerekir. Paketsiz üyeler yalnızca gelen davetleri kabul edebilir.",
      );
    }
    const email = emailRaw.trim().toLowerCase();

    // Kayıtlı mı? E-posta CompanyUser'da benzersizdir — pasif/çıkarılmış
    // kullanıcı e-postasına referral maili göndermek boşa gider (o e-postayla
    // yeniden kayıt olunamaz). Kullanıcı pasif ama FİRMA aktifse istek yine
    // firmaya gider; firma pasifse anlamlı hata verilir.
    const existing = await this.prisma.companyUser.findUnique({
      where: { email },
      select: {
        company: {
          select: { id: true, name: true, isActive: true, isBlocked: true },
        },
      },
    });
    if (existing?.company) {
      if (!existing.company.isActive || existing.company.isBlocked) {
        throw new BadRequestException(
          "Bu e-posta adresinin bağlı olduğu firma artık aktif değil",
        );
      }
      const res = await this.createRequest(user, existing.company, "INVITE");
      return { kind: "request" as const, targetName: res.targetName };
    }

    // Kayıtsız → davet kaydı (varsa koru) + e-posta.
    // Denetim 2026-08-23 P2 #14: opt-out (/davet-kapat) TÜM davet yollarında
    // geçerli — yalnız dış-ihale yolunda uygulanıyordu.
    const optedOut = await this.prisma.referralOptOut.findFirst({
      where: { email },
      select: { email: true },
    });
    if (optedOut) {
      throw new ConflictException("Bu e-posta adresi davet almak istemediğini bildirdi");
    }
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });

    const inv = await this.prisma.companyReferralInvite.upsert({
      where: {
        inviterCompanyId_email: { inviterCompanyId: user.companyId, email },
      },
      create: {
        inviterCompanyId: user.companyId,
        email,
        invitedById: user.userId,
      },
      update: {},
    });

    const baseUrl =
      resolveWebUrl(this.config);
    const registerUrl = `${baseUrl}/company/kayit?ref=${inv.token}`;

    this.email
      .send({
        to: { email },
        templateData: {
          template: "referral_invite",
          data: {
            inviterName: me?.name ?? "Bir firma",
            email,
            registerUrl,
          },
        },
        context: { type: "referral_invite", id: inv.id },
      })
      .catch((err: unknown) =>
        this.logger.error(
          `Davet e-postası gönderilemedi (${email}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );

    return { kind: "invited" as const, email };
  }

  /**
   * Toplu e-posta daveti (eski sistem paritesi, 50'ye kadar). Her adres tek
   * tek işlenir ve SINIFLANDIRILMIŞ sonuç döner — biri patlarsa diğerleri
   * etkilenmez:
   *  - request  → kayıtlı firmaya bağlantı isteği gitti
   *  - invited  → kayıtsız, davet e-postası gitti
   *  - skipped  → gönderilmedi (zaten bağlı / zaten istekli / kendi firması /
   *               pasif firma / engelli) — reason ile
   */
  /**
   * Faz C — DIŞ ihale daveti: "X sizi 'Y' satın alma talebine davet etti" e-postası.
   * İtibar/ETK frenleri:
   *  - günlük firma tavanı (ihale-bağlamlı davet, UTC gün): 20
   *  - aynı adrese (bu firmadan) ömür boyu TEK davet (mevcut referral = skip)
   *  - opt-out listesi + kayıtlı-kullanıcı adresi = skip (dizinden davet edilir)
   * Kayıt token'la tamamlanınca: bağlantı ACTIVE + bu ihaleye otomatik davet
   * (acceptReferralInvites). Kapalı zarf: e-postada yalnız başlık/kategori/kapanış.
   */
  async inviteExternalForListing(
    user: AuthenticatedCompanyUser,
    listingId: string,
    emailsRaw: string[],
  ) {
    if (!tierAtLeast(user.tier, "BRONZ")) {
      throw new ForbiddenException(
        "Davet göndermek için bir paket (Bronz+) gerekir.",
      );
    }
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: { id: true, title: true, status: true, closesAt: true, categoryIds: true, type: true, createdById: true },
    });
    if (!listing) throw new NotFoundException("Satın Alma Talebi bulunamadı");
    // INV-AZ-1 (denetim 2026-08-23 P2 #7): dış davet = ilan-yönetim eylemi —
    // iç davet (addInvitations) ile AYNI kapı (tek kaynak listingManageDenial).
    const denial = listingManageDenial(user, listing);
    if (denial) {
      void this.audit.log({
        action: "company.listing.manage_denied",
        actorType: "company",
        actorId: user.userId,
        actorEmail: user.email,
        tenantId: user.companyId,
        entityType: "listing",
        entityId: listing.id,
        critical: false,
        metadata: { needed: denial.needed, listingType: listing.type, reason: denial.reason, via: "external_invite" },
      });
      throw new ForbiddenException(
        "Bu satın alma talebi için dış davet gönderme yetkiniz yok — ilanı yöneten kullanıcı ve ilgili rol gerekir",
      );
    }
    if (listing.status !== "DRAFT" && listing.status !== "OPEN") {
      throw new BadRequestException("Yalnız taslak/açık satın alma talebi için dış davet gönderilebilir");
    }

    const DAILY_CAP = 20;
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const sentToday = await this.prisma.companyReferralInvite.count({
      where: {
        inviterCompanyId: user.companyId,
        listingId: { not: null },
        createdAt: { gte: dayStart },
      },
    });

    const emails = [...new Set(
      (emailsRaw ?? [])
        .map((e) => (e ?? "").trim().toLowerCase())
        .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e)),
    )].slice(0, DAILY_CAP);
    if (emails.length === 0) {
      throw new BadRequestException("Geçerli e-posta adresi verilmedi");
    }

    const [optOuts, existing, registered, me, cats] = await Promise.all([
      this.prisma.referralOptOut.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      }),
      this.prisma.companyReferralInvite.findMany({
        where: { inviterCompanyId: user.companyId, email: { in: emails } },
        select: { email: true },
      }),
      this.prisma.companyUser.findMany({
        where: { email: { in: emails }, deletedAt: null },
        select: { email: true },
      }),
      this.prisma.company.findUnique({
        where: { id: user.companyId },
        select: { name: true },
      }),
      this.prisma.category.findMany({
        where: { id: { in: listing.categoryIds.slice(0, 3) } },
        select: { nameTr: true },
      }),
    ]);
    const optOutSet = new Set(optOuts.map((o) => o.email));
    const existingSet = new Set(existing.map((e) => e.email));
    const registeredSet = new Set(registered.map((r) => r.email.toLowerCase()));

    const baseUrl = resolveWebUrl(this.config);
    const categories = cats.map((c) => c.nameTr).join(", ") || "-";
    const closesAt = listing.closesAt
      ? listing.closesAt.toISOString().slice(0, 10)
      : null;

    const results: Array<{ email: string; status: "SENT" | "SKIPPED"; reason?: string }> = [];
    let budget = DAILY_CAP - sentToday;
    for (const email of emails) {
      if (budget <= 0) {
        results.push({ email, status: "SKIPPED", reason: "Günlük dış davet limitine ulaşıldı (20)" });
        continue;
      }
      if (optOutSet.has(email)) {
        results.push({ email, status: "SKIPPED", reason: "Bu adres davet almak istemiyor" });
        continue;
      }
      if (registeredSet.has(email)) {
        results.push({ email, status: "SKIPPED", reason: "Bu adres zaten Rothern'de kayıtlı — dizinden bağlantı daveti gönderin" });
        continue;
      }
      if (existingSet.has(email)) {
        results.push({ email, status: "SKIPPED", reason: "Bu adrese daha önce davet gönderilmiş" });
        continue;
      }
      const inv = await this.prisma.companyReferralInvite.create({
        data: {
          inviterCompanyId: user.companyId,
          email,
          invitedById: user.userId,
          listingId: listing.id,
        },
      });
      budget--;
      this.email
        .send({
          to: { email },
          templateData: {
            template: "tender_external_invite",
            data: {
              inviterName: me?.name ?? "Bir firma",
              tenderTitle: listing.title,
              categories,
              closesAt,
              registerUrl: `${baseUrl}/company/kayit?ref=${inv.token}`,
              optOutUrl: `${baseUrl}/davet-kapat?token=${inv.token}`,
            },
          },
          context: { type: "tender_external_invite", id: inv.id },
        })
        .catch((err: unknown) =>
          this.logger.error(
            `Dış davet e-postası gönderilemedi (${email}): ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
      results.push({ email, status: "SENT" });
    }

    void this.audit.log({
      action: "connection.external_tender_invite",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "listing",
      entityId: listing.id,
      metadata: {
        sent: results.filter((r) => r.status === "SENT").length,
        skipped: results.filter((r) => r.status === "SKIPPED").length,
      },
    });
    return { results };
  }

  /** Opt-out (public): davet token'ındaki adrese bir daha davet gönderilmez. */
  async markReferralOptOut(token: string) {
    // RLS aktivasyon hazırlığı (denetim 2026-08-28 Parça 12 #5): BYPASS client.
    // Bu uç PUBLIC ve guard'sız (e-postadaki tek-tık "davet almak istemiyorum"
    // linki) → tenant bağlamı YOK. `company_referral_invites` policy'li:
    // RLS açıldığında ana client'la satır bulunamaz, uç her tıklamada 404
    // döner ve opt-out kaydı HİÇ yazılmaz (ETK/İYS yükümlülüğü).
    // Cross-tenant okuma güvenli: erişim cuid token'la kapılı, dönen tek alan
    // e-posta ve o da doğrudan geri verilmiyor.
    const inv = await this.bypass.companyReferralInvite.findUnique({
      where: { token },
      select: { email: true },
    });
    if (!inv) throw new NotFoundException("Geçersiz bağlantı");
    await this.prisma.referralOptOut.upsert({
      where: { email: inv.email },
      create: { email: inv.email },
      update: {},
    });
    return { ok: true };
  }

  async inviteByEmailBatch(user: AuthenticatedCompanyUser, emails: string[]) {
    if (!tierAtLeast(user.tier, "BRONZ")) {
      throw new ForbiddenException(
        "Bağlantı daveti göndermek için bir paket (Bronz+) gerekir. Paketsiz üyeler yalnızca gelen davetleri kabul edebilir.",
      );
    }
    // Normalize + sıra korumalı dedupe.
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const raw of emails) {
      const e = raw.trim().toLowerCase();
      if (e && !seen.has(e)) {
        seen.add(e);
        unique.push(e);
      }
    }

    const results: {
      email: string;
      status: "request" | "invited" | "skipped";
      targetName?: string;
      reason?: string;
    }[] = [];

    for (const email of unique) {
      try {
        const res = await this.inviteByEmail(user, email);
        results.push(
          res.kind === "request"
            ? { email, status: "request", targetName: res.targetName }
            : { email, status: "invited" },
        );
      } catch (e) {
        const reason =
          e instanceof ConflictException ||
          e instanceof BadRequestException ||
          e instanceof NotFoundException ||
          e instanceof ForbiddenException
            ? ((e.getResponse() as { message?: string }).message ?? e.message)
            : "Gönderilemedi";
        results.push({ email, status: "skipped", reason });
      }
    }

    return {
      results,
      summary: {
        request: results.filter((r) => r.status === "request").length,
        invited: results.filter((r) => r.status === "invited").length,
        skipped: results.filter((r) => r.status === "skipped").length,
      },
    };
  }

  /** Gönderdiğim bekleyen e-posta davetleri. */
  async listReferralInvites(companyId: string) {
    const rows = await this.prisma.companyReferralInvite.findMany({
      where: { inviterCompanyId: companyId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, createdAt: true },
    });
    return rows;
  }

  /** Ortak istek oluşturma — self/blok/mevcut kontrolleri + kayıt. */
  private async createRequest(
    user: AuthenticatedCompanyUser,
    target: { id: string; name: string; isActive: boolean },
    origin: ConnectionOrigin,
  ) {
    if (target.id === user.companyId) {
      throw new BadRequestException("Kendinize istek gönderemezsiniz");
    }
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    if (blockedIds.includes(target.id)) {
      throw new NotFoundException("Firma bulunamadı");
    }
    const existing = await this.prisma.companyConnection.findFirst({
      where: {
        OR: [
          { inviterCompanyId: user.companyId, inviteeCompanyId: target.id },
          { inviterCompanyId: target.id, inviteeCompanyId: user.companyId },
        ],
      },
      select: { status: true, inviteeCompanyId: true },
    });
    if (existing) {
      if (existing.status === "ACTIVE") {
        throw new ConflictException("Bu firmayla zaten bağlısınız");
      }
      if (existing.inviteeCompanyId === user.companyId) {
        throw new ConflictException(
          "Bu firma size zaten istek göndermiş — Gelen İstekler'den kabul edin",
        );
      }
      throw new ConflictException("Bu firmaya zaten istek gönderdiniz");
    }

    let conn;
    try {
      conn = await this.prisma.companyConnection.create({
        data: {
          inviterCompanyId: user.companyId,
          inviteeCompanyId: target.id,
          invitedById: user.userId,
          status: "PENDING",
          origin,
        },
      });
    } catch (e) {
      // Yarış: findFirst ile create arasında aynı yönde kayıt oluştu.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      ) {
        throw new ConflictException("Bu firmaya zaten istek gönderdiniz");
      }
      throw e;
    }
    // INV-AUDIT-1 (dalga 3): bağlantı isteği = ilişki olayı, uyuşmazlıkta delil.
    // Commit sonrası, bildirimden önce. Para/yetki değil → non-critical.
    await this.audit.log({
      action: "company.connection.requested",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_connection",
      entityId: conn.id,
      metadata: {
        inviterCompanyId: user.companyId,
        inviteeCompanyId: target.id,
        origin,
      },
    });
    // Hedef firmaya in-app haber ver (tercihe tabi değil — bilinmeyen tip açık).
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    void this.notifications
      .pushToCompany(target.id, {
        type: "connection_request",
        // Yetki tablosu: bağlantı işi "Bağlantılar" tikine (onaylayıcı-only almaz).
        audience: ["connections:manage"],
        title: "Yeni bağlantı isteği",
        body: `${me?.name ?? "Bir firma"} sizinle bağlantı kurmak istiyor. Bağlantılar sayfasındaki Gelen İstekler'den yanıtlayabilirsiniz.`,
      })
      .catch((err) =>
        this.logger.warn(
          `Bağlantı isteği bildirimi gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    // E-posta kanalı (in-app'e paralel) — hedef firma uygulamada değilse kaçırmasın.
    void this.emailCompany(
      target.id,
      "Yeni bağlantı isteği",
      [
        "Merhaba,",
        `${me?.name ?? "Bir firma"} sizinle bağlantı kurmak istiyor. Rothern'de Bağlantılar → Gelen İstekler'den yanıtlayabilirsiniz.`,
      ],
      "connection_request",
      conn.id,
    );
    return { id: conn.id, status: conn.status, targetName: target.name };
  }

  /** Firmanın bildirim e-postasına (billingEmail → ilk aktif kullanıcı) bildirim
   *  şablonuyla e-posta. Best-effort. */
  private async emailCompany(
    companyId: string,
    subject: string,
    paragraphs: string[],
    type: string,
    contextId: string,
  ) {
    try {
      const c = await this.prisma.company.findUnique({
        where: { id: companyId },
        select: {
          name: true,
          billingEmail: true,
          users: {
            where: { isActive: true, deletedAt: null },
            select: { email: true, firstName: true, lastName: true },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
      });
      const email = c?.billingEmail || c?.users[0]?.email;
      if (!c || !email) return;
      const name = c.users[0]
        ? `${c.users[0].firstName} ${c.users[0].lastName}`.trim() || c.name
        : c.name;
      const baseUrl =
        resolveWebUrl(this.config);
      await this.email.send({
        to: { email, name },
        subject,
        templateData: {
          template: "notification",
          data: {
            subject,
            heading: subject,
            paragraphs,
            ctaLabel: "Rothern'e Git",
            ctaUrl: `${baseUrl}/company`,
          },
        },
        context: { type, id: contextId },
      });
    } catch (err) {
      this.logger.warn(
        `Bağlantı e-postası gönderilemedi (${companyId}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }


  /** Gönderdiğim bekleyen bağlantı istekleri (iptal edilebilir). */
  async listOutgoing(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: { inviterCompanyId: companyId, status: "PENDING" },
      include: {
        invitee: { select: { id: true, name: true, rothernId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      connectionId: r.id,
      company: r.invitee,
      createdAt: r.createdAt,
    }));
  }

  /** Bekleyen e-posta davetini iptal et (kayıt olunca bağ kurulmaz). */
  async cancelReferralInvite(user: AuthenticatedCompanyUser, id: string) {
    const res = await this.prisma.companyReferralInvite.deleteMany({
      where: { id, inviterCompanyId: user.companyId, status: "PENDING" },
    });
    if (res.count === 0) throw new NotFoundException("Davet bulunamadı");
    return { ok: true };
  }

  /** Bana gelen bekleyen davetler. */
  async listIncoming(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: { inviteeCompanyId: companyId, status: "PENDING" },
      include: {
        inviter: { select: { id: true, name: true, rothernId: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return rows.map((r) => ({
      connectionId: r.id,
      company: r.inviter,
      createdAt: r.createdAt,
    }));
  }

  /**
   * Aktif bağlantılarım (her iki yön — karşı firmayı döner).
   * Bağlantı, onu KURAN (davet eden) taraf PAKET kaldığı sürece aktif sayılır —
   * PREMIUM ve INVITE için (premium bitince pasifleşir, silinmez). ADMIN hariç
   * (platform kararı, hep açık). Böylece bir kez premium olup bol davet atarak
   * kalıcı bedava bağlantı ağı tutulamaz.
   */
  async list(companyId: string) {
    const rows = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { inviterCompanyId: companyId },
          { inviteeCompanyId: companyId },
        ],
      },
      include: {
        inviter: { select: COMPANY_CARD_SELECT },
        invitee: { select: COMPANY_CARD_SELECT },
      },
      orderBy: { decidedAt: "desc" },
    });
    // Kart zenginleştirme (v2 6f): yayındaki ürünlerden ilk 3 küçük resim +
    // toplam — TEK sorgu, firma başına gruplanır (N+1 yok). Kapı vitrinle
    // aynı (`publicProductWhere`): profilde görünmeyen ürün kartta da yok.
    const otherIds = rows.map((r) =>
      r.inviterCompanyId === companyId ? r.inviteeCompanyId : r.inviterCompanyId,
    );
    const products = otherIds.length
      ? await this.prisma.companyItem.findMany({
          where: { ...publicProductWhere(), companyId: { in: otherIds } },
          select: { companyId: true, images: true },
          orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
        })
      : [];
    const preview = new Map<string, { thumbnails: string[]; total: number }>();
    for (const p of products) {
      const e = preview.get(p.companyId) ?? { thumbnails: [], total: 0 };
      e.total += 1;
      if (e.thumbnails.length < 3 && p.images[0]) e.thumbnails.push(p.images[0]);
      preview.set(p.companyId, e);
    }
    return rows
      .filter(
        // Bağlantı, onu KURAN (davet eden) taraf PAKET kaldığı sürece aktif —
        // hem PREMIUM hem INVITE için (ADMIN hariç: platform kararı, hep açık).
        // Ödemeyi bırakınca kendi başlattığın ağı kaybedersin; açık kalan tek
        // pencere hâlâ ödeyen birinin seni davet ettiği bağlantılardır.
        // INV-TIER-1: EFEKTİF tier (CL:connectedCompanyIds ile BİREBİR) — süresi
        // dolmuş inviter'ın bağlantısı bayat PAKET ile aktif görünmesin.
        (r) =>
          r.origin === "ADMIN" ||
          tierAtLeast(
            effectiveTier(r.inviter.tier, r.inviter.membershipEndAt),
            "BRONZ",
          ),
      )
      .map((r) => {
        const other = r.inviterCompanyId === companyId ? r.invitee : r.inviter;
        const contact = other.users[0] ?? null;
        return {
          connectionId: r.id,
          origin: r.origin,
          company: {
            id: other.id,
            name: other.name,
            rothernId: other.rothernId,
            // INV-TIER-1: gösterilen tier rozeti efektif (süresi-dolmuş PAKET
            // paketli göstermesin).
            tier: effectiveTier(other.tier, other.membershipEndAt),
            taxNumber: other.taxNumber,
            city: other.city,
            country: other.country,
            industry: other.industry,
            contactName: contact
              ? `${contact.firstName} ${contact.lastName}`.trim()
              : null,
            contactEmail: contact?.email ?? null,
            logoUrl: other.logoUrl,
            verified: other.companyVerificationStatus === "VERIFIED",
            activities: other.activities,
            productPreview: preview.get(other.id) ?? null,
          },
          decidedAt: r.decidedAt,
        };
      });
  }

  /**
   * Keşfet — bağlanılacak firmaları kategori-eşleşmesine göre sıralı listeler.
   * Sadece PAKET keşfedebilir; yalnızca PAKET (görünür) firmalar çıkar.
   * Skor: (ben alırım ∩ o satar) + (ben satarım ∩ o alır). Bağlı/davetli hariç.
   */
  async discover(user: AuthenticatedCompanyUser) {
    if (!tierAtLeast(user.tier, "BRONZ")) {
      return { locked: true as const, companies: [] };
    }
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { buyerCategoryIds: true, sellerCategoryIds: true },
    });
    const myBuyer = new Set(me?.buyerCategoryIds ?? []);
    const mySeller = new Set(me?.sellerCategoryIds ?? []);

    // Mevcut bağlantı/davet olan firmaları çıkar.
    const conns = await this.prisma.companyConnection.findMany({
      where: {
        OR: [
          { inviterCompanyId: user.companyId },
          { inviteeCompanyId: user.companyId },
        ],
      },
      select: { inviterCompanyId: true, inviteeCompanyId: true },
    });
    const exclude = new Set<string>([user.companyId]);
    for (const c of conns) {
      exclude.add(c.inviterCompanyId);
      exclude.add(c.inviteeCompanyId);
    }
    // Engellenenler (iki yön) keşifte görünmez.
    for (const id of await this.blocks.blockedCompanyIds(user.companyId)) {
      exclude.add(id);
    }

    const companies = await this.prisma.company.findMany({
      where: {
        // INV-TIER-1: efektif PAKET (keşifte süresi-dolmuş PAKET aday çıkmasın).
        ...anyPackageWhere(),
        isActive: true,
        isBlocked: false,
        id: { notIn: [...exclude] },
      },
      select: {
        id: true,
        name: true,
        rothernId: true,
        industry: true,
        activities: true,
        createdAt: true,
        buyerCategoryIds: true,
        sellerCategoryIds: true,
      },
      take: 100,
    });

    // İLGİ SKORU (ilgi motoru Faz 3).
    //
    // Eski skor BEYAN kesişiminin ham sayısıydı: "kaç segmentimiz ortak".
    // 38 kova için bu neredeyse gürültü — hem çok kutu işaretleyen firmayı
    // ödüllendiriyordu (genişlik cezası yok), hem de firmanın o alanda
    // gerçekten iş yapıp yapmadığına bakmıyordu.
    const myBuyCats = [...myBuyer];
    const mySellCats = [...mySeller];
    const affRows =
      myBuyCats.length + mySellCats.length > 0
        ? await this.prisma.companyAffinity.findMany({
            where: {
              companyId: { in: companies.map((c) => c.id) },
              categoryId: { in: [...new Set([...myBuyCats, ...mySellCats])] },
            },
            select: {
              companyId: true,
              categoryId: true,
              sellScore: true,
              buyScore: true,
              reasons: true,
            },
          })
        : [];

    const buySet = new Set(myBuyCats);
    const sellSet = new Set(mySellCats);
    const best = new Map<string, { score: number; reasons: unknown }>();
    for (const r of affRows) {
      // "Bana ne satabilir" + "benden ne alabilir" — iki yön toplanır.
      const v =
        (buySet.has(r.categoryId) ? r.sellScore : 0) +
        (sellSet.has(r.categoryId) ? r.buyScore : 0);
      const cur = best.get(r.companyId);
      if (!cur || v > cur.score) best.set(r.companyId, { score: v, reasons: r.reasons });
    }

    // GERİ DÜŞÜŞ: ilgi profili hiç hesaplanmamışsa (ilk dağıtım, gece cron'u
    // henüz koşmamış, tablo yeni sıfırlanmış) skorların HEPSİ 0 olur ve
    // sıralama tamamen ölür. Böyle bir durumda eski BEYAN kesişimine düşülür —
    // zayıf bir sinyal ama sıfırdan iyi. Listeler tarafındaki @Optional
    // davranışının karşılığı: istatistik katmanı yoksa akış eski hâline döner.
    const affinityReady = best.size > 0;

    const enriched = companies.map((c) => {
      const hit = best.get(c.id);
      const declaredOverlap =
        c.sellerCategoryIds.filter((x) => buySet.has(x)).length +
        c.buyerCategoryIds.filter((x) => sellSet.has(x)).length;
      return {
        id: c.id,
        name: c.name,
        rothernId: c.rothernId,
        industry: c.industry,
        activities: c.activities,
        createdAt: c.createdAt,
        matchScore: affinityReady
          ? Number((hit?.score ?? 0).toFixed(2))
          : declaredOverlap,
        matchReason: affinityReady
          ? affinityReasonTextThirdParty((hit?.reasons ?? null) as never)
          : declaredOverlap > 0
            ? "Faaliyet alanlarında işaretli"
            : null,
      };
    });

    const ranked = [...enriched].sort((a, b) => b.matchScore - a.matchScore);

    // %20 KEŞİF KOTASI — "zengin daha zengin" freni.
    //
    // Salt skorla sıralarsan ilk kazanan hep önerilir, hep kazanır ve yeni
    // tedarikçi ASLA görünmez; pazar yeri kapalı bir kulübe döner ve alıcı da
    // kaybeder (rekabet azalır). Sonuçların beşte biri, skoru düşük ama YENİ
    // firmalara ayrılır — soğuk başlangıcı yapısal olarak taşır.
    const QUOTA = 0.2;
    const keep = Math.max(1, Math.ceil(ranked.length * (1 - QUOTA)));
    const head = ranked.slice(0, keep);
    const headIds = new Set(head.map((c) => c.id));
    const discovery = enriched
      .filter((c) => !headIds.has(c.id))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, Math.max(0, ranked.length - keep))
      .map((c) => ({ ...c, discovery: true as const }));

    const scored = [...head.map((c) => ({ ...c, discovery: false as const })), ...discovery].map(
      // createdAt yalnız kota hesabı içindi — dışarı sızmasın.
      ({ createdAt, ...rest }) => rest,
    );

    return { locked: false as const, companies: scored };
  }

  /** Firma id'leri için bağlantı durumu haritası (kart/profil için). */
  private async connectionStatusMap(
    companyId: string,
    otherIds: string[],
  ): Promise<Map<string, "active" | "pending" | "incoming">> {
    const m = new Map<string, "active" | "pending" | "incoming">();
    if (otherIds.length === 0) return m;
    const conns = await this.prisma.companyConnection.findMany({
      where: {
        OR: [
          { inviterCompanyId: companyId, inviteeCompanyId: { in: otherIds } },
          { inviterCompanyId: { in: otherIds }, inviteeCompanyId: companyId },
        ],
      },
      select: {
        inviterCompanyId: true,
        inviteeCompanyId: true,
        status: true,
      },
    });
    for (const c of conns) {
      const other =
        c.inviterCompanyId === companyId
          ? c.inviteeCompanyId
          : c.inviterCompanyId;
      m.set(
        other,
        c.status === "ACTIVE"
          ? "active"
          : c.inviteeCompanyId === companyId
            ? "incoming"
            : "pending",
      );
    }
    return m;
  }

  /** Firma dizini araması — public profilli (PAKET) aktif firmalar. */
  /**
   * PANEL FİRMA DİZİNİ — herkese açık `/firmalar` ile AYNI kaynak
   * (`common/company/company-directory.ts`): aynı listelenme koşulu, aynı
   * kart. Üyeye ek: Rothern ID + bağlantı durumu. Kendisi ve engelledikleri
   * hariç. Görüntülemek ÜCRETSİZ (2026-09-04): eskiden STANDART boş alıyordu
   * — anonim ziyaretçinin gördüğü dizini ücretsiz üye göremiyordu. Ücretli
   * olan LİSTELENMEK (publicEnabled + PAKET), görmek değil.
   */
  async searchCompanies(
    user: AuthenticatedCompanyUser,
    qRaw?: string,
    q: Omit<DirectoryParams, "q"> = {},
  ) {
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    const res = await buildDirectory(
      this.prisma,
      { ...q, q: (qRaw ?? "").trim() || undefined },
      { excludeIds: [user.companyId, ...blockedIds] },
    );
    const statusMap = await this.connectionStatusMap(user.companyId, res.items.map((r) => r.id));
    return {
      ...res,
      items: res.items.map(({ id, ...card }) => ({
        ...card,
        connectionStatus: statusMap.get(id) ?? ("none" as const),
      })),
    };
  }

  /** Dizin süzgeç sayaçları (panel) — public ile aynı küme. */
  async searchFacets(user: AuthenticatedCompanyUser) {
    const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
    return directoryFacets(this.prisma, { excludeIds: [user.companyId, ...blockedIds] });
  }

  /**
   * Herkese açık firma profili + bağlantı durumu + AÇIK ihaleleri.
   * Görünürlük getOne ile birebir: PUBLIC herkese; CONNECTIONS yalnız bağlıya;
   * PRIVATE yalnız o ilana DAVETLİYE (bağlı olmak davetli olmak değildir).
   */
  async getProfile(user: AuthenticatedCompanyUser, rothernIdRaw: string) {
    // Adres ya rothernId (`K7X9-3M2P`) ya da public profil slug'ıdır. İkisi
    // biçim olarak ayrık (kısa kod kalıbı vs kebab-case) → belirsizlik yok.
    // Slug kabul etmek ŞART: panel içi ürün sayfası ürünü slug'la çözüyor ve
    // "firmayla iletişime geç" bağlantısı panelden çıkmamalı; slug'ı burada
    // reddetseydik o bağlantı yine herkese açık sayfaya kaçardı.
    const code = normalizeShortCode(rothernIdRaw);
    const slug = rothernIdRaw.trim().toLowerCase();
    // Biçim yalnız SIRAYI belirler, tek denemeyi değil: kısa kod kalıbına
    // uyan bir slug ("star-4x4z") ya da tersi, tek dallı bir çözümde sessizce
    // 404 verirdi. İkinci sorgu YALNIZ ıskalayınca koşar — o dal zaten 404'e
    // gidiyordu, maliyeti yok.
    const select = {
      id: true,
      rothernId: true,
      slug: true,
      name: true,
      industry: true,
      city: true,
      country: true,
      logoUrl: true,
      coverImageUrl: true,
      aboutText: true,
      services: true,
      certifications: true,
      photos: true,
      certificateImages: true,
      foundedYear: true,
      employeeCount: true,
      website: true,
      linkedinUrl: true,
      instagramUrl: true,
      publicEnabled: true,
      isActive: true,
      isBlocked: true,
      tier: true,
      activities: true,
      sellerCategoryIds: true,
      buyerCategoryIds: true,
      companyVerificationStatus: true,
      membershipEndAt: true, // INV-TIER-1: effectiveTier hesabı için
      // Kamuya açık ticari sicil bilgileri (tüzel kişi verisi — KVKK dışı).
      // IBAN / yetkili TCKN / fatura iletişimi ASLA buraya girmez.
      legalName: true,
      taxNumber: true,
      taxOffice: true,
      mersisNo: true,
      tradeRegistryNo: true,
      kepAddress: true,
    } as const;
    const looksLikeCode = validateShortCode(code);
    const c =
      (await this.prisma.company.findFirst({
        where: looksLikeCode ? { rothernId: code } : { slug },
        select,
      })) ??
      (await this.prisma.company.findFirst({
        where: looksLikeCode ? { slug } : { rothernId: code },
        select,
      }));
    // Admin-bloklu firma dizin/doğrudan-id yolundan da görünmez (arama zaten
    // filtreliyor; doğrudan rothernId erişimi bu filtreyi atlıyordu).
    if (!c || !c.isActive || c.isBlocked) {
      throw new NotFoundException("Firma profili bulunamadı");
    }
    const isSelf = c.id === user.companyId;
    if (!isSelf) {
      const blockedIds = await this.blocks.blockedCompanyIds(user.companyId);
      if (blockedIds.includes(c.id)) {
        throw new NotFoundException("Firma profili bulunamadı");
      }
    }
    const conn = isSelf
      ? null
      : await this.prisma.companyConnection.findFirst({
          where: {
            OR: [
              { inviterCompanyId: user.companyId, inviteeCompanyId: c.id },
              { inviterCompanyId: c.id, inviteeCompanyId: user.companyId },
            ],
          },
          select: { id: true, status: true, inviteeCompanyId: true },
        });
    const connectionStatus = isSelf
      ? ("self" as const)
      : !conn
        ? ("none" as const)
        : conn.status === "ACTIVE"
          ? ("active" as const)
          : conn.inviteeCompanyId === user.companyId
            ? ("incoming" as const)
            : ("pending" as const);
    const connectionId = conn?.id ?? null;
    const connected = connectionStatus === "active" || isSelf;
    // Ziyaret Edenler: üye başkasının profilini açtı — kimlikli görüntülenme
    // (erişim denetimlerinden SONRA; fire-and-forget, okumayı düşürmez).
    if (!isSelf) void this.views?.recordPanelView(user, { companyId: c.id });

    // Görünürlük kuralı:
    // - İlişkili (kendisi / bağlı / bekleyen / gelen istek) → her zaman görür.
    // - Aksi halde "herkese açık" profil: `hasPublicProfile` — /firma/<slug>
    //   ile AYNI kapı. İzleyenin paketi ARANMAZ (2026-09-04): anonim ziyaretçi
    //   profili görüyorken ücretsiz üyeye 404 vermek tutarsızdı. STANDART
    //   HEDEF firma (paketsiz) yine yalnız bağlantılarına görünür.
    const related = isSelf || connectionStatus !== "none";
    // `hasPublicProfile` eksi slug şartı: panel rothernId ile de açar, slug
    // yalnız herkese açık URL için gerekir.
    const publiclyListed =
      c.publicEnabled &&
      tierAtLeast(effectiveTier(c.tier, c.membershipEndAt), "BRONZ");
    if (!related && !publiclyListed) {
      throw new NotFoundException("Firma profili bulunamadı");
    }

    const [listings, reviewRows, products, productCount, catRows] = await Promise.all([
      this.prisma.listing.findMany({
        where: {
          companyId: c.id,
          status: "OPEN",
          // F-CONN-1: görünürlük TEK KAYNAK (getOne ile birebir) — PUBLIC +
          // bağlıysa CONNECTIONS + DAVETLİYSE PRIVATE. Eski `connected ? {}`
          // bağlı firmaya davet-only PRIVATE ihaleleri sızdırıyordu.
          // Denetim 2026-08-23 P2 #9: açılış embargosu (bidsOpenAt gelecekte →
          // yalnız teklifi olan görür; NOT(gt) NULL tuzağı yok) + ülke kapsamı
          // (getOne/sellerTenders ile aynı). Kendi profili hariç.
          AND: [
            visibleOwnerListingWhere(user.companyId, connected),
            ...(c.id === user.companyId
              ? []
              : [
                  {
                    OR: [
                      { bidsOpenAt: null },
                      { bidsOpenAt: { lte: new Date() } },
                      { bids: { some: { bidderCompanyId: user.companyId } } },
                    ],
                  },
                  {
                    OR: [
                      ...(c.country === user.country ? [{ isInternational: false }] : []),
                      {
                        isInternational: true,
                        OR: [
                          { targetCountries: { isEmpty: true } },
                          { targetCountries: { has: user.country } },
                        ],
                      },
                      { invitations: { some: { invitedCompanyId: user.companyId } } },
                    ],
                  },
                ]),
          ],
        },
        select: {
          id: true,
          number: true,
          type: true,
          format: true,
          title: true,
          status: true,
          createdAt: true,
          closesAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      // 2026-08-22: firma bazında gruplu özet — platform içi: ad yalnız
      // değerlendirenin opt-in'iyle (showName), aksi "Doğrulanmış alıcı/tedarikçi".
      this.prisma.companyReview.findMany({
        where: { targetCompanyId: c.id },
        select: REVIEW_SUMMARY_SELECT,
        orderBy: { createdAt: "desc" },
        take: REVIEW_SUMMARY_TAKE,
      }),
      // ÜRÜNLER — herkese açık profildeki ızgarayla AYNI kapı ve sıra
      // (`publicProductWhere`); üye katmanı fiyatı da görür.
      this.prisma.companyItem.findMany({
        where: { ...publicProductWhere(), companyId: c.id },
        select: PRODUCT_INDEX_SELECT,
        orderBy: [{ completionScore: "desc" }, { publishedAt: "desc" }],
        take: 24,
      }),
      this.prisma.companyItem.count({ where: { ...publicProductWhere(), companyId: c.id } }),
      this.prisma.category.findMany({
        where: { id: { in: [...c.sellerCategoryIds, ...c.buyerCategoryIds].filter(isCategoryCode).slice(0, 12) } },
        select: { id: true, nameTr: true },
      }),
    ]);
    const reviewSummary = buildReviewSummary(reviewRows, { revealNames: true });
    const catName = new Map(catRows.map((r) => [r.id, r.nameTr]));
    const categories = [...new Set([...c.sellerCategoryIds, ...c.buyerCategoryIds])]
      .filter((id) => catName.has(id))
      .map((id) => ({ id, name: catName.get(id) as string }));

    return {
      profile: {
        rothernId: c.rothernId,
        slug: c.slug,
        name: c.name,
        // Faz T: "Gold Üye" rozeti (adlandırma bilinçli — güven iddiası taşımaz).
        goldMember:
          effectiveTier(c.tier, c.membershipEndAt) === "GOLD",
        verified: c.companyVerificationStatus === "VERIFIED",
        industry: c.industry,
        activities: c.activities,
        categories,
        city: c.city,
        country: c.country,
        logoUrl: c.logoUrl,
        coverImageUrl: c.coverImageUrl,
        // Başka firmanın test verisi (anlamsız dizi) üyeye de gösterilmez —
        // public ile aynı düzyazı sezgisi; kendi profilinde ham kalır (düzeltsin).
        aboutText: isSelf || looksLikeProse(c.aboutText) ? c.aboutText : null,
        services: c.services,
        certifications: c.certifications,
        photos: c.photos,
        certificateImages: c.certificateImages,
        foundedYear: c.foundedYear,
        employeeCount: c.employeeCount,
        website: c.website,
        linkedinUrl: c.linkedinUrl,
        instagramUrl: c.instagramUrl,
        rating: { avg: reviewSummary.avg, count: reviewSummary.orders },
        reviewSummary,
        trade: {
          legalName: c.legalName,
          taxNumber: c.taxNumber,
          taxOffice: c.taxOffice,
          mersisNo: c.mersisNo,
          tradeRegistryNo: c.tradeRegistryNo,
          kepAddress: c.kepAddress,
        },
      },
      connectionStatus,
      connectionId,
      connected,
      listings,
      products: products.map(toProductIndexCard),
      productCount,
    };
  }

  /** Gelen daveti kabul et. */
  async accept(user: AuthenticatedCompanyUser, connectionId: string) {
    const conn = await this.requireIncoming(user.companyId, connectionId);
    // Atomik: ters-yön sarkan PENDING'i ÖNCE sil, SONRA ACTIVE yap — tek tx'te.
    // Sıra önemli: yön-bağımsız partial unique index (PENDING+ACTIVE) A→B ACTIVE
    // olurken B→A PENDING ile çakışırdı; önce silmek çakışmayı önler. Geçiş
    // koşullu (status=PENDING) kalır → reject/disconnect yarışında count=0.
    const updatedCount = await runTenantTx(this.prisma, async (tx) => {
      // Çapraz yarış temizliği: iki firma AYNI ANDA birbirine istek attıysa
      // ters yönde ikinci bir PENDING kayıt oluşmuş olabilir.
      await tx.companyConnection.deleteMany({
        where: {
          inviterCompanyId: user.companyId,
          inviteeCompanyId: conn.inviterCompanyId,
          status: "PENDING",
        },
      });
      const updated = await tx.companyConnection.updateMany({
        where: {
          id: conn.id,
          inviteeCompanyId: user.companyId,
          status: "PENDING",
        },
        data: { status: "ACTIVE", decidedAt: new Date() },
      });
      return updated.count;
    });
    if (updatedCount === 0) {
      throw new ConflictException("Davet zaten yanıtlanmış");
    }
    // INV-AUDIT-1 (dalga 3): kabul = ilişki kuruldu, uyuşmazlıkta delil.
    await this.audit.log({
      action: "company.connection.accepted",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_connection",
      entityId: conn.id,
      metadata: {
        inviterCompanyId: conn.inviterCompanyId,
        inviteeCompanyId: user.companyId,
      },
    });
    // Davet eden firmaya haber ver.
    const me = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true },
    });
    void this.notifications
      .pushToCompany(conn.inviterCompanyId, {
        type: "connection_accepted",
        audience: ["connections:manage"],
        title: "Bağlantı isteğiniz kabul edildi",
        body: `${me?.name ?? "Bir firma"} bağlantı isteğinizi kabul etti — artık birbirinizin bağlantılara açık satın alma taleplerini görebilirsiniz.`,
      })
      .catch((err) =>
        this.logger.warn(
          `Bağlantı kabul bildirimi gönderilemedi: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
    void this.emailCompany(
      conn.inviterCompanyId,
      "Bağlantı isteğiniz kabul edildi",
      [
        "Merhaba,",
        `${me?.name ?? "Bir firma"} bağlantı isteğinizi kabul etti — artık birbirinizin bağlantılara açık satın alma taleplerini görebilirsiniz.`,
      ],
      "connection_accepted",
      conn.id,
    );
    return { ok: true };
  }

  /** Gelen daveti reddet (kaydı sil) — durum guard'lı atomik silme. */
  async reject(user: AuthenticatedCompanyUser, connectionId: string) {
    // requireIncoming dönüşünü tut → audit için karşı taraf (inviter) id'si.
    const conn = await this.requireIncoming(user.companyId, connectionId);
    const res = await this.prisma.companyConnection.deleteMany({
      where: {
        id: connectionId,
        inviteeCompanyId: user.companyId,
        status: "PENDING",
      },
    });
    if (res.count === 0) {
      throw new ConflictException("Davet zaten yanıtlanmış");
    }
    // INV-AUDIT-1 (dalga 3): ret = ilişki reddi, uyuşmazlıkta delil.
    await this.audit.log({
      action: "company.connection.rejected",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_connection",
      entityId: connectionId,
      metadata: {
        inviterCompanyId: conn.inviterCompanyId,
        inviteeCompanyId: user.companyId,
      },
    });
    return { ok: true };
  }

  /** Bağlantıyı kopar — taraflardan biri ilişkiyi siler (kaydı kaldırır). */
  async disconnect(user: AuthenticatedCompanyUser, connectionId: string) {
    // Audit için karşı taraf id'sini deleteMany öncesi yakala (deleteMany satır
    // döndürmez). Yalnız loglama amaçlı — silme kararı hâlâ atomik count'a bağlı.
    const before = await this.prisma.companyConnection.findUnique({
      where: { id: connectionId },
      select: { inviterCompanyId: true, inviteeCompanyId: true },
    });
    // Atomik deleteMany (sahiplik koşullu): çift-disconnect yarışında ikinci
    // çağrı count=0 alır — findUnique+delete'in P2025 (yakalanmamış 500) yerine.
    const res = await this.prisma.companyConnection.deleteMany({
      where: {
        id: connectionId,
        OR: [
          { inviterCompanyId: user.companyId },
          { inviteeCompanyId: user.companyId },
        ],
      },
    });
    if (res.count === 0) {
      throw new NotFoundException("Bağlantı bulunamadı");
    }
    // INV-AUDIT-1 (dalga 3): bağlantı koparma, uyuşmazlıkta delil. Karşı taraf =
    // aktörün firması hangi tarafsa diğeri (before yarışta null olabilir).
    const counterparty =
      before && before.inviterCompanyId === user.companyId
        ? before.inviteeCompanyId
        : before?.inviterCompanyId ?? null;
    await this.audit.log({
      action: "company.connection.disconnected",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_connection",
      entityId: connectionId,
      metadata: {
        actorCompanyId: user.companyId,
        counterpartyCompanyId: counterparty,
      },
    });
    return { ok: true };
  }

  private async requireIncoming(companyId: string, connectionId: string) {
    const conn = await this.prisma.companyConnection.findUnique({
      where: { id: connectionId },
      select: {
        id: true,
        inviterCompanyId: true,
        inviteeCompanyId: true,
        status: true,
      },
    });
    if (!conn || conn.inviteeCompanyId !== companyId) {
      throw new NotFoundException("Davet bulunamadı");
    }
    if (conn.status !== "PENDING") {
      throw new ConflictException("Davet zaten yanıtlanmış");
    }
    return conn;
  }
}
