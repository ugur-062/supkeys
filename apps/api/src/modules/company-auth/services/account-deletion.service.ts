import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { i18nMessage } from "../../../common/i18n/http-i18n";
import { tApi } from "../../../common/i18n/i18n.service";
import { AuditService } from "../../audit/audit.service";
import { SeoIndexService } from "../../seo-index/seo-index.service";
import {
  SupabaseAuthService,
  isSupabaseAuthAccessError,
} from "../../supabase-auth/supabase-auth.service";

/**
 * Self-service account deletion (owner decision 2026-10-11; both app stores
 * require an in-app path).
 *
 *  - A member deletes their own account: the row is anonymised at once (the
 *    login is gone, personal fields are cleared), the live requests they
 *    opened go to the Founder, and the company's records stay.
 *  - The Founder with other members must hand the company over first.
 *  - The last member closes the company with the account: the company is
 *    suspended and taken off the public surface; the company-level KVKK
 *    erasure (`AdminCompaniesService.deleteOrAnonymize`) is completed by an
 *    administrator. Open orders and live requests block this - the other
 *    party's obligations do not disappear with the account.
 *
 * The identity provider user is removed LAST inside the transaction: a
 * failure there rolls everything back (same order as the unverified sign-up
 * cleanup).
 */

/** Requests the Founder takes over (same set as a manager removing a member). */
const HANDOVER_LISTING_STATUSES = [
  "DRAFT",
  "IN_APPROVAL",
  "OPEN",
  "CLOSED",
  "IN_AWARD",
  "IN_AWARD_APPROVAL",
  "CLOSED_NO_AWARD",
] as const;
/** Requests that still have other companies waiting on this one. */
const LIVE_LISTING_STATUSES = ["IN_APPROVAL", "OPEN", "IN_AWARD", "IN_AWARD_APPROVAL"] as const;
const OPEN_ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "CREATED",
  "IN_DELIVERY",
  "DELIVERED",
  "DISPUTED",
] as const;
/** Internal note shown in the admin panel only. */
const CLOSED_BY_OWNER_NOTE = "Hesap sahibi sildi - KVKK silme bekliyor";
const TX_MAX_WAIT_MS = 5_000;
const TX_TIMEOUT_MS = 30_000;

export interface AccountDeletionResult {
  ok: true;
  /** True when the account was the company's last one and the company closed with it. */
  companyClosed: boolean;
}

@Injectable()
export class AccountDeletionService {
  constructor(
    // Account-level operation that also writes the company row: bypass client,
    // every statement scoped by the caller's own ids.
    private readonly bypass: PrismaBypassService,
    private readonly supabaseAuth: SupabaseAuthService,
    private readonly audit: AuditService,
    @Optional() private readonly seo?: SeoIndexService,
  ) {}

  async deleteOwnAccount(
    userId: string,
    password: string,
    clientIp?: string,
  ): Promise<AccountDeletionResult> {
    const account = await this.bypass.companyUser.findUnique({
      where: { id: userId },
      select: { email: true, authId: true, companyId: true, deletedAt: true },
    });
    if (!account || !account.authId || account.deletedAt) throw new UnauthorizedException();
    const { authId, companyId } = account;

    try {
      await this.supabaseAuth.verifyPassword(account.email, password, clientIp);
    } catch (err) {
      if (isSupabaseAuthAccessError(err)) throw err;
      throw new ForbiddenException(i18nMessage("api.companyAuth.mevcutParolaHatali"));
    }

    const outcome = await this.bypass.$transaction(
      async (tx) => {
        // Company first, then its users (the order the seat gates use).
        await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM company_users WHERE "companyId" = ${companyId} FOR UPDATE`;
        const company = await tx.company.findUnique({
          where: { id: companyId },
          select: { ownerUserId: true },
        });
        const self = await tx.companyUser.findUnique({
          where: { id: userId },
          select: { deletedAt: true },
        });
        if (!company || !self || self.deletedAt) throw new UnauthorizedException();

        const others = await tx.companyUser.findMany({
          where: { companyId, deletedAt: null, id: { not: userId } },
          select: { id: true, isActive: true, permissions: true },
        });
        const isOwner = company.ownerUserId === userId;
        const closeCompany = others.length === 0;

        if (!closeCompany && isOwner) {
          throw new BadRequestException(
            i18nMessage(
              "api.companyAuth.hesapSilmeOnceKuruculukDevri",
              undefined,
              "ACCOUNT_OWNER_MUST_TRANSFER",
            ),
          );
        }
        if (!closeCompany) {
          // Someone must still be able to manage the company afterwards.
          const managerRemains = others.some(
            (u) =>
              u.isActive &&
              (u.id === company.ownerUserId || u.permissions.includes("users:manage")),
          );
          if (!managerRemains) {
            throw new BadRequestException(
              i18nMessage(
                "api.companyUsers.enAzBirAktifYonetimYetkilisiKalmali",
                undefined,
                "ACCOUNT_LAST_MANAGER",
              ),
            );
          }
        }

        let listingsTransferred = 0;
        if (closeCompany) {
          const [openOrders, liveListings] = await Promise.all([
            tx.companyOrder.count({
              where: {
                status: { in: [...OPEN_ORDER_STATUSES] },
                OR: [{ buyerCompanyId: companyId }, { sellerCompanyId: companyId }],
              },
            }),
            tx.listing.count({
              where: { companyId, status: { in: [...LIVE_LISTING_STATUSES] } },
            }),
          ]);
          if (openOrders > 0 || liveListings > 0) {
            throw new BadRequestException(
              i18nMessage(
                "api.companyAuth.hesapSilmeAcikIsVar",
                { orders: openOrders, listings: liveListings },
                "ACCOUNT_HAS_OPEN_WORK",
              ),
            );
          }
          await tx.company.update({
            where: { id: companyId },
            data: {
              isBlocked: true,
              blockedReason: CLOSED_BY_OWNER_NOTE,
              blockedAt: new Date(),
              publicEnabled: false,
            },
          });
        } else if (company.ownerUserId) {
          const moved = await tx.listing.updateMany({
            where: {
              companyId,
              createdById: userId,
              status: { in: [...HANDOVER_LISTING_STATUSES] },
            },
            data: { createdById: company.ownerUserId },
          });
          listingsTransferred = moved.count;
        }

        await tx.passwordResetToken.deleteMany({ where: { companyUserId: userId } });
        await tx.emailVerificationCode.deleteMany({ where: { companyUserId: userId } });
        await tx.notification.deleteMany({ where: { companyUserId: userId } });
        await tx.aiChatSession.deleteMany({ where: { companyId, userId } });
        await tx.companyUser.update({
          where: { id: userId },
          data: {
            email: `deleted-${userId}@deleted.rothern`,
            // Stored placeholder is read by the remaining members: one fixed language.
            firstName: tApi("api.companyAuth.silinmisKullaniciAd", undefined, "tr"),
            lastName: tApi("api.companyAuth.silinmisKullaniciSoyad", undefined, "tr"),
            phone: null,
            isActive: false,
            deletedAt: new Date(),
            authId: null,
            tokenVersion: { increment: 1 },
            twoFactorEnabled: false,
            twoFactorSecret: null,
            twoFactorRecoveryCodes: [],
            marketingConsent: false,
          },
        });
        // LAST: a provider failure rolls the whole deletion back.
        await this.supabaseAuth.deleteUserStrict(authId);
        return { closeCompany, listingsTransferred };
      },
      { maxWait: TX_MAX_WAIT_MS, timeout: TX_TIMEOUT_MS },
    );

    await this.audit.log({
      action: "company.user.self_deleted",
      actorType: "company",
      actorId: userId,
      tenantId: companyId,
      entityType: "company_user",
      entityId: userId,
      critical: true,
      metadata: {
        companyClosed: outcome.closeCompany,
        ...(outcome.listingsTransferred > 0
          ? { listingsTransferred: outcome.listingsTransferred }
          : {}),
      },
    });
    if (outcome.closeCompany) this.seo?.companyChanged(companyId);
    return { ok: true, companyClosed: outcome.closeCompany };
  }
}
