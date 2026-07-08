import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "node:crypto";
import { CompanyRole, Prisma } from "@rothern/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CompanyAuthService } from "../company-auth/services/company-auth.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import {
  ALL_COMPANY_PERMISSIONS,
  type CompanyPermissionOverride,
  hasManagementRole,
  permissionsForRoles,
} from "../company-auth/permissions/company-permissions.constants";
import { EmailService } from "../email/email.service";
import { SupabaseAuthService } from "../supabase-auth/supabase-auth.service";
import {
  AcceptCompanyInvitationDto,
  InviteCompanyUserDto,
  UpdateUserPermissionsDto,
  UpdateUserRolesDto,
} from "./dto/company-user.dto";

/** Davet linki geçerlilik süresi (eski sistemle aynı). */
const INVITATION_TTL_DAYS = 7;

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
        "Firma sahipliği davetle verilemez; mevcut bir kullanıcıya devredin",
      );
    }
    this.assertValidRoleCombo(roles);
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
      userId = await this.prisma.$transaction(async (tx) => {
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
      this.config.get<string>("WEB_URL") ?? "http://localhost:3000"
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
    const roles = dto.roles as CompanyRole[];
    this.assertValidRoleCombo(roles);
    this.assertCanGrantRoles(actor, roles);
    void target;
    await this.lockedAdminTx(actor.companyId, async (tx) => {
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
    return { ok: true };
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
    },
  ) {
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    const roles = dto.roles as CompanyRole[] | undefined;
    if (roles) {
      this.assertValidRoleCombo(roles);
      this.assertCanGrantRoles(actor, roles);
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
      await this.lockedAdminTx(actor.companyId, async (tx) => {
        await this.resolveOwnership(
          tx,
          actor.companyId,
          company?.ownerUserId ?? null,
          targetId,
          roles,
        );
        await this.assertNotLastAdmin(tx, actor.companyId, targetId, roles);
        await tx.companyUser.update({ where: { id: targetId }, data });
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
    await this.requireMember(actor.companyId, targetId);
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
      await this.lockedAdminTx(actor.companyId, async (tx) => {
        await this.assertNotLastAdmin(tx, actor.companyId, targetId, []);
        await tx.companyUser.update({
          where: { id: targetId },
          data: { isActive: false },
        });
      });
    } else {
      await this.prisma.companyUser.update({
        where: { id: targetId },
        data: { isActive: true },
      });
    }
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
        "İzinleri yalnızca firma sahibi düzenleyebilir",
      );
    }
    const target = await this.requireMember(actor.companyId, targetId);
    const company = await this.prisma.company.findUnique({
      where: { id: actor.companyId },
      select: { ownerUserId: true },
    });
    if (company?.ownerUserId === targetId) {
      throw new BadRequestException(
        "Firma sahibinin izinleri kısıtlanamaz (tüm yetkilere sahiptir)",
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

    await this.prisma.companyUser.update({
      where: { id: targetId },
      data: {
        permissionsOverride: { added: effectiveAdded, removed: effectiveRemoved },
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
        "Firma sahibi çıkarılamaz — önce sahipliği devredin",
      );
    }
    if (targetId === actor.userId) {
      throw new BadRequestException("Kendinizi çıkaramazsınız");
    }
    await this.lockedAdminTx(actor.companyId, async (tx) => {
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
   * Kurucu (SAHIP), Yönetici'yi kapsadığından yalnız operasyon rolleriyle
   * (Satın Almacı/Satışçı) birleşebilir.
   */
  private assertValidRoleCombo(roles: CompanyRole[]) {
    if (roles.length === 0) {
      throw new BadRequestException("En az bir rol seçin");
    }
    if (roles.includes("SAHIP")) {
      const extra = roles.filter((r) => r !== "SAHIP");
      if (extra.some((r) => r !== "SATIN_ALMACI" && r !== "SATISCI")) {
        throw new BadRequestException(
          "Kurucu yalnızca Satın Almacı ve/veya Satışçı ile birleştirilebilir",
        );
      }
      return;
    }
    const hasExclusive = roles.some(
      (r) => r === "YONETICI" || r === "ONAYLAYICI",
    );
    if (hasExclusive && roles.length > 1) {
      throw new BadRequestException(
        "Yönetici veya Onaylayıcı tek başına atanır; yalnızca Satın Almacı ve Satışçı birlikte tanımlanabilir",
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
  ) {
    // Sahiplik (SAHIP) yalnız mevcut firma sahibi tarafından devredilebilir.
    if (roles.includes("SAHIP") && !actor.isOwner) {
      throw new ForbiddenException(
        "Firma sahipliğini yalnızca mevcut firma sahibi devredebilir",
      );
    }
    const grantsPrivileged = roles.some(
      (r) => r === "YONETICI" || r === "ONAYLAYICI",
    );
    const actorIsAdmin = actor.isOwner || hasManagementRole(actor.roles);
    if (grantsPrivileged && !actorIsAdmin) {
      throw new ForbiddenException(
        "Yönetici veya Onaylayıcı rolünü yalnızca firma sahibi veya Yönetici atayabilir",
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
  ) {
    const targetWantsOwner = roles.includes("SAHIP");
    const targetIsOwner = currentOwnerId === targetId;
    if (!targetWantsOwner && targetIsOwner) {
      throw new BadRequestException(
        "Firma sahipliğini bırakmadan önce başka bir aktif kullanıcıya devretmelisiniz",
      );
    }
    if (targetWantsOwner && !targetIsOwner) {
      // DEVİR: eski sahip Yönetici'ye düşer (op-rolleri korunur).
      if (currentOwnerId) {
        const prev = await tx.companyUser.findUnique({
          where: { id: currentOwnerId },
          select: { roles: true },
        });
        if (prev) {
          const demoted = Array.from(
            new Set<CompanyRole>([
              "YONETICI",
              ...prev.roles.filter((r) => r !== "SAHIP"),
            ]),
          );
          await tx.companyUser.update({
            where: { id: currentOwnerId },
            data: { roles: demoted },
          });
        }
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
  private async lockedAdminTx<T>(
    companyId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
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
      throw new BadRequestException(
        "Firmada en az bir aktif yönetim yetkilisi (Kurucu/Yönetici) kalmalı",
      );
    }
  }
}
