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
import * as crypto from "node:crypto";
import { CompanyRole, Prisma } from "@rothern/db";
import { SEAT_LIMITS, SEAT_ROLES } from "@rothern/shared";
import { effectiveTier } from "../../common/company/effective-tier";
import { PrismaService } from "../../common/prisma/prisma.service";
import { runTenantTx } from "../../common/prisma/tenant-tx";
import { AuditService } from "../audit/audit.service";
import { CompanyAuthService } from "../company-auth/services/company-auth.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import {
  ALL_COMPANY_PERMISSIONS,
  type CompanyPermissionOverride,
  hasManagementRole,
  permissionsForRoles,
} from "../company-auth/permissions/company-permissions.constants";
import { EmailService } from "../email/email.service";
import { NotificationService } from "../notifications/notification.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
import { resolveWebUrl } from "../../common/config/web-url";
import {
  AcceptCompanyInvitationDto,
  InviteCompanyUserDto,
  UpdateUserPermissionsDto,
  UpdateUserRolesDto,
} from "./dto/company-user.dto";

/** Davet linki geçerlilik süresi (eski sistemle aynı). */
const INVITATION_TTL_DAYS = 7;

/**
 * INV-AUDIT-1 (denial): son-yönetici garantisi tetiklendiğinde fırlatılır.
 * `BadRequestException` alt-sınıfı → dışarıya aynı 400 + aynı mesaj (davranış
 * değişmez). Sentinel olması, tx İÇİNDE atılan bu hatayı çağrı yerinde
 * `instanceof` ile ayırt edip (string eşleşmeye gerek yok) tx abort'undan
 * SONRA denial audit yazmamızı sağlar — tx içinde yazsak rollback silerdi.
 */
class LastActiveAdminError extends BadRequestException {
  constructor() {
    super("Firmada en az bir aktif yönetim yetkilisi (Kurucu/Yönetici) kalmalı");
  }
}

const ROLE_LABEL: Record<CompanyRole, string> = {
  SAHIP: "Kurucu",
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

@Injectable()
export class CompanyUsersService {
  private readonly logger = new Logger(CompanyUsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly companyAuth: CompanyAuthService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    // Faz K: seat-selection bildirimi — @Optional: elle kurulan test rig'leri
    // 6-parametreli kalabilir (push best-effort, yoksa sessiz atlanır).
    @Optional() private readonly notifications?: NotificationService,
  ) {}

  async list(companyId: string) {
    const [users, company] = await Promise.all([
      this.prisma.companyUser.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.company.findUnique({
        where: { id: companyId },
        select: { ownerUserId: true },
      }),
    ]);
    return users.map((u) => {
      const override =
        (u.permissionsOverride as CompanyPermissionOverride | null) ?? null;
      return {
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        roles: u.roles,
        isOwner: company?.ownerUserId === u.id,
        isActive: u.isActive,
        lastLoginAt: u.lastLoginAt,
        // Rol-varsayılan izinleri + override (UI toggle hesabı için).
        rolePermissions: [...permissionsForRoles(u.roles)],
        permissionsOverride: {
          added: override?.added ?? [],
          removed: override?.removed ?? [],
        },
      };
    });
  }

  // ============================================================
  // DAVET — token'lı davet-kabul akışı. Hesap davetle DEĞİL kabulle açılır:
  // kullanıcı adını/parolasını kendisi belirler, sözleşmeleri kendisi onaylar.
  // ============================================================

  /** Ekibe davet gönder — 7 gün geçerli tek kullanımlık kabul linki e-postalanır. */
  async invite(actor: AuthenticatedCompanyUser, dto: InviteCompanyUserDto) {
    const roles = dto.roles as CompanyRole[];
    // Sahiplik davetle verilemez — mevcut bir kullanıcıya devir ile aktarılır.
    if (roles.includes("SAHIP")) {
      throw new BadRequestException(
        "Kuruculuk davetle verilemez; mevcut bir kullanıcıya devredin",
      );
    }
    this.assertValidRoleCombo(roles);
    // Davet yolu da güncelleme yolu gibi rol-verme kontrolünü uygulamalı:
    // admin OLMAYAN (users:manage override'lı) bir kullanıcı, davetle YONETICI/
    // ONAYLAYICI atayıp kendine admin suç ortağı üretemesin.
    this.assertCanGrantRoles(actor, roles);
    // Faz K: SA/ST daveti koltuk kontrolünden geçer — bekleyen SA/ST davetleri
    // de sayılır (davet-yağmuruyla aşım kapalı). Danışma kontrolü; asıl
    // yarış-güvenli kapı kabulde (tx + FOR UPDATE).
    if (this.rolesConsumeSeat(roles)) {
      await this.assertSeatAvailable(this.prisma, actor.companyId, {
        includePending: true,
        context: "invite",
      });
    }
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.companyUser.findUnique({
      where: { email },
      select: { id: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException("Bu e-posta zaten kayıtlı");
    }
    const pending = await this.prisma.companyUserInvitation.findFirst({
      where: {
        companyId: actor.companyId,
        email,
        status: "PENDING",
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });
    if (pending) {
      throw new ConflictException(
        "Bu e-postaya bekleyen bir davet zaten var — gerekirse yeniden gönderin",
      );
    }

    const inv = await this.prisma.companyUserInvitation.create({
      data: {
        companyId: actor.companyId,
        email,
        roles: dto.roles as CompanyRole[],
        token: crypto.randomBytes(32).toString("hex"),
        expiresAt: new Date(
          Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
        ),
        invitedById: actor.userId,
      },
    });
    await this.sendInvitationEmail(inv.id);
    return { id: inv.id, email: inv.email, expiresAt: inv.expiresAt };
  }

  /** Bekleyen (ve süresi geçmiş) davetler — süresi dolanlar okumada EXPIRED'a çekilir. */
  async listInvitations(companyId: string) {
    await this.prisma.companyUserInvitation.updateMany({
      where: { companyId, status: "PENDING", expiresAt: { lte: new Date() } },
      data: { status: "EXPIRED" },
    });
    const rows = await this.prisma.companyUserInvitation.findMany({
      where: { companyId, status: { in: ["PENDING", "EXPIRED"] } },
      orderBy: { createdAt: "desc" },
    });
    const inviterIds = [...new Set(rows.map((r) => r.invitedById))];
    const inviters = await this.prisma.companyUser.findMany({
      where: { id: { in: inviterIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const nameOf = new Map(
      inviters.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      roles: r.roles,
      status: r.status,
      expiresAt: r.expiresAt,
      invitedByName: nameOf.get(r.invitedById) ?? "—",
      createdAt: r.createdAt,
    }));
  }

  async cancelInvitation(actor: AuthenticatedCompanyUser, id: string) {
    const res = await this.prisma.companyUserInvitation.updateMany({
      where: {
        id,
        companyId: actor.companyId,
        status: { in: ["PENDING", "EXPIRED"] },
      },
      data: { status: "CANCELLED" },
    });
    if (res.count === 0) throw new NotFoundException("Davet bulunamadı");
    return { ok: true };
  }

  /** Daveti yeniden gönder — token yenilenir, süre uzar (EXPIRED da canlanır). */
  async resendInvitation(actor: AuthenticatedCompanyUser, id: string) {
    const inv = await this.prisma.companyUserInvitation.findFirst({
      where: { id, companyId: actor.companyId },
    });
    if (!inv || (inv.status !== "PENDING" && inv.status !== "EXPIRED")) {
      throw new NotFoundException("Davet bulunamadı");
    }
    await this.prisma.companyUserInvitation.update({
      where: { id: inv.id },
      data: {
        status: "PENDING",
        token: crypto.randomBytes(32).toString("hex"),
        expiresAt: new Date(
          Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
        ),
      },
    });
    await this.sendInvitationEmail(inv.id);
    return { ok: true };
  }

  /** Davet önizleme (public) — kabul sayfası firma+rol gösterir. */
  async getInvitationByToken(token: string) {
    const inv = await this.requireUsableInvitation(token);
    return {
      email: inv.email,
      roles: inv.roles,
      companyName: inv.company.name,
      expiresAt: inv.expiresAt,
    };
  }

  /**
   * Davet kabulü (public) — kullanıcı kendi ad/parola/sözleşmeleriyle hesabını
   * açar, davet ACCEPTED olur, oturum döner. Supabase user'ı DB tx patlarsa
   * kompanse edilir (orphan kalmaz).
   */
  async acceptInvitation(token: string, dto: AcceptCompanyInvitationDto) {
    const inv = await this.requireUsableInvitation(token);
    if (!inv.company.isActive || inv.company.isBlocked) {
      throw new BadRequestException("Firma hesabı aktif değil");
    }
    const existing = await this.prisma.companyUser.findUnique({
      where: { email: inv.email },
      select: { id: true, deletedAt: true },
    });
    if (existing && !existing.deletedAt) {
      throw new ConflictException("Bu e-posta ile zaten bir hesap var");
    }

    const { authId } = await this.supabaseAuth.createUser(
      inv.email,
      dto.password,
      { type: "company" },
    );
    const now = new Date();
    let userId: string;
    try {
      userId = await runTenantTx(this.prisma, async (tx) => {
        // Faz K — TOCTOU kapısı: koltuk sayımı + kullanıcı yazımı AYNI kilitte.
        // Company satırı FOR UPDATE → iki eşzamanlı kabul serileşir; ikincisi
        // limiti aşmış görüp reddedilir. Ret → tx rollback → davet PENDING
        // kalır (upgrade sonrası yeniden kabul edilebilir); Supabase-user
        // telafisi dışarıdaki catch'te.
        await tx.$queryRaw`SELECT id FROM companies WHERE id = ${inv.companyId} FOR UPDATE`;
        if (this.rolesConsumeSeat(inv.roles as CompanyRole[])) {
          await this.assertSeatAvailable(tx, inv.companyId, {
            context: "accept",
          });
        }
        // Yarış: davet hâlâ PENDING mi? (çift kabul / bu arada iptal)
        const claimed = await tx.companyUserInvitation.updateMany({
          where: { id: inv.id, status: "PENDING" },
          data: { status: "ACCEPTED", acceptedAt: now },
        });
        if (claimed.count === 0) {
          throw new BadRequestException("Davet artık geçerli değil");
        }
        const u = await tx.companyUser.create({
          data: {
            email: inv.email,
            authId,
            firstName: dto.firstName.trim(),
            lastName: dto.lastName.trim(),
            phone: dto.phone?.trim() || null,
            roles: inv.roles,
            companyId: inv.companyId,
            // Davet linki e-postaya gitti — e-posta bu yolla doğrulanmış sayılır.
            emailVerifiedAt: now,
            invitedById: inv.invitedById,
            invitedAt: inv.createdAt,
            termsAcceptedAt: now,
            mediationAcceptedAt: now,
            kvkkAcceptedAt: now,
            marketingConsent: dto.marketingConsent ?? false,
            profileImprovementConsent: dto.profileImprovementConsent ?? false,
          },
        });
        return u.id;
      });
    } catch (e) {
      await this.supabaseAuth.deleteUser(authId);
      throw e;
    }
    return this.companyAuth.createSession(userId);
  }

  /** PENDING + süresi geçmemiş davet; süresi dolmuşsa anında EXPIRED'a çekilir. */
  private async requireUsableInvitation(token: string) {
    const inv = await this.prisma.companyUserInvitation.findUnique({
      where: { token },
      include: {
        company: { select: { name: true, isActive: true, isBlocked: true } },
      },
    });
    if (!inv) throw new NotFoundException("Davet bulunamadı");
    if (inv.status === "ACCEPTED") {
      throw new BadRequestException("Bu davet zaten kabul edilmiş");
    }
    if (inv.status === "CANCELLED") {
      throw new BadRequestException("Bu davet iptal edilmiş");
    }
    if (inv.status === "EXPIRED" || inv.expiresAt <= new Date()) {
      if (inv.status === "PENDING") {
        await this.prisma.companyUserInvitation.update({
          where: { id: inv.id },
          data: { status: "EXPIRED" },
        });
      }
      throw new BadRequestException(
        "Davetin süresi dolmuş — firmanızdan yeni davet isteyin",
      );
    }
    return inv;
  }

  private async sendInvitationEmail(invitationId: string) {
    const inv = await this.prisma.companyUserInvitation.findUnique({
      where: { id: invitationId },
      include: { company: { select: { name: true } } },
    });
    if (!inv) return;
    const inviter = await this.prisma.companyUser.findUnique({
      where: { id: inv.invitedById },
      select: { firstName: true, lastName: true },
    });
    const inviterName =
      `${inviter?.firstName ?? ""} ${inviter?.lastName ?? ""}`.trim() ||
      inv.company.name;
    const baseUrl = (
      resolveWebUrl(this.config)
    ).replace(/\/$/, "");
    const acceptUrl = `${baseUrl}/company/davet/${inv.token}`;
    try {
      await this.email.send({
        to: { email: inv.email },
        templateData: {
          template: "notification",
          data: {
            subject: `${inv.company.name} sizi ekibine davet ediyor`,
            heading: "Ekip Daveti",
            paragraphs: [
              `${inviterName}, sizi ${inv.company.name} firmasının ekibine katılmaya davet ediyor.`,
              "Daveti kabul ederken adınızı ve parolanızı kendiniz belirlersiniz.",
            ],
            infoRows: [
              { label: "Firma", value: inv.company.name },
              {
                label: "Rol",
                value: inv.roles.map((r) => ROLE_LABEL[r] ?? r).join(" + "),
              },
              {
                label: "Geçerlilik",
                value: `${INVITATION_TTL_DAYS} gün`,
              },
            ],
            ctaLabel: "Daveti Kabul Et",
            ctaUrl: acceptUrl,
            footerNote:
              "Bu daveti siz beklemiyorsanız e-postayı yok sayabilirsiniz.",
          },
        },
        context: { type: "company_user_invitation", id: inv.id },
      });
    } catch (err) {
      this.logger.error(
        `Davet e-postası gönderilemedi (${inv.email}): ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async updateRoles(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    dto: UpdateUserRolesDto,
  ) {
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    // Sahiplik normalizasyonu: hedef firma SAHİBİYSE gelen kümede SAHIP
    // etiketi eksik olsa bile OTOMATİK korunur (eski istemci/tutarsız veri
    // "kuruculuğu bırakıyorsun" reddine dönüşmesin). SAHIP'i bırakmanın tek
    // yolu DEVİR akışıdır (resolveOwnership).
    let roles = dto.roles as CompanyRole[];
    if (
      company?.ownerUserId === targetId &&
      !roles.includes(CompanyRole.SAHIP)
    ) {
      roles = [CompanyRole.SAHIP, ...roles];
    }
    this.assertValidRoleCombo(roles);
    // #8 — mevcut admin hedefini yalnız admin düşürebilir. (Faz R: grant-kapısından
    // ÖNCE koşar — admin-hedef denial'ı kendi audit iziyle [not_admin] düşsün.)
    this.assertCanModifyAdminTarget(
      actor,
      { id: targetId, roles: target.roles as CompanyRole[] },
      company?.ownerUserId ?? null,
    );
    this.assertCanGrantRoles(actor, roles, targetId);
    void target;
    await this.lockedAdminTxAudited(actor, targetId, roles, async (tx) => {
      // Faz K: koltuksuz kişiye SA/ST eklenirken kapı (tx + FOR UPDATE altında;
      // SA/ST çıkarma koltuk boşaltır, kontrol gerekmez).
      if (
        !this.rolesConsumeSeat(target.roles as CompanyRole[]) &&
        this.rolesConsumeSeat(roles)
      ) {
        await this.assertSeatAvailable(tx, actor.companyId, {
          context: "assign",
        });
      }
      // Sahiplik önce çözülür (sahip-bırakma net "devret" hatası versin), sonra
      // son-yönetici garantisi.
      await this.resolveOwnership(
        tx,
        actor.companyId,
        company?.ownerUserId ?? null,
        targetId,
        roles,
      );
      await this.assertNotLastAdmin(tx, actor.companyId, targetId, roles);
      await tx.companyUser.update({ where: { id: targetId }, data: { roles } });
    });
    // INV-AUDIT-1: yetki geçişi (rol değişimi) — commit SONRASI, before/after.
    await this.audit.log({
      action: "company.user.roles_changed",
      actorType: "company",
      actorId: actor.userId,
      actorEmail: actor.email,
      tenantId: actor.companyId,
      entityType: "company_user",
      entityId: targetId,
      critical: true,
      metadata: this.roleChangeMeta(target.roles as CompanyRole[], roles),
    });
    return { ok: true };
  }

  /**
   * Faz R: rol-değişim audit metadata'sı — etiket (SAHIP/YONETICI) ile rol
   * (SA/ST/ONAYLAYICI) değişimini ayrı alanlarda netleştirir (before/after kalır).
   */
  private roleChangeMeta(before: CompanyRole[], after: CompanyRole[]) {
    const LABELS: readonly CompanyRole[] = ["SAHIP", "YONETICI"];
    const added = after.filter((r) => !before.includes(r));
    const removed = before.filter((r) => !after.includes(r));
    return {
      before,
      after,
      labelChanges: {
        added: added.filter((r) => LABELS.includes(r)),
        removed: removed.filter((r) => LABELS.includes(r)),
      },
      roleChanges: {
        added: added.filter((r) => !LABELS.includes(r)),
        removed: removed.filter((r) => !LABELS.includes(r)),
      },
    };
  }

  /** Kullanıcı bilgilerini güncelle (ad/soyad/telefon + roller). */
  async updateUser(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    dto: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      roles?: CompanyRole[];
      // Devirde eski Kurucu'nun yeni rolü (kişiye sorulur).
      previousOwnerRoles?: CompanyRole[];
    },
  ) {
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    let roles = dto.roles as CompanyRole[] | undefined;
    if (
      roles &&
      company?.ownerUserId === targetId &&
      !roles.includes(CompanyRole.SAHIP)
    ) {
      // Sahiplik normalizasyonu — bkz. updateRoles.
      roles = [CompanyRole.SAHIP, ...roles];
    }
    if (roles) {
      this.assertValidRoleCombo(roles);
      // #8 — mevcut admin hedefini yalnız admin düşürebilir (updateRoles ile
      // aynı sınıf ve SIRA: grant-kapısından önce, audit'li denial korunsun).
      this.assertCanModifyAdminTarget(
        actor,
        { id: targetId, roles: target.roles as CompanyRole[] },
        company?.ownerUserId ?? null,
      );
      this.assertCanGrantRoles(actor, roles, targetId);
    }
    void target;
    const data = {
      ...(dto.firstName !== undefined
        ? { firstName: dto.firstName.trim() }
        : {}),
      ...(dto.lastName !== undefined ? { lastName: dto.lastName.trim() } : {}),
      ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
      ...(roles ? { roles } : {}),
    };
    // Rol değişimi yönetici sayısını + sahipliği etkileyebilir → atomik kilit.
    if (roles) {
      await this.lockedAdminTxAudited(actor, targetId, roles, async (tx) => {
        // Faz K: updateRoles ile aynı koltuk kapısı.
        if (
          !this.rolesConsumeSeat(target.roles as CompanyRole[]) &&
          this.rolesConsumeSeat(roles)
        ) {
          await this.assertSeatAvailable(tx, actor.companyId, {
            context: "assign",
          });
        }
        await this.resolveOwnership(
          tx,
          actor.companyId,
          company?.ownerUserId ?? null,
          targetId,
          roles,
          dto.previousOwnerRoles as CompanyRole[] | undefined,
        );
        await this.assertNotLastAdmin(tx, actor.companyId, targetId, roles);
        await tx.companyUser.update({ where: { id: targetId }, data });
      });
      // INV-AUDIT-1: yalnız rol değişince yetki izi (profil-alanı düzenlemesi
      // audit'lenmez). before = eski roller, after = yeni roller.
      await this.audit.log({
        action: "company.user.roles_changed",
        actorType: "company",
        actorId: actor.userId,
        actorEmail: actor.email,
        tenantId: actor.companyId,
        entityType: "company_user",
        entityId: targetId,
        critical: true,
        metadata: { before: target.roles, after: roles },
      });
    } else {
      await this.prisma.companyUser.update({ where: { id: targetId }, data });
    }
    return { ok: true };
  }

  /** Kullanıcıyı pasif/aktif yap (soft-delete değil — listede kalır). */
  async setActive(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    active: boolean,
  ) {
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    if (company?.ownerUserId === targetId) {
      throw new BadRequestException("Firma sahibi pasifleştirilemez");
    }
    if (targetId === actor.userId) {
      throw new BadRequestException("Kendinizi pasifleştiremezsiniz");
    }
    if (!active) {
      await this.lockedAdminTxAudited(actor, targetId, [], async (tx) => {
        await this.assertNotLastAdmin(tx, actor.companyId, targetId, []);
        await tx.companyUser.update({
          where: { id: targetId },
          data: { isActive: false },
        });
      });
    } else if (this.rolesConsumeSeat(target.roles as CompanyRole[])) {
      // Faz K: SA/ST taşıyan kişinin reaktivasyonu koltuk tüketir — kilitli
      // tx'te kapı (aşkın firmada reaktivasyon da kilitli kalır).
      await this.lockedAdminTx(actor.companyId, async (tx) => {
        await this.assertSeatAvailable(tx, actor.companyId, {
          context: "assign",
        });
        await tx.companyUser.update({
          where: { id: targetId },
          data: { isActive: true },
        });
      });
    } else {
      await this.prisma.companyUser.update({
        where: { id: targetId },
        data: { isActive: true },
      });
    }
    // INV-AUDIT-1: erişim (aktif/pasif) değişimi — yetki tarafı.
    await this.audit.log({
      action: "company.user.active_changed",
      actorType: "company",
      actorId: actor.userId,
      actorEmail: actor.email,
      tenantId: actor.companyId,
      entityType: "company_user",
      entityId: targetId,
      critical: true,
      metadata: { active },
    });
    return { ok: true };
  }

  /**
   * Kişi-bazlı izin override — yalnızca FİRMA SAHİBİ, başka kullanıcıların
   * rol-varsayılan izinlerini artırır/azaltır. Sahibin kendi izinleri kısıtlanamaz.
   */
  async updatePermissions(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    dto: UpdateUserPermissionsDto,
  ) {
    if (!actor.isOwner) {
      throw new ForbiddenException(
        "İzinleri yalnızca Kurucu düzenleyebilir",
      );
    }
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    if (company?.ownerUserId === targetId) {
      throw new BadRequestException(
        "Kurucunun izinleri kısıtlanamaz (tüm yetkilere sahiptir)",
      );
    }

    // Anahtarları katalogla doğrula; geçersizleri reddet.
    const valid = new Set(ALL_COMPANY_PERMISSIONS);
    const clean = (arr: string[]) =>
      [...new Set(arr)].filter((k) => valid.has(k));
    const added = clean(dto.added);
    const removed = clean(dto.removed).filter((k) => !added.includes(k));
    const invalid = [...dto.added, ...dto.removed].filter((k) => !valid.has(k));
    if (invalid.length > 0) {
      throw new BadRequestException(`Geçersiz izin: ${invalid[0]}`);
    }

    // Rol-varsayılanıyla aynı sonucu veren override'ı sadeleştir:
    // - role'de OLAN izni added'dan düş (gereksiz), OLMAYAN izni removed'dan düş.
    const roleSet = permissionsForRoles(target.roles);
    const effectiveAdded = added.filter((k) => !roleSet.has(k));
    const effectiveRemoved = removed.filter((k) => roleSet.has(k));

    // before-override (requireMember seçmiyor) — audit için ayrı oku.
    const beforeRow = await this.prisma.companyUser.findUnique({
      where: { id: targetId },
      select: { permissionsOverride: true },
    });

    await this.prisma.companyUser.update({
      where: { id: targetId },
      data: {
        permissionsOverride: { added: effectiveAdded, removed: effectiveRemoved },
      },
    });
    // INV-AUDIT-1: kişi-bazlı izin override — yetki tarafı, before/after.
    await this.audit.log({
      action: "company.user.permissions_overridden",
      actorType: "company",
      actorId: actor.userId,
      actorEmail: actor.email,
      tenantId: actor.companyId,
      entityType: "company_user",
      entityId: targetId,
      critical: true,
      metadata: {
        roles: target.roles,
        before:
          (beforeRow?.permissionsOverride as CompanyPermissionOverride | null) ??
          null,
        after: { added: effectiveAdded, removed: effectiveRemoved },
      },
    });
    return { ok: true };
  }

  /** İş çıkışı — soft delete (login engellenir, geçmiş korunur). */
  async remove(actor: AuthenticatedCompanyUser, targetId: string) {
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    if (company?.ownerUserId === targetId) {
      throw new BadRequestException(
        "Kurucu çıkarılamaz — önce kuruculuğu devredin",
      );
    }
    if (targetId === actor.userId) {
      throw new BadRequestException("Kendinizi çıkaramazsınız");
    }
    await this.lockedAdminTxAudited(actor, targetId, [], async (tx) => {
      await this.assertNotLastAdmin(tx, actor.companyId, targetId, []);
      await tx.companyUser.update({
        where: { id: targetId },
        data: {
          isActive: false,
          deletedAt: new Date(),
          // E-postayı serbest bırak: global-unique email aksi halde bu kişiyi
          // yeniden davet edilemez kılar (accept'te Supabase/unique çakışması →
          // dead-end davet). KVKK ile de uyumlu (silinen PII tombstone'lanır).
          email: `deleted-${targetId}@deleted.rothern`,
        },
      });
    });
    // INV-AUDIT-1: iş çıkışı (soft-delete) = tüm erişimin iptali — yetki tarafı.
    // Hedef e-postası metadata'ya YAZILMAZ (PII); yalnız entityId.
    await this.audit.log({
      action: "company.user.removed",
      actorType: "company",
      actorId: actor.userId,
      actorEmail: actor.email,
      tenantId: actor.companyId,
      entityType: "company_user",
      entityId: targetId,
      critical: true,
      metadata: { previousRoles: target.roles },
    });
    // Supabase auth kaydını da temizle → giriş imkânsız + e-posta orada da serbest.
    if (target.authId) {
      void this.supabaseAuth
        .deleteUser(target.authId)
        .catch((err: unknown) =>
          this.logger.warn(
            `Silinen kullanıcının Supabase auth kaydı temizlenemedi (${targetId}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    }
    return { ok: true };
  }

  /**
   * Rol kombinasyon kuralı: bir kişiye tek rol atanır; istisna olarak yalnızca
   * Satın Almacı + Satışçı birlikte verilebilir. Yönetici ve Onaylayıcı tek başına.
   * Kurucu (SAHIP) TAM YETKİLİDİR — tek başına olur, ek rol ile birleşmez.
   */
  /**
   * Faz R kombo kuralları — etiket/rol modeli:
   * - SAHIP (etiket) YONETICI/ONAYLAYICI ile birleşemez (yönetim+onay yetkisini
   *   zaten kapsar); SA/ST ile BİRLEŞEBİLİR (Kurucu işlem için kendine op-rol
   *   ekler — koltuk Faz K buna sayar). Firmada tek Kurucu + davetle verilemez
   *   + devirle geçer kuralları ayrı yerlerde korunur.
   * - YONETICI + ONAYLAYICI birleşemez: Yönetici zaten approval:act taşır ve
   *   onaycı havuzuna dahildir (assertApproversValid) — ek rol yetki katmaz,
   *   yalnız kafa karıştırır.
   * - Bunlar dışındaki kombinasyonlar serbest — özellikle SA/ST + ONAYLAYICI
   *   GEÇERLİ (satın alma müdürü deseni: kendi alım yapar, astlarını onaylar).
   */
  private assertValidRoleCombo(roles: CompanyRole[]) {
    if (roles.length === 0) {
      throw new BadRequestException("En az bir rol seçin");
    }
    if (
      roles.includes("SAHIP") &&
      (roles.includes("YONETICI") || roles.includes("ONAYLAYICI"))
    ) {
      throw new BadRequestException(
        "Kurucu, Yönetici/Onaylayıcı ile birleştirilemez (yetkilerini zaten kapsar); işlem için Satın Almacı/Satışçı ekleyin",
      );
    }
    if (roles.includes("YONETICI") && roles.includes("ONAYLAYICI")) {
      throw new BadRequestException(
        "Kurucu ve Yönetici zaten onay verebilir; ayrıca Onaylayıcı rolü gerekmez.",
      );
    }
  }

  private async requireMember(companyId: string, userId: string) {
    const u = await this.prisma.companyUser.findFirst({
      where: { id: userId, companyId, deletedAt: null },
      select: { id: true, roles: true, email: true, authId: true },
    });
    if (!u) throw new NotFoundException("Kullanıcı bulunamadı");
    return u;
  }

  /**
   * Yükseltme koruması: YONETICI/ONAYLAYICI gibi ayrıcalıklı rolleri yalnızca
   * firma SAHİBİ veya YONETICI atayabilir. Aksi halde owner'ın devrettiği
   * `users:manage` iznine sahip operasyon rollü bir kullanıcı kendisini (ya da
   * bir suç ortağını) YONETICI yapıp tüm yetkileri ele geçirebilirdi.
   */
  private assertCanGrantRoles(
    actor: AuthenticatedCompanyUser,
    roles: CompanyRole[],
    /** Bilinen hedef (updateRoles/updateUser) — non-admin denial'ı audit'lensin. */
    targetId?: string,
  ) {
    // Sahiplik (SAHIP) yalnız mevcut firma sahibi tarafından devredilebilir.
    if (roles.includes("SAHIP") && !actor.isOwner) {
      throw new ForbiddenException(
        "Kuruculuğu yalnızca mevcut Kurucu devredebilir",
      );
    }
    // Faz R: YONETICI bir ETİKETTİR — yalnız Kurucu verebilir (Yönetici başka
    // Yönetici üretemez).
    if (roles.includes("YONETICI") && !actor.isOwner) {
      throw new ForbiddenException(
        "Yönetici etiketini yalnızca Kurucu verebilir",
      );
    }
    // Roller (SA/ST/ONAYLAYICI): Kurucu veya Yönetici atar — users:manage
    // override'lı ama etiketsiz kişi rol ATAYAMAZ (yetki-üretme kapısı kapalı).
    const actorIsAdmin = actor.isOwner || hasManagementRole(actor.roles);
    if (!actorIsAdmin) {
      // INV-AUDIT-1 (denial): assertCanModifyAdminTarget deseniyle aynı —
      // reddedilen rol-atama denemesi iz bırakır (PII yok, yalnız id + roller).
      if (targetId) {
        void this.audit.log({
          action: "company.user.role_change_denied",
          actorType: "company",
          actorId: actor.userId,
          actorEmail: actor.email,
          tenantId: actor.companyId,
          entityType: "company_user",
          entityId: targetId,
          critical: false,
          metadata: { reason: "not_admin_grant", requestedRoles: roles },
        });
      }
      throw new ForbiddenException(
        "Rol atamayı yalnızca Kurucu veya Yönetici yapabilir",
      );
    }
  }

  /**
   * #8 Düşürme koruması: hedef ŞU AN admin (Kurucu/Yönetici) ise, rollerini
   * değiştirmek/düşürmek yalnız admin (Kurucu/Yönetici) yetkisiyle mümkün.
   * `assertCanGrantRoles` yalnız YÜKSELTMEYİ korur (yeni rol ayrıcalıklıysa);
   * bu ise DÜŞÜRMEYİ korur: aksi halde `users:manage` override'lı operasyon
   * rollü bir kullanıcı mevcut bir Yöneticiyi düşük role indirip yönetim
   * katmanını sabote edebilirdi. Privilege gain yok — temizlik/simetri.
   */
  private assertCanModifyAdminTarget(
    actor: AuthenticatedCompanyUser,
    target: { id: string; roles: CompanyRole[] },
    ownerUserId: string | null,
  ) {
    const targetIsAdmin =
      target.id === ownerUserId || hasManagementRole(target.roles);
    if (!targetIsAdmin) return;
    const actorIsAdmin = actor.isOwner || hasManagementRole(actor.roles);
    if (!actorIsAdmin) {
      // INV-AUDIT-1 (denial): yetkisiz kişinin admin-hedefin rolüne müdahale
      // denemesi iz bırakır. Guard sync → bilinçli await'siz (log() fail-safe).
      // critical:FALSE — denial seli Sentry alarmı üretmesin. Hedef e-posta
      // (PII) yazılmaz, yalnız id + roller.
      void this.audit.log({
        action: "company.user.role_change_denied",
        actorType: "company",
        actorId: actor.userId,
        actorEmail: actor.email,
        tenantId: actor.companyId,
        entityType: "company_user",
        entityId: target.id,
        critical: false,
        metadata: { reason: "not_admin", targetRoles: target.roles },
      });
      throw new ForbiddenException(
        "Yönetici veya Kurucu rolündeki bir kullanıcının rollerini yalnızca Kurucu veya Yönetici değiştirebilir",
      );
    }
  }

  /**
   * Sahiplik (SAHIP) değişimini uygular. Firmada TEK sahip olur:
   * - Hedef sahip olacaksa (devir) → eski sahip Yönetici'ye düşer (op-rolleri
   *   korunur), ownerUserId hedefe geçer.
   * - Mevcut sahip SAHIP rolünü bırakmaya çalışırsa → devir olmadan reddedilir.
   * lockedAdminTx içinde çağrılır (atomik).
   */
  private async resolveOwnership(
    tx: Prisma.TransactionClient,
    companyId: string,
    currentOwnerId: string | null,
    targetId: string,
    roles: CompanyRole[],
    // Devirde eski Kurucu'nun yeni rolü — kişiye sorulur. Verilmezse varsayılan
    // Yönetici. (Faz R: Yönetici+op-rol artık geçerli kombo — seçenekler geniş.)
    previousOwnerRoles?: CompanyRole[],
  ) {
    const targetWantsOwner = roles.includes("SAHIP");
    const targetIsOwner = currentOwnerId === targetId;
    if (!targetWantsOwner && targetIsOwner) {
      throw new BadRequestException(
        "Kuruculuğu bırakmadan önce başka bir aktif kullanıcıya devretmelisiniz",
      );
    }
    if (targetWantsOwner && !targetIsOwner) {
      // DEVİR: eski Kurucu, seçtiği role düşer (varsayılan Yönetici).
      const demoted =
        previousOwnerRoles && previousOwnerRoles.length > 0
          ? previousOwnerRoles
          : [CompanyRole.YONETICI];
      if (demoted.includes(CompanyRole.SAHIP)) {
        throw new BadRequestException(
          "Devirde eski Kurucu tekrar Kurucu olamaz",
        );
      }
      this.assertValidRoleCombo(demoted);
      // Denetim 2026-08-23 #8: hedef AKTİF olmalı (pasif üyeye devir firmayı
      // aktif yöneticisiz bırakabiliyordu) ve hedefin izin kısıtı
      // (permissionsOverride) temizlenmeli — aksi halde yeni Kurucu kendi
      // "removed" anahtarlarıyla kilitlenip bunu düzeltemiyordu.
      const target = await tx.companyUser.findFirst({
        where: { id: targetId, companyId, deletedAt: null },
        select: { isActive: true },
      });
      if (!target?.isActive) {
        throw new BadRequestException(
          "Kuruculuk yalnızca aktif bir kullanıcıya devredilebilir",
        );
      }
      await tx.companyUser.update({
        where: { id: targetId },
        data: { permissionsOverride: Prisma.DbNull },
      });
      if (currentOwnerId) {
        await tx.companyUser.update({
          where: { id: currentOwnerId },
          data: { roles: demoted },
        });
      }
      await tx.company.update({
        where: { id: companyId },
        data: { ownerUserId: targetId },
      });
    }
  }

  /**
   * Yönetici sayısını etkileyen mutasyonları firma bazında serialize eder:
   * firma satırını FOR UPDATE ile kilitler → iki eşzamanlı düşürme/pasifleştirme
   * TÜM aktif yöneticileri sıfırlayamaz (son-yönetici garantisi atomik uygulanır).
   */
  // ============================================================
  // Faz K — KOLTUK: SA/ST rolü taşıyan AKTİF kişi sayısı (kişi başı 1).
  // Limit efektif tier'dan (SEAT_LIMITS, shared); STANDART limitsiz (null).
  // Aşkın durum TÜRETİLİR (flag yok): used > limit → yeni SA/ST kapıları
  // zaten reddeder, mevcutlar aktif kalır (zorla silme yok).
  // ============================================================

  /** Verilen roller koltuk tüketir mi (SA/ST içeriyor mu)? */
  private rolesConsumeSeat(roles: readonly CompanyRole[]): boolean {
    return roles.some((r) =>
      (SEAT_ROLES as readonly string[]).includes(r),
    );
  }

  /** Koltuk kullanımı — controller (GET seats) + kapılar tek kaynaktan okur. */
  async seatUsage(
    companyId: string,
    db: Prisma.TransactionClient = this.prisma,
  ) {
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { tier: true, membershipEndAt: true },
    });
    if (!company) throw new NotFoundException("Firma bulunamadı");
    const limit =
      SEAT_LIMITS[effectiveTier(company.tier, company.membershipEndAt)];
    const seatRoles = [...SEAT_ROLES] as CompanyRole[];
    const [used, pendingSeatInvites] = await Promise.all([
      db.companyUser.count({
        where: {
          companyId,
          deletedAt: null,
          isActive: true,
          roles: { hasSome: seatRoles },
        },
      }),
      db.companyUserInvitation.count({
        where: {
          companyId,
          status: "PENDING",
          expiresAt: { gt: new Date() },
          roles: { hasSome: seatRoles },
        },
      }),
    ]);
    return {
      limit,
      used,
      pendingSeatInvites,
      overflow: limit == null ? 0 : Math.max(0, used - limit),
    };
  }

  /**
   * Koltuk kapısı — +1 koltuk sığmıyorsa reddeder. YARIŞ GÜVENLİĞİ: koltuk
   * tüketen yazımlar company-satırı FOR UPDATE kilidi altındaki tx'ten çağırır
   * (lockedAdminTx / acceptInvitation tx'i); davet-GÖNDERME kilitsiz danışma
   * kontrolüdür (asıl kapı kabulde) ve bekleyen SA/ST davetlerini de sayar
   * (davet-yağmuruyla limit aşımı kapalı).
   */
  private async assertSeatAvailable(
    db: Prisma.TransactionClient,
    companyId: string,
    opts: { includePending?: boolean; context: "invite" | "accept" | "assign" },
  ) {
    const { limit, used, pendingSeatInvites } = await this.seatUsage(
      companyId,
      db,
    );
    if (limit == null) return; // STANDART — limitsiz
    const occupied = used + (opts.includePending ? pendingSeatInvites : 0);
    if (occupied + 1 > limit) {
      if (opts.context === "accept") {
        throw new ConflictException(
          "Koltuk dolu — davet şu an kabul edilemiyor; firma yöneticinize başvurun",
        );
      }
      throw new BadRequestException(
        opts.includePending && pendingSeatInvites > 0
          ? `Koltuk dolu (${used} aktif + ${pendingSeatInvites} bekleyen davet / ${limit}) — Satın Almacı/Satışçı için paketi yükseltin veya bir koltuğu boşaltın`
          : `Koltuk dolu (${used}/${limit}) — Satın Almacı/Satışçı için paketi yükseltin veya bir koltuğu boşaltın`,
      );
    }
  }

  /**
   * Faz K — kurucu koltuk seçimi (downgrade sonrası aşkın durum): kalacak
   * SA/ST sahipleri `keepUserIds`; kalanların SA/ST rolleri DÜŞER, kişiler
   * AKTİF kalır (etiket/ONAYLAYICI korunur; roller boşalabilir → roles=[]).
   * Sistem-yazımı: assertValidRoleCombo bilinçli çağrılmaz. Kurucu kendini
   * dışarıda bırakabilir (koltuk garantisi yok — Faz R salt-okunur modeli).
   */
  async applySeatSelection(
    actor: AuthenticatedCompanyUser,
    keepUserIds: string[],
  ) {
    if (!actor.isOwner) {
      throw new ForbiddenException(
        "Koltuk seçimini yalnızca Kurucu yapabilir",
      );
    }
    const keep = [...new Set(keepUserIds)];
    const seatRoles = [...SEAT_ROLES] as CompanyRole[];
    const result = await this.lockedAdminTx(actor.companyId, async (tx) => {
      const { limit } = await this.seatUsage(actor.companyId, tx);
      if (limit == null) {
        throw new BadRequestException("Bu pakette koltuk sınırı yok");
      }
      if (keep.length > limit) {
        throw new BadRequestException(
          `En fazla ${limit} kişi seçebilirsiniz (paket limiti)`,
        );
      }
      const holders = await tx.companyUser.findMany({
        where: {
          companyId: actor.companyId,
          deletedAt: null,
          isActive: true,
          roles: { hasSome: seatRoles },
        },
        select: { id: true, email: true, roles: true },
      });
      const holderIds = new Set(holders.map((h) => h.id));
      for (const id of keep) {
        if (!holderIds.has(id)) {
          throw new BadRequestException(
            "Seçim listesinde koltuk kullanmayan bir kullanıcı var",
          );
        }
      }
      const dropped = holders.filter((h) => !keep.includes(h.id));
      for (const h of dropped) {
        const newRoles = (h.roles as CompanyRole[]).filter(
          (r) => !(SEAT_ROLES as readonly string[]).includes(r),
        );
        await tx.companyUser.update({
          where: { id: h.id },
          data: { roles: newRoles },
        });
      }
      return {
        limit,
        dropped: dropped.map((h) => ({
          id: h.id,
          email: h.email,
          before: h.roles as CompanyRole[],
        })),
      };
    });
    // Commit SONRASI: kişi başına roles_changed + toplu iz + best-effort bildirim.
    for (const d of result.dropped) {
      const after = d.before.filter(
        (r) => !(SEAT_ROLES as readonly string[]).includes(r),
      );
      await this.audit.log({
        action: "company.user.roles_changed",
        actorType: "company",
        actorId: actor.userId,
        actorEmail: actor.email,
        tenantId: actor.companyId,
        entityType: "company_user",
        entityId: d.id,
        critical: true,
        metadata: {
          ...this.roleChangeMeta(d.before, after),
          reason: "seat_selection",
        },
      });
      void this.notifications
        ?.pushToUser(d.id, {
          type: "seat_selection",
          title: "İşlem rolleriniz kaldırıldı",
          body: "Paket küçültmesi nedeniyle Satın Almacı/Satışçı rolleriniz kaldırıldı. Hesabınız ve diğer yetkileriniz aynen devam ediyor.",
        } as never)
        .catch((err: unknown) =>
          this.logger.warn(
            `Seat-selection bildirimi yazılamadı (${d.id}): ${
              err instanceof Error ? err.message : String(err)
            }`,
          ),
        );
    }
    await this.audit.log({
      action: "company.seats.selection_applied",
      actorType: "company",
      actorId: actor.userId,
      actorEmail: actor.email,
      tenantId: actor.companyId,
      entityType: "company",
      entityId: actor.companyId,
      critical: true,
      metadata: {
        limit: result.limit,
        keptCount: keep.length,
        droppedCount: result.dropped.length,
      },
    });
    return { ok: true, droppedCount: result.dropped.length };
  }

  private async lockedAdminTx<T>(
    companyId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return runTenantTx(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
      return fn(tx);
    });
  }

  /**
   * targetId'nin rolleri `newRoles`a değişir/çıkarılırsa (ya da pasif/silinirse)
   * firmada en az 1 AKTİF YONETICI kalmalı — pasif yöneticiler SAYILMAZ, aksi
   * halde tek aktif yönetici düşürülüp tüm firma kilitlenirdi.
   */
  private async assertNotLastAdmin(
    tx: Prisma.TransactionClient,
    companyId: string,
    targetId: string,
    newRoles: CompanyRole[],
  ) {
    // Yönetim yetkisi = Kurucu VEYA Yönetici.
    if (newRoles.includes("SAHIP") || newRoles.includes("YONETICI")) return;
    const otherActiveAdmins = await tx.companyUser.count({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        id: { not: targetId },
        roles: { hasSome: ["SAHIP", "YONETICI"] },
      },
    });
    if (otherActiveAdmins === 0) {
      // Sentinel (aynı 400 + mesaj) → çağrı yeri tx abort sonrası denial audit'i
      // instanceof ile ayırt eder. Bkz. LastActiveAdminError.
      throw new LastActiveAdminError();
    }
  }

  /**
   * INV-AUDIT-1 (denial): son-yönetici garantisi bir mutasyonu engelledi → iz.
   * lockedAdminTx ABORT ETTİKTEN SONRA çağrılır (tx içinde yazılsa rollback
   * silerdi) → burada await'lidir (async bağlam). critical:FALSE — denial seli
   * Sentry alarmı üretmesin. Hedef e-posta (PII) yazılmaz, yalnız id + denenen
   * roller.
   */
  private async auditLastAdminDenial(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    attemptedRoles: CompanyRole[],
  ) {
    await this.audit.log({
      action: "company.user.last_admin_denied",
      actorType: "company",
      actorId: actor.userId,
      actorEmail: actor.email,
      tenantId: actor.companyId,
      entityType: "company_user",
      entityId: targetId,
      critical: false,
      metadata: { attemptedRoles },
    });
  }

  /**
   * lockedAdminTx'i son-yönetici denial audit'iyle sarmalar: tx içinde atılan
   * LastActiveAdminError abort'tan SONRA iz bırakır, sonra aynen yukarı fırlar
   * (davranış değişmez — hâlâ 400 + aynı mesaj).
   */
  private async lockedAdminTxAudited<T>(
    actor: AuthenticatedCompanyUser,
    targetId: string,
    attemptedRoles: CompanyRole[],
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.lockedAdminTx(actor.companyId, fn);
    } catch (e) {
      if (e instanceof LastActiveAdminError) {
        await this.auditLastAdminDenial(actor, targetId, attemptedRoles);
      }
      throw e;
    }
  }
}
