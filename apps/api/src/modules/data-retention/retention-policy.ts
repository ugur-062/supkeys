import { AiUsageStatus, Prisma } from "@rothern/db";
import { DEFAULT_TIME_ZONE, zonedParts, zonedTimeToUtc } from "../../common/time/country-time-zone";
import {
  INVITE_CONTEXT_TYPES,
  LIFECYCLE_CONTEXT_PREFIX,
  NOTIFICATION_EMAIL_CLASS,
} from "../email/email-streams";
import { SUPPRESSION_CLEAR_MARKER_WHERE } from "../email/suppression-marker";

/**
 * KİŞİSEL VERİ SAKLAMA VE İMHA POLİTİKASI: THE PERIODS THE JOBS APPLY.
 *
 * The policy is the public page web `sozlesmeler/saklama-imha` ("Kişisel Veri
 * Saklama ve İmha Politikası", section 8 "Saklama ve İmha Süreleri"). Its table
 * is the single source of the periods; this file is its machine-readable half,
 * and the row numbers in the comments below are that table's rows. A period
 * changes in BOTH places in one change, together with the admin label of the
 * job (`apps/admin/src/lib/cron-jobs.ts`). `test/unit/data-retention-policy.spec.ts`
 * pins every number, including the ones enforced elsewhere:
 *  - row 1 account data: at deletion (`AccountDeletionService`) and, for a
 *    member removed from the team, at removal (`CompanyUsersService.remove`);
 *  - row 2 closed companies, 30 days: admin erasure + `account.closedCompanyErasure`
 *    reminder (`CLOSED_COMPANY_ERASURE_DEADLINE_DAYS`, `company-auth/account-closure.ts`);
 *  - row 7 AI assistant chats, 90 days: `ai.cleanupChatSessions` (`AI_CHAT_RETENTION_DAYS` below);
 *  - row 8 view records, 180 days: `views.purge` (`VIEW_RETENTION_DAYS`);
 *  - row 9 revoked sessions, until every token of the session has expired: `sessions.purgeRevoked`;
 *  - row 10 unverified sign-ups, 7 days: `signup.purgeUnverified` (`UNVERIFIED_SIGNUP_TTL_DAYS`);
 *  - row 20 temporary AI uploads, 24 hours: `ai.cleanupExtractFiles` (`AI_TEMP_UPLOAD_RETENTION_HOURS` below);
 *  - rows 5 (access logs at the hosting/CDN providers) and 18 (backups): operator side;
 *  - row 14 opt-out lists (`email_opt_outs`, `referral_opt_outs`) and the
 *    admin suppression-clear markers: kept, no job deletes them;
 *  - rows 23-25 (moderation records, platform staff, mailbox correspondence):
 *    manual review at least every six months (policy section 9).
 * Every other automatic row is applied by ONE nightly job, `retention.purge`
 * (`DataRetentionService`). Commercial records other than the e-mail logs
 * (row 3) and closed companies (row 2) are not deleted automatically: the
 * policy reviews them at least every six months (section 9).
 *
 * Every automatic run writes an imha record (`RetentionRecordService`,
 * policy section 10).
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Periods ────────────────────────────────────────────────────────────────

/** Row 11: password-reset links and e-mail verification codes that were not used, counted from creation. */
export const UNUSED_LINK_RETENTION_DAYS = 30;

/** Row 12: visitor information requests never verified by e-mail, counted from creation. */
export const UNVERIFIED_INQUIRY_RETENTION_DAYS = 30;

/**
 * Row 12: the IP address a visitor request was sent from (abuse checks: the
 * hourly and daily send limits read it), counted from creation - for every
 * request, verified or not.
 */
export const INQUIRY_IP_RETENTION_DAYS = 30;

/**
 * Row 13: contact data of invited third parties - request invitations to
 * unregistered addresses (`external_listing_invites`), the invitation link
 * record of the address (`company_referral_invites`) and companies found by
 * the AI supplier search (`supplier_discovery_candidates`). One year, but
 * never while the request they belong to still collects quotes (see the
 * clauses). The opt-out of such an address (row 14) is a separate table and stays.
 */
export const THIRD_PARTY_CONTACT_RETENTION_YEARS = 1;

/** Row 15: in-app notifications, counted from creation. */
export const NOTIFICATION_RETENTION_YEARS = 1;

/**
 * Row 16: evening digest items, counted from the moment the digest was sent
 * (`sentAt`), and not before the request has stopped collecting quotes for as long.
 */
export const SENT_DIGEST_ITEM_RETENTION_DAYS = 90;

/**
 * Row 17: category searches without a result, counted from the last time the
 * text was searched (`lastSeenAt`): the row keeps the latest typed form only.
 */
export const SEARCH_MISS_RETENTION_YEARS = 1;

/**
 * Row 3: send and delivery logs of mails about commercial transactions
 * (`email_logs` with their `email_events`; every context type not listed in
 * row 21 below), 10 years from the END OF THE CALENDAR YEAR the log was
 * created in (TBK m.146 period of proof; TTK m.82 / VUK m.253 for Rothern's
 * own commercial letters): a log of any day of year Y is deleted from
 * 1 January Y+11 (Istanbul calendar).
 */
export const EMAIL_LOG_RETENTION_YEARS = 10;

/**
 * Row 21 (a): logs of account security and verification mails (password
 * links, sign-in and verification codes, two-step verification notices, team
 * invitations, visitor request verification), counted from creation.
 */
export const SECURITY_EMAIL_LOG_RETENTION_YEARS = 1;

/** Row 21 (b): logs of invitations to unregistered addresses (row 13 data), counted from creation. */
export const INVITE_EMAIL_LOG_RETENTION_YEARS = 1;

/**
 * Row 21 (c): logs of discovery, suggestion, digest, announcement and welcome
 * series mails (the NOTIFICATION and LIFECYCLE e-mail streams), counted from creation.
 */
export const DISCOVERY_EMAIL_LOG_RETENTION_YEARS = 2;

/** Row 4 (and row 19, the imha records themselves): audit records, counted from creation (TBK m.146). */
export const AUDIT_RECORD_RETENTION_YEARS = 10;

/** Row 4: IP address and browser string inside an audit record (5651 m.5/3: at most 2 years). */
export const AUDIT_NETWORK_DATA_RETENTION_YEARS = 2;

/**
 * Row 4, the legal MAXIMUM: the job strips the IP address and browser string
 * this many days BEFORE the two years are reached, so the daily cadence, a
 * missed night or a short outage cannot keep them past the legal ceiling. A
 * period that is a ceiling is the only one with a margin; every other period
 * is our own promise and is applied on the first run after it ends.
 */
export const LEGAL_MAXIMUM_MARGIN_DAYS = 7;

/**
 * Row 6: AI usage records (the AI cost ledger), 5 years from the END OF THE
 * CALENDAR YEAR of creation - a policy choice (KVKK m.5/2-f), aligned with
 * the five-year bookkeeping period.
 */
export const AI_USAGE_RETENTION_YEARS = 5;

/** Row 6: the e-mail address inside an AI usage record, counted from creation. */
export const AI_USAGE_EMAIL_RETENTION_YEARS = 1;

/** Row 7: AI assistant chats untouched for this many days (applied by `ai.cleanupChatSessions`). */
export const AI_CHAT_RETENTION_DAYS = 90;

/** Row 20: temporary files uploaded for AI form filling, counted from upload (applied by `ai.cleanupExtractFiles`). */
export const AI_TEMP_UPLOAD_RETENTION_HOURS = 24;

/**
 * Row 22: team invitations that were not accepted (pending past expiry,
 * cancelled, expired), counted from the last change of the invitation. An
 * accepted invitation carries the member's own address: account data (row 1).
 */
export const TEAM_INVITATION_RETENTION_YEARS = 1;

// ─── E-mail log groups (row 3 vs row 21) ────────────────────────────────────

/** Row 21 (a): context types of account security and verification mails. */
export const SECURITY_EMAIL_CONTEXTS: readonly string[] = [
  "password_reset",
  "password_changed",
  "login_2fa",
  "email_verify",
  "two_factor_enabled",
  "two_factor_disabled",
  "two_factor_locked",
  "company_user_invitation",
  "public_inquiry_verify",
];

/** Row 21 (b): invitations to unregistered addresses (the INVITE stream, `email-streams.ts`). */
export const INVITE_EMAIL_CONTEXTS: readonly string[] = [...INVITE_CONTEXT_TYPES];

/**
 * Row 21 (c): discovery, suggestion, digest and announcement mails - the
 * types `email-streams.ts` classes as DISCOVERY (NOTIFICATION stream) - plus
 * every `lifecycle_*` context (LIFECYCLE stream). A type added there follows
 * automatically; any context type not in row 21 stays under row 3.
 */
export const DISCOVERY_EMAIL_CONTEXTS: readonly string[] = Object.entries(NOTIFICATION_EMAIL_CLASS)
  .filter(([, cls]) => cls === "DISCOVERY")
  .map(([type]) => type);

// ─── Cut-off instants ───────────────────────────────────────────────────────

export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

/** The same instant `years` calendar years earlier (UTC fields; 29 February falls on 1 March). */
export function yearsBefore(now: Date, years: number): Date {
  const d = new Date(now.getTime());
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

/**
 * "`years` years from the end of the calendar year of creation" (Istanbul
 * calendar): a record created before the returned instant is past its period.
 * Created in year Y -> kept through 31 December Y+years -> past it from
 * 1 January Y+years+1, i.e. when `now` is in year Y+years+1 or later, i.e.
 * Y < (current year - years).
 */
export function calendarYearsCutoff(now: Date, years: number): Date {
  const year = zonedParts(now, DEFAULT_TIME_ZONE).year;
  return zonedTimeToUtc(year - years, 1, 1, 0, 0, DEFAULT_TIME_ZONE);
}

export interface RetentionCutoffs {
  unusedLinks: Date;
  unverifiedInquiries: Date;
  inquiryIps: Date;
  thirdPartyContacts: Date;
  teamInvitations: Date;
  notifications: Date;
  sentDigestItems: Date;
  searchMisses: Date;
  emailLogs: Date;
  securityEmailLogs: Date;
  inviteEmailLogs: Date;
  discoveryEmailLogs: Date;
  auditRecords: Date;
  auditNetworkData: Date;
  aiUsageRecords: Date;
  aiUsageEmails: Date;
}

/** Every cut-off of one run, from one clock reading. Rows strictly OLDER than a cut-off are processed. */
export function retentionCutoffs(now: Date): RetentionCutoffs {
  return {
    unusedLinks: daysBefore(now, UNUSED_LINK_RETENTION_DAYS),
    unverifiedInquiries: daysBefore(now, UNVERIFIED_INQUIRY_RETENTION_DAYS),
    inquiryIps: daysBefore(now, INQUIRY_IP_RETENTION_DAYS),
    thirdPartyContacts: yearsBefore(now, THIRD_PARTY_CONTACT_RETENTION_YEARS),
    teamInvitations: yearsBefore(now, TEAM_INVITATION_RETENTION_YEARS),
    notifications: yearsBefore(now, NOTIFICATION_RETENTION_YEARS),
    sentDigestItems: daysBefore(now, SENT_DIGEST_ITEM_RETENTION_DAYS),
    searchMisses: yearsBefore(now, SEARCH_MISS_RETENTION_YEARS),
    emailLogs: calendarYearsCutoff(now, EMAIL_LOG_RETENTION_YEARS),
    securityEmailLogs: yearsBefore(now, SECURITY_EMAIL_LOG_RETENTION_YEARS),
    inviteEmailLogs: yearsBefore(now, INVITE_EMAIL_LOG_RETENTION_YEARS),
    discoveryEmailLogs: yearsBefore(now, DISCOVERY_EMAIL_LOG_RETENTION_YEARS),
    auditRecords: yearsBefore(now, AUDIT_RECORD_RETENTION_YEARS),
    // `daysBefore` with a negative count moves forward: the margin makes the
    // cut-off LATER, so the data goes before the ceiling.
    auditNetworkData: daysBefore(yearsBefore(now, AUDIT_NETWORK_DATA_RETENTION_YEARS), -LEGAL_MAXIMUM_MARGIN_DAYS),
    aiUsageRecords: calendarYearsCutoff(now, AI_USAGE_RETENTION_YEARS),
    aiUsageEmails: yearsBefore(now, AI_USAGE_EMAIL_RETENTION_YEARS),
  };
}

/**
 * Self-repair of the in-place scans (watermarks, `RetentionRecordService`):
 * on Sundays (Istanbul) the job ignores the watermark and scans the whole
 * range below the cut-off, so a row that slipped below the watermark (a
 * restored or merged data set, a backfill with an explicit creation time, a
 * bad watermark value) is still stripped within a week - the 5651 ceiling
 * never depends on the watermark chain alone.
 */
export function isFullScanDay(now: Date): boolean {
  return zonedParts(now, DEFAULT_TIME_ZONE).weekday === 0;
}

// ─── Exact WHERE clauses ────────────────────────────────────────────────────
//
// Each clause is the WHOLE rule: the job selects a bounded batch of ids with
// it and then deletes / updates `{ id in batch AND <the same clause> }`, so a
// row that changed in between is left alone. Index use is noted per clause;
// tables without a timestamp index are small or bounded (see the job notes).

/**
 * Row 11, password-reset links. Unused (or used) links 30 days after
 * creation; a USED link as soon as it has expired too. A used link is kept
 * until then on purpose: the reset page tells "this link was already used"
 * (login-16) while the link would otherwise still be valid, and a failed
 * password update gives the claimed link back (`confirmPasswordReset`).
 * Link lifetimes are 60 minutes (reset) and 72 hours (account set-up).
 * No timestamp index: the table holds at most a few rows per account.
 */
export function passwordResetLinkWhere(now: Date): Prisma.PasswordResetTokenWhereInput {
  const c = retentionCutoffs(now);
  return {
    OR: [{ createdAt: { lt: c.unusedLinks } }, { usedAt: { not: null }, expiresAt: { lt: now } }],
  };
}

/**
 * Row 11, e-mail verification codes. A code that verified is deleted at use
 * (`CompanyAuthService`); what is left are closed or expired codes, deleted
 * 30 days after creation. (The hourly code cap counts the last 60 minutes, far
 * inside this period.) No timestamp index: small table.
 */
export function verificationCodeWhere(now: Date): Prisma.EmailVerificationCodeWhereInput {
  return { createdAt: { lt: retentionCutoffs(now).unusedLinks } };
}

/**
 * Row 12: visitor requests never verified. A verified request is commercial
 * correspondence (row 3) and is never touched here. Unverified requests are
 * never forwarded, claimed or answered; the two extra conditions only make
 * sure the cascade to replies can never fire. No `createdAt` index (the
 * `(companyId, verifiedAt)` index needs a company): small table.
 */
export function unverifiedInquiryWhere(now: Date): Prisma.PublicInquiryWhereInput {
  return {
    verifiedAt: null,
    claimedCompanyId: null,
    createdAt: { lt: retentionCutoffs(now).unverifiedInquiries },
    replies: { none: {} },
  };
}

/**
 * Row 12: the sender IP of visitor requests older than 30 days (the verified
 * ones stay as commercial correspondence, without the IP). `from`: watermark,
 * as for the audit records below. No `createdAt` index: small table.
 */
export function inquiryIpWhere(now: Date, from?: Date | null): Prisma.PublicInquiryWhereInput {
  return {
    createdIp: { not: null },
    createdAt: { lt: retentionCutoffs(now).inquiryIps, ...(from ? { gte: from } : {}) },
  };
}

/**
 * The request (listing) side of rows 13 and 16: the request has stopped
 * collecting quotes - any status but OPEN - and has not changed for the whole
 * period (`updatedAt`: a status change moves it). While a request is open
 * (up to two years plus extensions) its invitation rows are still read: an
 * invited address that signs up is attached to it, the preview link of the
 * invitation mail opens it, the second discovery round and the "already got
 * this request" checks exclude earlier addresses through them. A request in
 * evaluation, closed by moderation or still a draft that nobody touched for
 * the period does not need them any more.
 */
function settledListing(cut: Date): Prisma.ListingWhereInput {
  return { status: { not: "OPEN" }, updatedAt: { lt: cut } };
}

/**
 * Row 13: request invitations to unregistered addresses, a year after the
 * invitation AND a year after the request settled (above). Nothing points at
 * these rows (the listing and the referral invitation are their parents; the
 * opt-out lists are separate tables). No `createdAt`-leading index (only
 * `(inviterCompanyId, createdAt)`; `inviterCompanyId` has no foreign key, so
 * it cannot drive an exact scan).
 */
export function externalInviteWhere(now: Date): Prisma.ExternalListingInviteWhereInput {
  const cut = retentionCutoffs(now).thirdPartyContacts;
  return { createdAt: { lt: cut }, listing: settledListing(cut) };
}

/**
 * Row 13: the invitation link record of an unregistered address (inviting
 * company x address: link token, last click, language). Deleted when no
 * request invitation points at it any more (the cascade would otherwise take
 * them), and neither a send (`updatedAt`) nor a click (`lastClickedAt`)
 * happened for a year. The cap and brake counts of invitations read only
 * the last days (`touchedToday`, the resend cooldown, the 90-day pause
 * window), far inside the year. An ACCEPTED record goes the same way: the
 * address is then a member's, kept with the account (row 1). No timestamp
 * index: one row per inviting company and address.
 */
export function staleReferralInviteWhere(now: Date): Prisma.CompanyReferralInviteWhereInput {
  const cut = retentionCutoffs(now).thirdPartyContacts;
  return {
    updatedAt: { lt: cut },
    OR: [{ lastClickedAt: null }, { lastClickedAt: { lt: cut } }],
    listingInvites: { none: {} },
  };
}

/**
 * Row 13: AI supplier search candidates (non-member names, e-mails, web
 * sites), a year after the search AND a year after its request settled (a
 * search before the request existed has no request). The run row
 * (`supplier_discovery_runs`: trigger, cost, dates) stays. Index: `runId` only.
 */
export function discoveryCandidateWhere(now: Date): Prisma.SupplierDiscoveryCandidateWhereInput {
  const cut = retentionCutoffs(now).thirdPartyContacts;
  return {
    createdAt: { lt: cut },
    run: { OR: [{ listingId: null }, { listing: { is: settledListing(cut) } }] },
  };
}

/**
 * Row 22: team invitations that were never accepted, a year after their last
 * change, once expired. The activity log resolves an invitation entry's
 * address from this row at read time; an entry older than the row shows no
 * address. Index: `(companyId, status)` / `(email, status)` - none leads with
 * a timestamp; small table.
 */
export function staleTeamInvitationWhere(now: Date): Prisma.CompanyUserInvitationWhereInput {
  const cut = retentionCutoffs(now).teamInvitations;
  return { status: { not: "ACCEPTED" }, updatedAt: { lt: cut }, expiresAt: { lt: cut } };
}

/**
 * Row 15: in-app notifications. The job applies it per page of account ids
 * (`companyUserId IN (...) AND createdAt < cut-off` = index
 * `(companyUserId, createdAt)`); every notification belongs to an account
 * (foreign key, NOT NULL), so the pages cover all of them. Readers that use
 * notifications as "already sent" markers look back 14 days to a month.
 */
export function notificationWhere(now: Date): Prisma.NotificationWhereInput {
  return { createdAt: { lt: retentionCutoffs(now).notifications } };
}

/**
 * Row 16: digest items that were sent 90 days ago, once their request settled
 * for as long (above). The item is the "this address already got this
 * request" marker of the hidden AI match notice (`notifyHiddenAiMatches`)
 * while the request is open. Unsent items wait for their digest.
 * `email_digest_items.listingId` has no foreign key, so the rule is SQL (one
 * fragment for the select and the delete); a missing request counts as
 * settled. Index `(sentAt, createdAt)` + the listing primary key.
 */
export function sentDigestItemSql(now: Date): Prisma.Sql {
  const cut = retentionCutoffs(now).sentDigestItems;
  return Prisma.sql`d."sentAt" < ${cut} AND NOT EXISTS (
    SELECT 1 FROM listings l
    WHERE l.id = d."listingId" AND (l.status = 'OPEN' OR l."updatedAt" >= ${cut})
  )`;
}

/** Row 17: category searches without a result, not searched again for a year. No index: small table (one row per distinct text). */
export function searchMissWhere(now: Date): Prisma.CategorySearchMissWhereInput {
  return { lastSeenAt: { lt: retentionCutoffs(now).searchMisses } };
}

/**
 * The fixed subject of an e-mail log reduced to a refusal record (rows 3 / 21
 * and 14). Doubles as the marker of rows already reduced. ASCII on purpose:
 * system-written database text is a code, not a sentence (admin shows it as is).
 */
export const REDUCED_EMAIL_LOG_SUBJECT = "[[RETENTION_REDUCED]] refusal record only";

/**
 * Which logs are past their period (rows 3 and 21), by context type:
 * security / verification and invitation mails after a year, discovery and
 * welcome-series mails after two, everything else (commercial transactions,
 * a log without a context) 10 years from the end of its calendar year. Every
 * log is past its period after the longest one, whatever its group - the last
 * branch. Index `queuedAt`, and `(contextType, contextId)` for the listed groups.
 */
function emailLogPastPeriod(now: Date): Prisma.EmailLogWhereInput {
  const c = retentionCutoffs(now);
  return {
    OR: [
      { contextType: { in: [...SECURITY_EMAIL_CONTEXTS] }, queuedAt: { lt: c.securityEmailLogs } },
      { contextType: { in: [...INVITE_EMAIL_CONTEXTS] }, queuedAt: { lt: c.inviteEmailLogs } },
      { contextType: { in: [...DISCOVERY_EMAIL_CONTEXTS] }, queuedAt: { lt: c.discoveryEmailLogs } },
      { contextType: { startsWith: LIFECYCLE_CONTEXT_PREFIX }, queuedAt: { lt: c.discoveryEmailLogs } },
      { queuedAt: { lt: c.emailLogs } },
    ],
  };
}

/**
 * A spam complaint: the status says so, or the complaint time does (the
 * webhook sets BOUNCED over COMPLAINED when a hard bounce follows the
 * complaint, `resend-event.service.ts`; the complaint must not be lost then).
 */
const COMPLAINT_WHERE: Prisma.EmailLogWhereInput = {
  OR: [{ status: "COMPLAINED" }, { complainedAt: { not: null } }],
};

/**
 * Rows 3 and 21, deletion: e-mail logs past their period, with their events
 * (foreign-key cascade).
 *
 * TWO KINDS OF LOG ARE NOT DELETED, because the sending gate reads them
 * (`EmailService` suppression, `EmailSuppressionService`):
 *  - a SPAM COMPLAINT is the recipient's refusal; deleting it would let mail
 *    reach that address again. It is REDUCED instead (below);
 *  - an admin "suppression clear" marker: it carries only the address and
 *    must outlive the complaints it cleared, or a cleared address would be
 *    blocked again (row 14).
 * A HARD BOUNCE is deleted like any log of its group: after its period the
 * address may exist again (one more send to a dead address bounces and blocks
 * it again).
 */
export function expiredEmailLogWhere(now: Date): Prisma.EmailLogWhereInput {
  return {
    AND: [emailLogPastPeriod(now)],
    NOT: [COMPLAINT_WHERE, SUPPRESSION_CLEAR_MARKER_WHERE],
  };
}

/**
 * Rows 3 / 21 + row 14: a spam complaint past its group's period keeps only
 * what the refusal needs - address, status and dates. Subject, recipient
 * name, template data, provider id, error text and context go; its webhook
 * events are deleted. The rows already reduced are few.
 */
export function complaintLogToReduceWhere(now: Date): Prisma.EmailLogWhereInput {
  return {
    AND: [emailLogPastPeriod(now), COMPLAINT_WHERE],
    subject: { not: REDUCED_EMAIL_LOG_SUBJECT },
  };
}

/** A log reduced to a refusal record (admin cannot resend it: no template data, no context). */
export function isReducedEmailLog(log: { subject?: string | null }): boolean {
  return log.subject === REDUCED_EMAIL_LOG_SUBJECT;
}

export const REDUCED_EMAIL_LOG_DATA = {
  subject: REDUCED_EMAIL_LOG_SUBJECT,
  toName: null,
  payload: Prisma.DbNull,
  errorMessage: null,
  bounceReason: null,
  providerMessageId: null,
  contextType: null,
  contextId: null,
} satisfies Prisma.EmailLogUpdateManyMutationInput;

/** Row 4 / row 19: audit records past 10 years (imha records included). Index `createdAt`. */
export function expiredAuditRecordWhere(now: Date): Prisma.AuditLogWhereInput {
  return { createdAt: { lt: retentionCutoffs(now).auditRecords } };
}

/**
 * Row 4: audit records whose IP address or browser string is still there
 * after the two-year ceiling. Index `createdAt`. `from`: the cut-off up to
 * which an earlier run already stripped every row (`RetentionRecordService`
 * watermark) - without it the scan would walk every stripped row of the
 * last eight years each night. Ignored once a week (`isFullScanDay`).
 */
export function auditNetworkDataWhere(now: Date, from?: Date | null): Prisma.AuditLogWhereInput {
  return {
    createdAt: { lt: retentionCutoffs(now).auditNetworkData, ...(from ? { gte: from } : {}) },
    OR: [{ ip: { not: null } }, { userAgent: { not: null } }],
  };
}

/**
 * Every AI usage status, listed so the `(status, createdAt)` index serves the
 * scans below (`status IN (all) AND createdAt < x` is one index range per
 * status; there is no index that starts with `createdAt`).
 */
export const ALL_AI_USAGE_STATUSES = Object.values(AiUsageStatus);

/** Row 6: AI usage records past the calendar-year period. */
export function expiredAiUsageWhere(now: Date): Prisma.AiUsageWhereInput {
  return {
    status: { in: ALL_AI_USAGE_STATUSES },
    createdAt: { lt: retentionCutoffs(now).aiUsageRecords },
  };
}

/** Row 6: the e-mail address inside AI usage records older than a year (`from`: watermark, as above). */
export function aiUsageEmailWhere(now: Date, from?: Date | null): Prisma.AiUsageWhereInput {
  return {
    status: { in: ALL_AI_USAGE_STATUSES },
    createdAt: { lt: retentionCutoffs(now).aiUsageEmails, ...(from ? { gte: from } : {}) },
    userEmail: { not: null },
  };
}
