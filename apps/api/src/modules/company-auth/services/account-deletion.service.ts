import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { i18nMessage } from "../../../common/i18n/http-i18n";
import { tApi } from "../../../common/i18n/i18n.service";
import { AuditService } from "../../audit/audit.service";
import { SeoIndexService } from "../../seo-index/seo-index.service";
import {
  SupabaseAuthService,
  isSupabaseAuthAccessError,
} from "../../supabase-auth/supabase-auth.service";
import {
  CLOSED_BY_OWNER_NOTE,
  deletedAccountEmail,
  isClosedByOwner,
  isDeletedAccountEmail,
} from "../account-closure";

/**
 * Self-service account deletion (owner decision 2026-10-11; both app stores
 * require an in-app path).
 *
 *  - A member deletes their own account: the login is gone and the personal
 *    fields of the row are cleared at once; the row itself stays under the
 *    "Silinmiş Kullanıcı" placeholder (pseudonymous, not anonymous: its id
 *    still links the company's records, so the texts never call it
 *    "anonim"). The live requests they opened go to the Founder, and the
 *    company's records stay.
 *  - The Founder with other members must hand the company over first.
 *  - The last member closes the company with the account: the company is
 *    suspended and taken off the public surface; the company-level KVKK
 *    erasure (`AdminCompaniesService.deleteOrAnonymize`) is completed by an
 *    administrator - the admin list filter "KVKK silme bekliyor" and the
 *    daily reminder (`ClosedCompanyErasureScheduler`) keep the 30-day promise
 *    of the privacy texts visible. Open orders and live requests block this -
 *    the other party's obligations do not disappear with the account.
 *  - An administrator runs the same erasure for a KVKK request from someone
 *    who cannot sign in (`eraseByAdmin`). An account that CAN still sign in
 *    is refused there (the person deletes it in the app; an e-mail asking for
 *    deletion proves nothing about who sent it), and so is the closure of a
 *    company an administrator suspended (the closure would replace the
 *    suspension record and queue the company for erasure).
 *  - The closure never replaces another suspension and never restarts the
 *    30-day clock of a company that is already closed.
 *
 * The identity provider user is removed LAST inside the transaction: a
 * failure there rolls everything back (same order as the unverified sign-up
 * cleanup).
 *
 * The texts that describe this behaviour change with it: Gizlilik m.6, KVKK
 * m.7/m.9, `/hesap-silme`, Kullanıcı Sözleşmesi m.8 and the Saklama ve İmha
 * Politikası table (rows 1-2). A member removed by a manager loses the same
 * personal records at removal (`CompanyUsersService.remove`), except the name.
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
const TX_MAX_WAIT_MS = 5_000;
const TX_TIMEOUT_MS = 30_000;

/** Audit action of an erasure an administrator ran for a KVKK request (label in admin `audit-actions.ts`). */
export const ADMIN_ERASED_ACTION = "admin.user.erased";

export interface AccountDeletionResult {
  ok: true;
  /** True when the account was the company's last one and the company closed with it. */
  companyClosed: boolean;
}

export interface AdminErasureResult extends AccountDeletionResult {
  /** The account had already been removed from the team; only its leftover personal data went. */
  alreadyRemoved: boolean;
}

/** Why an administrator's KVKK erasure is refused before anything is written (the `code` of the 409). */
export type AdminErasureBlocker = "ACCOUNT_CAN_SIGN_IN" | "ACCOUNT_COMPANY_SUSPENDED" | "COMPANY_ANONYMIZED";

/** `GET admin/companies/:companyId/users/:userId/erase-preview` (admin confirm dialog). */
export interface AdminErasurePreview {
  /** The name on the row ("Silinmiş Kullanıcı" once erased). */
  name: string;
  /** The row's address; null when it is already the deletion placeholder. */
  email: string | null;
  /**
   * A removed / deleted row no longer holds the real address: the one the
   * person last used in this company, from the audit log (null when none).
   */
  lastKnownEmail: string | null;
  /** Removal (or deletion) date; null for a member still on the team. */
  removedAt: Date | null;
  /** Removed earlier and its name, phone and login are already gone: nothing left to erase. */
  nothingLeft: boolean;
  /** No other live user: the erasure closes the company. */
  closesCompany: boolean;
  /** The company is suspended for another reason (administrator, complaint). */
  companySuspension: { reason: string | null; since: Date | null } | null;
  /** Other rows of the company (live or removed) with the same name. */
  sameNameCount: number;
  /** Set when `eraseByAdmin` would refuse; the dialog does not offer the action. */
  blocker: AdminErasureBlocker | null;
}

/**
 * THE ADMINISTRATOR'S REFUSALS (one rule for the preview and the erasure).
 *  - Anonymised company: nothing left to erase.
 *  - An account that can sign in (on the team, active, company not
 *    suspended): the person deletes it in the app. The admin path rests on
 *    an e-mail the operator received; it is only for someone who cannot sign
 *    in.
 *  - Closing a company that an administrator suspended: the closure would
 *    replace the suspension reason and date and put a company under review
 *    into the erasure queue. The suspension is decided first (lift it, or
 *    erase the company with `deleteOrAnonymize`). A company already closed by
 *    its last user is not "suspended" here.
 */
export function adminErasureBlocker(input: {
  removed: boolean;
  userActive: boolean;
  company: { isActive: boolean; isBlocked: boolean; blockedReason: string | null };
  closesCompany: boolean;
}): AdminErasureBlocker | null {
  if (!input.company.isActive) return "COMPANY_ANONYMIZED";
  if (input.removed) return null;
  if (input.userActive && !input.company.isBlocked) return "ACCOUNT_CAN_SIGN_IN";
  if (input.closesCompany && input.company.isBlocked && !isClosedByOwner(input.company)) {
    return "ACCOUNT_COMPANY_SUSPENDED";
  }
  return null;
}

function adminErasureRefusal(blocker: AdminErasureBlocker): ConflictException {
  switch (blocker) {
    case "COMPANY_ANONYMIZED":
      return new ConflictException(
        i18nMessage("api.adminCompanies.firmaKvkkIleAnonimlestirildi", undefined, blocker),
      );
    case "ACCOUNT_CAN_SIGN_IN":
      return new ConflictException(i18nMessage("api.adminCompanies.kvkkSilmeGirisYapabilir", undefined, blocker));
    case "ACCOUNT_COMPANY_SUSPENDED":
      return new ConflictException(i18nMessage("api.adminCompanies.kvkkSilmeFirmaAskida", undefined, blocker));
  }
}

/** The name the erasure writes (one fixed language, read by the remaining members). */
function isPlaceholderName(u: { firstName: string; lastName: string }): boolean {
  return (
    u.firstName === tApi("api.companyAuth.silinmisKullaniciAd", undefined, "tr") &&
    u.lastName === tApi("api.companyAuth.silinmisKullaniciSoyad", undefined, "tr")
  );
}

type Tx = Prisma.TransactionClient;

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

    const outcome = await this.eraseLiveAccount(userId, companyId, authId, () => new UnauthorizedException());

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

  /**
   * KVKK ERASURE BY AN ADMINISTRATOR (2026-10-16). The privacy texts promise
   * that someone who cannot sign in (deactivated, removed from the team by a
   * manager, suspended company) can ask for deletion at the KVKK address; this
   * is how the operator carries that request out without hand-written SQL.
   *
   *  - A live account that cannot sign in goes through exactly the
   *    self-service path (same rules, same erasure, same company closure),
   *    only without the password - the operator verified the request by
   *    writing to the registered address (`docs/pending-operator-tasks.md`
   *    §8b).
   *  - REFUSED (409, nothing written; `adminErasureBlocker`): an account that
   *    can still sign in (`ACCOUNT_CAN_SIGN_IN` - the person deletes it in the
   *    app, where the password proves who asks; a deletion e-mail can be
   *    forged); the closure of a company that is suspended for another reason
   *    (`ACCOUNT_COMPANY_SUSPENDED` - the closure would replace the suspension
   *    reason and date and queue a company under review for erasure; the
   *    operator decides the suspension first); an anonymised company
   *    (`COMPANY_ANONYMIZED`).
   *  - An account a manager already removed from the team keeps its name and
   *    phone (`CompanyUsersService.remove` only frees the e-mail); here the
   *    leftover personal data goes too. Its `deletedAt` stays.
   *
   * The whole company is still erased with `deleteOrAnonymize`.
   */
  async eraseByAdmin(companyId: string, userId: string, adminId: string): Promise<AdminErasureResult> {
    const account = await this.bypass.companyUser.findFirst({
      where: { id: userId, companyId },
      select: { authId: true, deletedAt: true, company: { select: { isActive: true } } },
    });
    if (!account) {
      throw new NotFoundException(i18nMessage("api.adminCompanies.kullaniciBuFirmadaBulunamadi"));
    }
    // Anonymisation already removed every member's personal data.
    if (account.company.isActive === false) throw adminErasureRefusal("COMPANY_ANONYMIZED");
    const alreadyRemoved = account.deletedAt != null;
    let closeCompany = false;
    let listingsTransferred = 0;
    if (alreadyRemoved) {
      await this.bypass.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM company_users WHERE id = ${userId} FOR UPDATE`;
          // The real address is already gone from the row: nothing to match invitations with.
          await this.scrubAccount(tx, userId, companyId, { realEmail: null, markDeleted: false });
          // A removed member's provider user is deleted without waiting at removal;
          // a leftover one goes here (resolves when it is already gone).
          if (account.authId) await this.supabaseAuth.deleteUserStrict(account.authId);
        },
        { maxWait: TX_MAX_WAIT_MS, timeout: TX_TIMEOUT_MS },
      );
    } else {
      const outcome = await this.eraseLiveAccount(
        userId,
        companyId,
        account.authId,
        () => new NotFoundException(i18nMessage("api.adminCompanies.kullaniciBuFirmadaBulunamadi")),
        "admin",
      );
      closeCompany = outcome.closeCompany;
      listingsTransferred = outcome.listingsTransferred;
    }

    await this.audit.log({
      action: ADMIN_ERASED_ACTION,
      actorType: "admin",
      actorId: adminId,
      // The company's admin "Denetim" tab finds user actions by the company id.
      tenantId: companyId,
      entityType: "company_user",
      entityId: userId,
      critical: true,
      metadata: {
        alreadyRemoved,
        companyClosed: closeCompany,
        ...(listingsTransferred > 0 ? { listingsTransferred } : {}),
      },
    });
    if (closeCompany) this.seo?.companyChanged(companyId);
    return { ok: true, companyClosed: closeCompany, alreadyRemoved };
  }

  /**
   * What the admin confirm dialog shows before a KVKK erasure (read only, no
   * locks; `eraseByAdmin` decides again inside its transaction). It answers
   * the operator's questions: is this the person who wrote (name, the address
   * the person last used - a removed member's row no longer holds it, so it
   * comes from the audit log - removal date, other rows with the same name),
   * would the company close, is the company suspended, and is the erasure
   * refused (`blocker`, same rule as `eraseByAdmin`).
   */
  async adminErasurePreview(companyId: string, userId: string): Promise<AdminErasurePreview> {
    const user = await this.bypass.companyUser.findFirst({
      where: { id: userId, companyId },
      select: {
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        authId: true,
        isActive: true,
        deletedAt: true,
        company: { select: { isActive: true, isBlocked: true, blockedReason: true, blockedAt: true } },
      },
    });
    if (!user) {
      throw new NotFoundException(i18nMessage("api.adminCompanies.kullaniciBuFirmadaBulunamadi"));
    }
    const removed = user.deletedAt != null;
    const [otherLive, others, lastKnownEmail] = await Promise.all([
      this.bypass.companyUser.count({ where: { companyId, deletedAt: null, id: { not: userId } } }),
      this.bypass.companyUser.findMany({
        where: { companyId, id: { not: userId } },
        select: { firstName: true, lastName: true },
      }),
      isDeletedAccountEmail(user.email) ? this.lastKnownEmail(companyId, userId) : Promise.resolve(null),
    ]);
    const placeholder = isPlaceholderName(user);
    const nameKey = (u: { firstName: string; lastName: string }) =>
      `${u.firstName} ${u.lastName}`.trim().replace(/\s+/g, " ").toLowerCase();
    const closesCompany = !removed && otherLive === 0;
    const { company } = user;
    return {
      name: `${user.firstName} ${user.lastName}`.trim(),
      email: isDeletedAccountEmail(user.email) ? null : user.email,
      lastKnownEmail,
      removedAt: user.deletedAt,
      nothingLeft: removed && placeholder && user.phone == null && user.authId == null,
      closesCompany,
      companySuspension:
        company.isActive && company.isBlocked && !isClosedByOwner(company)
          ? { reason: company.blockedReason, since: company.blockedAt }
          : null,
      sameNameCount: placeholder ? 0 : others.filter((o) => nameKey(o) === nameKey(user)).length,
      blocker: adminErasureBlocker({
        removed,
        userActive: user.isActive,
        company,
        closesCompany,
      }),
    };
  }

  /**
   * The address a removed account last used in this company: its own audit
   * rows (`actorEmail` is the address at the time of the action) and the
   * admin rows that set it. Only for the admin preview; null when nothing is
   * recorded.
   */
  private async lastKnownEmail(companyId: string, userId: string): Promise<string | null> {
    const [acted, setByAdmin] = await Promise.all([
      this.bypass.auditLog.findMany({
        where: { tenantId: companyId, actorType: "company", actorId: userId, actorEmail: { not: null } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20,
        select: { actorEmail: true, createdAt: true },
      }),
      this.bypass.auditLog.findMany({
        where: {
          tenantId: companyId,
          entityType: "company_user",
          entityId: userId,
          action: { in: ["admin.user.created", "admin.user.email_changed"] },
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        select: { metadata: true, createdAt: true },
      }),
    ]);
    const candidates = [
      ...acted.map((r) => ({ at: r.createdAt, email: r.actorEmail })),
      ...setByAdmin.map((r) => {
        const m = (r.metadata ?? {}) as Record<string, unknown>;
        const email = typeof m.to === "string" ? m.to : typeof m.email === "string" ? m.email : null;
        return { at: r.createdAt, email };
      }),
    ]
      .filter((c): c is { at: Date; email: string } => typeof c.email === "string" && !isDeletedAccountEmail(c.email))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    return candidates[0]?.email ?? null;
  }

  /**
   * The rules and the erasure of an account that is still on the team, in one
   * transaction. The identity provider user is removed LAST: a failure there
   * rolls everything back. `mode` "admin" adds the administrator's refusals
   * (`adminErasureBlocker`), read under the same locks.
   */
  private async eraseLiveAccount(
    userId: string,
    companyId: string,
    authId: string | null,
    gone: () => Error,
    mode: "self" | "admin" = "self",
  ): Promise<{ closeCompany: boolean; listingsTransferred: number }> {
    return this.bypass.$transaction(
      async (tx) => {
        // Company first, then its users (the order the seat gates use).
        await tx.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM company_users WHERE "companyId" = ${companyId} FOR UPDATE`;
        const company = await tx.company.findUnique({
          where: { id: companyId },
          select: {
            ownerUserId: true,
            isActive: true,
            isBlocked: true,
            blockedReason: true,
            blockedAt: true,
          },
        });
        const self = await tx.companyUser.findUnique({
          where: { id: userId },
          select: { deletedAt: true, email: true, companyId: true, isActive: true },
        });
        if (!company || !self || self.deletedAt || self.companyId !== companyId) throw gone();

        const others = await tx.companyUser.findMany({
          where: { companyId, deletedAt: null, id: { not: userId } },
          select: { id: true, isActive: true, permissions: true },
        });
        const isOwner = company.ownerUserId === userId;
        const closeCompany = others.length === 0;

        if (mode === "admin") {
          const blocker = adminErasureBlocker({
            removed: false,
            userActive: self.isActive,
            company,
            closesCompany: closeCompany,
          });
          if (blocker) throw adminErasureRefusal(blocker);
        } else if (closeCompany && company.isBlocked && !isClosedByOwner(company)) {
          // Unreachable today (a suspended company's users cannot sign in), kept
          // so the closure can never replace another suspension.
          throw new ConflictException(
            i18nMessage("api.companyUsers.firmaHesabiAktifDegil", undefined, "ACCOUNT_COMPANY_SUSPENDED"),
          );
        }

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
          // `blockedAt` = the closure date: the reminder job counts the
          // KVKK erasure deadline from it (`ClosedCompanyErasureScheduler`).
          // A company that is ALREADY closed keeps its date (the clock does
          // not restart).
          const alreadyClosed = isClosedByOwner(company);
          await tx.company.update({
            where: { id: companyId },
            data: {
              isBlocked: true,
              blockedReason: CLOSED_BY_OWNER_NOTE,
              blockedAt: alreadyClosed && company.blockedAt ? company.blockedAt : new Date(),
              publicEnabled: false,
            },
          });
          // Nobody joins a closed company: pending team invitations die with
          // it (an accepted one would bring a live account into the erasure
          // queue). `acceptInvitation` also re-reads the company under its lock.
          await tx.companyUserInvitation.updateMany({
            where: { companyId, status: "PENDING" },
            data: { status: "CANCELLED" },
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

        await this.scrubAccount(tx, userId, companyId, { realEmail: self.email, markDeleted: true });
        // LAST: a provider failure rolls the whole deletion back.
        if (authId) await this.supabaseAuth.deleteUserStrict(authId);
        return { closeCompany, listingsTransferred };
      },
      { maxWait: TX_MAX_WAIT_MS, timeout: TX_TIMEOUT_MS },
    );
  }

  /**
   * The account's personal data, removed inside the caller's transaction. What
   * stays is what the privacy texts list as kept: the company's records (the
   * row itself, under the "Silinmiş Kullanıcı" name), security / audit and
   * e-mail delivery logs, the agreement acceptance dates.
   */
  private async scrubAccount(
    tx: Tx,
    userId: string,
    companyId: string,
    opts: { realEmail: string | null; markDeleted: boolean },
  ): Promise<void> {
    await tx.passwordResetToken.deleteMany({ where: { companyUserId: userId } });
    await tx.emailVerificationCode.deleteMany({ where: { companyUserId: userId } });
    await tx.notification.deleteMany({ where: { companyUserId: userId } });
    // Push devices: the phone must stop receiving this account's pushes.
    await tx.pushDevice.deleteMany({ where: { companyUserId: userId } });
    await tx.aiChatSession.deleteMany({ where: { companyId, userId } });
    // AI usage rows are the company's cost ledger and stay; the address goes
    // (the company's AI usage page listed it per person).
    await tx.aiUsage.updateMany({
      where: { companyId, userId, userEmail: { not: null } },
      data: { userEmail: null },
    });
    if (opts.realEmail && !isDeletedAccountEmail(opts.realEmail)) {
      // Team invitations sent to this person: the rows stay (the activity log
      // points at them), the address goes. EXACT match only: invitation and
      // account addresses are stored lower-cased (`CompanyUsersService.invite`,
      // sign-up); a case-insensitive `equals` is an unescaped ILIKE pattern in
      // Postgres, and "a_b@x" would have rewritten a colleague's invitation to
      // "a.b@x". The raw form is matched too, for a row written before the
      // lower-casing.
      const addresses = [...new Set([opts.realEmail, opts.realEmail.toLowerCase()])];
      await tx.companyUserInvitation.updateMany({
        where: { companyId, email: { in: addresses } },
        data: { email: deletedAccountEmail(userId) },
      });
    }
    await tx.companyUser.update({
      where: { id: userId },
      data: {
        email: deletedAccountEmail(userId),
        // Stored placeholder is read by the remaining members: one fixed language.
        firstName: tApi("api.companyAuth.silinmisKullaniciAd", undefined, "tr"),
        lastName: tApi("api.companyAuth.silinmisKullaniciSoyad", undefined, "tr"),
        phone: null,
        isActive: false,
        ...(opts.markDeleted ? { deletedAt: new Date() } : {}),
        authId: null,
        tokenVersion: { increment: 1 },
        twoFactorEnabled: false,
        twoFactorEnabledAt: null,
        twoFactorSecret: null,
        twoFactorRecoveryCodes: [],
        // Policy row 1 lists the notification preferences among the data
        // deleted at once.
        notificationPrefs: Prisma.DbNull,
        marketingConsent: false,
        profileImprovementConsent: false,
      },
    });
  }
}
