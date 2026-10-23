/**
 * PERIODIC DESTRUCTION (Kişisel Veri Saklama ve İmha Politikası, 2026-10-16)
 * on the real test database.
 *
 * `DataRetentionService.run` applies the automatic periods of the policy table
 * (`retention-policy.ts`). Every table gets rows just past and just inside
 * its period; the run must process exactly the old ones, leave the recent
 * ones, leave every other table alone, and write ONE imha record (system
 * actor, counts only). Switched off it must touch nothing. The older purge
 * jobs write the same kind of record.
 */
import type { ConfigService } from "@nestjs/config";
import { CronRegistryService } from "../../src/common/cron/cron-registry.service";
import { SessionRevocationScheduler } from "../../src/common/auth/session-revocation.scheduler";
import { CompanyViewsScheduler } from "../../src/modules/company-views/company-views.scheduler";
import {
  DATA_RETENTION_JOB,
  DataRetentionService,
  RETENTION_CATEGORIES,
  type RetentionLimits,
} from "../../src/modules/data-retention/data-retention.service";
import {
  REDUCED_EMAIL_LOG_SUBJECT,
  calendarYearsCutoff,
  isFullScanDay,
  retentionCutoffs,
  yearsBefore,
} from "../../src/modules/data-retention/retention-policy";
import { DATA_RETENTION_ACTION, RetentionRecordService } from "../../src/modules/data-retention/retention-record.service";
import { EmailSuppressionService } from "../../src/modules/email/email-suppression.service";
import {
  INTERNAL_EMAIL_PROVIDER,
  SUPPRESSION_CLEAR_TEMPLATE,
} from "../../src/modules/email/suppression-marker";
import { makeCompanyWithUser, makeListing, makeUser } from "./factories";
import { prisma, truncateAll } from "./test-db";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});
beforeEach(async () => {
  await truncateAll();
});

const envConfig = (env: Record<string, string | undefined>) =>
  ({ get: (key: string) => env[key] }) as unknown as ConfigService;

function makeStack(env: Record<string, string | undefined> = { NODE_ENV: "production" }) {
  const records = new RetentionRecordService(prisma as never);
  const service = new DataRetentionService(prisma as never, records, envConfig(env));
  return { records, service };
}

/** The same day, or the next one when it is a Sunday (the weekly full scan ignores watermarks). */
const notFullScanDay = (d: Date) => (isFullScanDay(d) ? new Date(d.getTime() + DAY) : d);

/** Moves a request to a status with a last change in the past (`updatedAt` is set by Prisma on write). */
async function settle(listingId: string, status: "CANCELLED" | "AWARDED" | "IN_AWARD", updatedAt: Date) {
  await prisma.$executeRaw`UPDATE listings SET status = ${status}::"ListingStatus", "updatedAt" = ${updatedAt} WHERE id = ${listingId}`;
}

const imhaRecords = (job = DATA_RETENTION_JOB) =>
  prisma.auditLog.findMany({
    where: { action: DATA_RETENTION_ACTION, metadata: { path: ["job"], equals: job } },
    orderBy: { createdAt: "asc" },
  });

/** Row counts of every table the job must NOT change. */
async function untouchedTables() {
  return {
    companies: await prisma.company.count(),
    users: await prisma.companyUser.count(),
    listings: await prisma.listing.count(),
    products: await prisma.companyItem.count(),
    discoveryRuns: await prisma.supplierDiscoveryRun.count(),
    emailOptOuts: await prisma.emailOptOut.count(),
    referralOptOuts: await prisma.referralOptOut.count(),
    inquiryReplies: await prisma.publicInquiryReply.count(),
  };
}

/**
 * One row just past and one just inside every period (plus the special cases
 * of each rule), all relative to `now`. Returns the ids the checks need.
 */
async function seedWorld(now: Date) {
  const ago = (ms: number) => new Date(now.getTime() - ms);
  const cut = retentionCutoffs(now);
  const buyer = await makeCompanyWithUser(prisma);
  const second = await makeUser(prisma, buyer.company.id);
  // Three requests: still collecting quotes; cancelled 400 days ago; awarded 10 days ago.
  const listing = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id });
  const closed = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id });
  await settle(closed.id, "CANCELLED", ago(400 * DAY));
  const recentlyClosed = await makeListing(prisma, { companyId: buyer.company.id, createdById: buyer.user.id });
  await settle(recentlyClosed.id, "AWARDED", ago(10 * DAY));
  const product = await prisma.companyItem.create({
    data: { companyId: buyer.company.id, createdById: buyer.user.id, name: "Vana", unit: "adet", slug: "vana" },
  });

  // Row 11: password links.
  const link = (over: { createdAt: Date; expiresAt: Date; usedAt?: Date }, hash: string) =>
    prisma.passwordResetToken.create({ data: { companyUserId: buyer.user.id, tokenHash: hash, ...over } });
  const links = {
    oldUnused: await link({ createdAt: ago(31 * DAY), expiresAt: ago(31 * DAY - HOUR) }, "h-old-unused"),
    recentExpiredUnused: await link({ createdAt: ago(29 * DAY), expiresAt: ago(29 * DAY - HOUR) }, "h-recent-unused"),
    usedExpired: await link({ createdAt: ago(2 * DAY), expiresAt: ago(2 * DAY - HOUR), usedAt: ago(2 * DAY - 30 * MIN) }, "h-used-expired"),
    usedStillValid: await link({ createdAt: ago(10 * MIN), expiresAt: new Date(now.getTime() + 50 * MIN), usedAt: ago(5 * MIN) }, "h-used-valid"),
    live: await link({ createdAt: ago(MIN), expiresAt: new Date(now.getTime() + 59 * MIN) }, "h-live"),
  };

  // Row 11: verification codes.
  const code = (createdAt: Date, usedAt?: Date) =>
    prisma.emailVerificationCode.create({
      data: { companyUserId: second.id, codeHash: "c", createdAt, expiresAt: new Date(createdAt.getTime() + 15 * MIN), usedAt },
    });
  const codes = {
    old: await code(ago(30 * DAY + MIN)),
    recent: await code(ago(30 * DAY - MIN)),
    closedRecent: await code(ago(HOUR), ago(HOUR - MIN)),
  };

  // Row 12: visitor requests.
  let n = 0;
  const inquiry = (over: Record<string, unknown>) =>
    prisma.publicInquiry.create({
      data: {
        companyId: buyer.company.id,
        productId: product.id,
        name: "Ziyaretçi",
        email: `ziyaretci${++n}@example.com`,
        message: "Fiyat?",
        tokenHash: `inq-${n}`,
        expiresAt: ago(29 * DAY),
        ...over,
      },
    });
  const inquiries = {
    unverifiedOld: await inquiry({ createdAt: ago(31 * DAY), createdIp: "198.51.100.20" }),
    unverifiedRecent: await inquiry({ createdAt: ago(29 * DAY), createdIp: "198.51.100.21" }),
    verifiedOld: await inquiry({ createdAt: ago(800 * DAY), verifiedAt: ago(800 * DAY), createdIp: "198.51.100.22" }),
    verifiedRecent: await inquiry({ createdAt: ago(10 * DAY), verifiedAt: ago(10 * DAY), createdIp: "198.51.100.23" }),
    claimedOld: await inquiry({ createdAt: ago(800 * DAY), verifiedAt: ago(800 * DAY), claimedCompanyId: buyer.company.id }),
    // Cannot happen (an unverified request is never shown to the seller), but
    // the rule must never cascade into a reply.
    unverifiedOldWithReply: await inquiry({ createdAt: ago(31 * DAY) }),
  };
  await prisma.publicInquiryReply.create({
    data: { inquiryId: inquiries.unverifiedOldWithReply.id, authorId: buyer.user.id, body: "Yanıt" },
  });

  // Row 13: invitations to unregistered addresses, their link records,
  // discovery candidates; row 14 opt-outs.
  const referral = async (email: string, over: { updatedAt?: Date; lastClickedAt?: Date } = {}) => {
    const row = await prisma.companyReferralInvite.create({
      data: { inviterCompanyId: buyer.company.id, email, invitedById: buyer.user.id, lastClickedAt: over.lastClickedAt },
    });
    if (over.updatedAt) {
      await prisma.$executeRaw`UPDATE company_referral_invites SET "updatedAt" = ${over.updatedAt} WHERE id = ${row.id}`;
    }
    return row;
  };
  const yearAgo = yearsBefore(now, 1);
  const refOld = await referral("eski-davet@disfirma.com");
  const refRecent = await referral("yeni-davet@disfirma.com");
  const extInvite = (ref: { id: string; email: string }, createdAt: Date, listingId = closed.id) =>
    prisma.externalListingInvite.create({
      data: {
        listingId,
        inviterCompanyId: buyer.company.id,
        referralInviteId: ref.id,
        email: ref.email,
        locale: "tr",
        state: "SENT",
        sentAt: createdAt,
        createdAt,
      },
    });
  const refOldest = await referral("en-eski@disfirma.com");
  const refOpen = await referral("acik-talep@disfirma.com", { updatedAt: ago(800 * DAY) });
  const refRecentlyClosed = await referral("yeni-kapanan@disfirma.com", { updatedAt: ago(800 * DAY) });
  const invites = {
    old: await extInvite(refOld, yearAgo), // exactly one year: not strictly older
    oldest: await extInvite(refOldest, new Date(yearAgo.getTime() - MIN)),
    recent: await extInvite(refRecent, ago(364 * DAY)),
    // Two years old, but the request still collects quotes / settled only 10 days ago.
    onOpenRequest: await extInvite(refOpen, ago(730 * DAY), listing.id),
    onRecentlyClosed: await extInvite(refRecentlyClosed, ago(730 * DAY), recentlyClosed.id),
  };
  await prisma.referralOptOut.create({ data: { email: refOldest.email } });
  await prisma.emailOptOut.create({ data: { email: refOldest.email, scope: "all" } });
  // Link records: no request invitation left and nothing for a year -> deleted;
  // a click inside the year, or a request invitation still pointing at it -> kept.
  const referrals = {
    stale: await referral("bayat@disfirma.com", { updatedAt: new Date(yearAgo.getTime() - MIN) }),
    staleAccepted: await referral("kabul@disfirma.com", { updatedAt: ago(500 * DAY) }),
    clickedRecently: await referral("tiklanan@disfirma.com", { updatedAt: ago(500 * DAY), lastClickedAt: ago(10 * DAY) }),
    withOpenRequest: refOpen,
    // Its only request invitation goes tonight, but it was touched today: kept.
    freedToday: refOldest,
  };
  await prisma.companyReferralInvite.update({
    where: { id: referrals.staleAccepted.id },
    data: { status: "ACCEPTED", acceptedAt: ago(500 * DAY) },
  });
  await prisma.$executeRaw`UPDATE company_referral_invites SET "updatedAt" = ${ago(500 * DAY)} WHERE id = ${referrals.staleAccepted.id}`;

  const discoveryRun = (listingId: string | null) =>
    prisma.supplierDiscoveryRun.create({
      data: { companyId: buyer.company.id, listingId, trigger: listingId ? "PUBLISH" : "FORM", state: "DONE", createdAt: ago(800 * DAY) },
    });
  const run = await discoveryRun(closed.id);
  const openRun = await discoveryRun(listing.id);
  const formRun = await discoveryRun(null);
  const candidate = (runId: string, name: string, createdAt: Date) =>
    prisma.supplierDiscoveryCandidate.create({ data: { runId, name, email: `${name}@aday.com`, website: `https://${name}.com`, createdAt } });
  const candidates = {
    old: await candidate(run.id, "eskiaday", new Date(cut.thirdPartyContacts.getTime() - MIN)),
    recent: await candidate(run.id, "yeniaday", ago(10 * DAY)),
    onOpenRequest: await candidate(openRun.id, "acikaday", ago(730 * DAY)),
    beforeRequest: await candidate(formRun.id, "formaday", ago(730 * DAY)),
  };

  // Row 22: team invitations.
  const teamInvite = async (status: "PENDING" | "CANCELLED" | "EXPIRED" | "ACCEPTED", lastChange: Date, expiresAt: Date) => {
    const row = await prisma.companyUserInvitation.create({
      data: {
        companyId: buyer.company.id,
        email: `ekip-${status.toLowerCase()}-${lastChange.getTime()}@example.com`,
        token: `team-${status}-${lastChange.getTime()}`,
        status,
        expiresAt,
        invitedById: buyer.user.id,
      },
    });
    await prisma.$executeRaw`UPDATE company_user_invitations SET "updatedAt" = ${lastChange} WHERE id = ${row.id}`;
    return row;
  };
  const teamInvitations = {
    cancelledOld: await teamInvite("CANCELLED", ago(400 * DAY), ago(395 * DAY)),
    pendingExpiredOld: await teamInvite("PENDING", ago(400 * DAY), ago(395 * DAY)),
    acceptedOld: await teamInvite("ACCEPTED", ago(400 * DAY), ago(395 * DAY)),
    cancelledRecent: await teamInvite("CANCELLED", ago(10 * DAY), ago(5 * DAY)),
  };

  // Row 15: notifications of two accounts.
  const notification = (userId: string, createdAt: Date) =>
    prisma.notification.create({
      data: { companyUserId: userId, companyId: buyer.company.id, type: "listing_invitation", title: "t", body: "b", createdAt },
    });
  const notifications = {
    oldA: await notification(buyer.user.id, new Date(cut.notifications.getTime() - MIN)),
    oldB: await notification(second.id, ago(500 * DAY)),
    recentA: await notification(buyer.user.id, ago(364 * DAY)),
  };

  // Row 16: digest items (the request is the "already got it" scope while it is open).
  const digest = (email: string, sentAt: Date | null, createdAt: Date, listingId = closed.id) =>
    prisma.emailDigestItem.create({
      data: { email, locale: "tr", companyId: buyer.company.id, kind: "CATEGORY_MATCH", listingId, sentAt, createdAt },
    });
  const digests = {
    sentOld: await digest("d1@example.com", ago(91 * DAY), ago(92 * DAY)),
    sentRecent: await digest("d2@example.com", ago(89 * DAY), ago(92 * DAY)),
    unsentOld: await digest("d3@example.com", null, ago(200 * DAY)),
    sentOldOpenRequest: await digest("d4@example.com", ago(400 * DAY), ago(400 * DAY), listing.id),
    sentOldRecentlyClosed: await digest("d5@example.com", ago(400 * DAY), ago(400 * DAY), recentlyClosed.id),
    sentOldGoneRequest: await digest("d6@example.com", ago(400 * DAY), ago(400 * DAY), "listing-that-is-gone"),
  };

  // Row 17: category searches.
  const misses = {
    stale: await prisma.categorySearchMiss.create({
      data: { query: "abkant", rawQuery: "Abkant", firstSeenAt: ago(900 * DAY), lastSeenAt: new Date(cut.searchMisses.getTime() - MIN) },
    }),
    stillSearched: await prisma.categorySearchMiss.create({
      data: { query: "giyotin", rawQuery: "Giyotin", firstSeenAt: ago(900 * DAY), lastSeenAt: ago(10 * DAY) },
    }),
  };

  // Row 3: e-mail logs around the calendar-year cut-off.
  const pastYear = new Date(cut.emailLogs.getTime() - DAY);
  const insideYear = new Date(cut.emailLogs.getTime() + MIN);
  const log = (over: Record<string, unknown>) =>
    prisma.emailLog.create({
      data: { template: "listing_invitation", subject: "Talep daveti", provider: "resend", status: "DELIVERED", ...over } as never,
    });
  const logs = {
    oldDelivered: await log({ toEmail: "alici@eski.com", toName: "Alıcı", queuedAt: pastYear, payload: { name: "Alıcı" } }),
    oldHardBounce: await log({ toEmail: "olu@eski.com", queuedAt: pastYear, status: "BOUNCED", bounceType: "hard", bouncedAt: pastYear }),
    oldComplaint: await log({
      toEmail: "sikayet@eski.com",
      toName: "Şikâyetçi",
      queuedAt: pastYear,
      status: "COMPLAINED",
      complainedAt: pastYear,
      payload: { name: "Şikâyetçi" },
      providerMessageId: "pm-complaint",
      contextType: "listing_invitation",
      contextId: listing.id,
    }),
    // A complaint an admin cleared later (both past the period).
    clearedComplaint: await log({ toEmail: "aklanan@eski.com", queuedAt: new Date(pastYear.getTime() - DAY), status: "COMPLAINED" }),
    oldMarker: await log({
      toEmail: "aklanan@eski.com",
      template: SUPPRESSION_CLEAR_TEMPLATE,
      subject: "suppression clear (admin)",
      provider: INTERNAL_EMAIL_PROVIDER,
      status: "SENT",
      queuedAt: pastYear,
    }),
    insideYear: await log({ toEmail: "alici@yeni.com", queuedAt: insideYear }),
    recent: await log({ toEmail: "alici@bugun.com", queuedAt: now }),
    // A complaint the webhook later overwrote with a hard bounce: still a complaint.
    complaintThenBounce: await log({
      toEmail: "sikayet-sonra-donus@eski.com",
      queuedAt: pastYear,
      status: "BOUNCED",
      bounceType: "hard",
      bouncedAt: pastYear,
      complainedAt: pastYear,
    }),
    // Row 21: shorter periods by kind of mail; commercial mail (row 3) stays 10 years.
    securityOld: await log({ toEmail: "sifre@example.com", contextType: "password_reset", queuedAt: new Date(cut.securityEmailLogs.getTime() - DAY) }),
    securityRecent: await log({ toEmail: "kod@example.com", contextType: "login_2fa", queuedAt: ago(364 * DAY) }),
    inviteOld: await log({ toEmail: "davet@disfirma.com", contextType: "tender_external_invite", queuedAt: new Date(cut.inviteEmailLogs.getTime() - DAY) }),
    inviteComplaintOld: await log({
      toEmail: "davet-sikayet@disfirma.com",
      contextType: "referral_invite",
      status: "COMPLAINED",
      complainedAt: new Date(cut.inviteEmailLogs.getTime() - DAY),
      queuedAt: new Date(cut.inviteEmailLogs.getTime() - DAY),
    }),
    discoveryOld: await log({ toEmail: "eslesme@example.com", contextType: "listing_category_match", queuedAt: new Date(cut.discoveryEmailLogs.getTime() - DAY) }),
    lifecycleOld: await log({ toEmail: "karsilama@example.com", contextType: "lifecycle_profile", queuedAt: new Date(cut.discoveryEmailLogs.getTime() - DAY) }),
    lifecycleInside: await log({ toEmail: "haftalik@example.com", contextType: "lifecycle_weekly", queuedAt: new Date(cut.discoveryEmailLogs.getTime() + DAY) }),
    commercialThreeYears: await log({ toEmail: "siparis@example.com", contextType: "order_status_changed", queuedAt: ago(3 * 365 * DAY) }),
  };
  const event = (emailLogId: string, id: string, eventType: "DELIVERED" | "COMPLAINED") =>
    prisma.emailEvent.create({ data: { emailLogId, eventId: id, eventType, occurredAt: pastYear, payload: { to: "x@y.z" } } });
  await event(logs.oldDelivered.id, "ev-1", "DELIVERED");
  await event(logs.oldDelivered.id, "ev-2", "DELIVERED");
  await event(logs.oldComplaint.id, "ev-3", "COMPLAINED");
  await event(logs.insideYear.id, "ev-4", "DELIVERED");
  await event(logs.securityOld.id, "ev-5", "DELIVERED");
  await event(logs.commercialThreeYears.id, "ev-6", "DELIVERED");

  // Row 4: audit records.
  const auditRow = (createdAt: Date, withNetwork = true) =>
    prisma.auditLog.create({
      data: {
        action: "auth.login",
        actorType: "company",
        actorId: buyer.user.id,
        actorEmail: buyer.user.email,
        tenantId: buyer.company.id,
        createdAt,
        ...(withNetwork ? { ip: "203.0.113.7", userAgent: "Mozilla/5.0" } : {}),
      },
    });
  const audits = {
    pastTenYears: await auditRow(new Date(cut.auditRecords.getTime() - MIN)),
    twoYears: await auditRow(yearsBefore(now, 2)),
    insideCeilingMargin: await auditRow(new Date(cut.auditNetworkData.getTime() - MIN)),
    recentNetwork: await auditRow(new Date(cut.auditNetworkData.getTime() + MIN)),
  };

  // Row 6: AI usage.
  const usage = (createdAt: Date) =>
    prisma.aiUsage.create({
      data: {
        companyId: buyer.company.id,
        userId: buyer.user.id,
        userEmail: buyer.user.email,
        feature: "test",
        model: "m",
        status: "SETTLED",
        costUsd: 0.01,
        createdAt,
      },
    });
  const usages = {
    pastPeriod: await usage(new Date(calendarYearsCutoff(now, 5).getTime() - MIN)),
    pastEmail: await usage(new Date(cut.aiUsageEmails.getTime() - MIN)),
    recentEmail: await usage(ago(364 * DAY)),
  };

  return {
    buyer,
    second,
    listing,
    closed,
    recentlyClosed,
    links,
    codes,
    inquiries,
    invites,
    referrals,
    candidates,
    teamInvitations,
    run,
    notifications,
    digests,
    misses,
    logs,
    audits,
    usages,
  };
}

describe("DataRetentionService.run", () => {
  it("processes exactly the rows past their period, keeps the rest and other tables, writes ONE imha record", async () => {
    const now = new Date();
    const w = await seedWorld(now);
    const before = await untouchedTables();
    const { service } = makeStack();

    const report = await service.run(now);

    expect(report.failed).toEqual([]);
    expect(report.capped).toEqual([]);
    expect(report.counts).toEqual({
      passwordResetLinks: 2,
      emailVerificationCodes: 1,
      unverifiedInquiries: 1,
      externalInvites: 1,
      referralInvites: 2,
      discoveryCandidates: 2,
      teamInvitations: 2,
      notifications: 2,
      digestItems: 2,
      searchMisses: 1,
      // delivered + hard bounce (10 years), security, invitation, discovery, welcome series
      emailLogs: 6,
      // two of the delivered log, one of the security log, one of the reduced complaint
      emailEvents: 4,
      auditRecords: 1,
      aiUsageRecords: 1,
      // the two old complaints, the complaint the webhook overwrote, the cold-invite complaint
      emailLogsReduced: 4,
      inquiryIps: 1,
      auditNetworkData: 2,
      aiUsageEmails: 1,
    });

    // Row 11.
    expect((await prisma.passwordResetToken.findMany({ select: { id: true } })).map((r) => r.id).sort()).toEqual(
      [w.links.recentExpiredUnused.id, w.links.usedStillValid.id, w.links.live.id].sort(),
    );
    expect((await prisma.emailVerificationCode.findMany({ select: { id: true } })).map((r) => r.id).sort()).toEqual(
      [w.codes.recent.id, w.codes.closedRecent.id].sort(),
    );
    // Row 12: verified / claimed requests are commercial correspondence; a reply blocks the delete.
    const inquiries = await prisma.publicInquiry.findMany({ select: { id: true, createdIp: true } });
    expect(inquiries.map((r) => r.id).sort()).toEqual(
      [
        w.inquiries.unverifiedRecent.id,
        w.inquiries.verifiedOld.id,
        w.inquiries.verifiedRecent.id,
        w.inquiries.claimedOld.id,
        w.inquiries.unverifiedOldWithReply.id,
      ].sort(),
    );
    // Row 12: the sender IP goes after 30 days, verified or not.
    const ipOf = new Map(inquiries.map((r) => [r.id, r.createdIp]));
    expect(ipOf.get(w.inquiries.verifiedOld.id)).toBeNull();
    expect(ipOf.get(w.inquiries.verifiedRecent.id)).toBe("198.51.100.23");
    expect(ipOf.get(w.inquiries.unverifiedRecent.id)).toBe("198.51.100.21");
    // Row 13: exactly one year is not past; a request that still collects
    // quotes or settled less than a year ago keeps its invitations; the
    // opt-outs of the deleted address stay (row 14).
    expect((await prisma.externalListingInvite.findMany({ select: { id: true } })).map((r) => r.id).sort()).toEqual(
      [w.invites.old.id, w.invites.recent.id, w.invites.onOpenRequest.id, w.invites.onRecentlyClosed.id].sort(),
    );
    expect(await prisma.referralOptOut.findUnique({ where: { email: "en-eski@disfirma.com" } })).not.toBeNull();
    expect(await prisma.emailOptOut.count({ where: { email: "en-eski@disfirma.com" } })).toBe(1);
    // Row 13, link records: the stale ones go (accepted too); a click inside the
    // year, a request invitation still pointing at it, or a send today keep it.
    const referralIds = (await prisma.companyReferralInvite.findMany({ select: { id: true } })).map((r) => r.id);
    expect(referralIds).not.toContain(w.referrals.stale.id);
    expect(referralIds).not.toContain(w.referrals.staleAccepted.id);
    for (const kept of [w.referrals.clickedRecently, w.referrals.withOpenRequest, w.referrals.freedToday]) {
      expect(referralIds).toContain(kept.id);
    }
    expect((await prisma.supplierDiscoveryCandidate.findMany({ select: { id: true } })).map((r) => r.id).sort()).toEqual(
      [w.candidates.recent.id, w.candidates.onOpenRequest.id].sort(),
    );
    // Row 22: never-accepted team invitations after a year; the accepted one is account data.
    expect((await prisma.companyUserInvitation.findMany({ select: { id: true } })).map((r) => r.id).sort()).toEqual(
      [w.teamInvitations.acceptedOld.id, w.teamInvitations.cancelledRecent.id].sort(),
    );
    // Row 15.
    expect((await prisma.notification.findMany({ select: { id: true } })).map((r) => r.id)).toEqual([
      w.notifications.recentA.id,
    ]);
    // Row 16: an unsent item waits for its digest whatever its age; a request
    // that is open (or settled less than 90 days ago) keeps its items.
    expect((await prisma.emailDigestItem.findMany({ select: { id: true } })).map((r) => r.id).sort()).toEqual(
      [w.digests.sentRecent.id, w.digests.unsentOld.id, w.digests.sentOldOpenRequest.id, w.digests.sentOldRecentlyClosed.id].sort(),
    );
    // Row 17: judged by the last search, not the first.
    expect((await prisma.categorySearchMiss.findMany({ select: { id: true } })).map((r) => r.id)).toEqual([
      w.misses.stillSearched.id,
    ]);

    // Row 3: the delivered log and the hard bounce go with their events; the
    // complaints stay as refusal records; the marker stays as it was; logs of
    // the youngest year still inside the period stay.
    const logs = await prisma.emailLog.findMany({ orderBy: { queuedAt: "asc" } });
    expect(logs.map((l) => l.id).sort()).toEqual(
      [
        w.logs.oldComplaint.id,
        w.logs.clearedComplaint.id,
        w.logs.oldMarker.id,
        w.logs.insideYear.id,
        w.logs.recent.id,
        w.logs.complaintThenBounce.id,
        w.logs.securityRecent.id,
        w.logs.inviteComplaintOld.id,
        w.logs.lifecycleInside.id,
        w.logs.commercialThreeYears.id,
      ].sort(),
    );
    for (const id of [w.logs.complaintThenBounce.id, w.logs.inviteComplaintOld.id]) {
      expect(logs.find((l) => l.id === id)).toMatchObject({ subject: REDUCED_EMAIL_LOG_SUBJECT, contextType: null });
    }
    const complaint = logs.find((l) => l.id === w.logs.oldComplaint.id)!;
    expect(complaint).toMatchObject({
      toEmail: "sikayet@eski.com",
      status: "COMPLAINED",
      subject: REDUCED_EMAIL_LOG_SUBJECT,
      toName: null,
      payload: null,
      providerMessageId: null,
      contextType: null,
      contextId: null,
      template: "listing_invitation",
    });
    expect(complaint.complainedAt).toEqual(w.logs.oldComplaint.complainedAt);
    expect(logs.find((l) => l.id === w.logs.oldMarker.id)).toEqual(w.logs.oldMarker);
    expect(logs.find((l) => l.id === w.logs.insideYear.id)).toEqual(w.logs.insideYear);
    expect((await prisma.emailEvent.findMany({ select: { eventId: true } })).map((e) => e.eventId).sort()).toEqual(["ev-4", "ev-6"]);

    // The sending gate reads the same logs: the complaint still blocks, the
    // cleared address stays cleared, the ten-year-old hard bounce no longer blocks.
    const suppression = await new EmailSuppressionService(prisma as never).getSuppressionStatus([
      "sikayet@eski.com",
      "aklanan@eski.com",
      "olu@eski.com",
      "sikayet-sonra-donus@eski.com",
      "davet-sikayet@disfirma.com",
    ]);
    expect([...suppression.keys()].sort()).toEqual(
      ["davet-sikayet@disfirma.com", "sikayet-sonra-donus@eski.com", "sikayet@eski.com"].sort(),
    );

    // Row 4: ten-year-old record gone; network data stripped near the ceiling, kept before it.
    const audits = await prisma.auditLog.findMany({ where: { action: "auth.login" } });
    expect(audits.map((a) => a.id).sort()).toEqual(
      [w.audits.twoYears.id, w.audits.insideCeilingMargin.id, w.audits.recentNetwork.id].sort(),
    );
    for (const id of [w.audits.twoYears.id, w.audits.insideCeilingMargin.id]) {
      expect(audits.find((a) => a.id === id)).toMatchObject({ ip: null, userAgent: null, actorEmail: w.buyer.user.email, action: "auth.login" });
    }
    expect(audits.find((a) => a.id === w.audits.recentNetwork.id)).toMatchObject({ ip: "203.0.113.7", userAgent: "Mozilla/5.0" });

    // Row 6.
    const usages = await prisma.aiUsage.findMany();
    expect(usages.map((u) => u.id).sort()).toEqual([w.usages.pastEmail.id, w.usages.recentEmail.id].sort());
    expect(usages.find((u) => u.id === w.usages.pastEmail.id)).toMatchObject({ userEmail: null, userId: w.buyer.user.id });
    expect(usages.find((u) => u.id === w.usages.recentEmail.id)?.userEmail).toBe(w.buyer.user.email);

    // Nothing else moved.
    expect(await untouchedTables()).toEqual(before);

    // ONE imha record: system actor, no tenant, no personal data, counts per category.
    const records = await imhaRecords();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ actorType: "system", actorId: null, actorEmail: null, tenantId: null, ip: null, userAgent: null });
    const meta = records[0]!.metadata as Record<string, unknown>;
    expect(meta).toMatchObject({ job: DATA_RETENTION_JOB, ...report.counts });
    for (const c of RETENTION_CATEGORIES) expect(typeof meta[c]).toBe("number");
    expect(meta.through).toEqual(report.through);
    expect(Object.keys(report.through).sort()).toEqual(["aiUsageEmails", "auditNetworkData", "inquiryIps"]);
    expect(JSON.stringify(meta)).not.toMatch(/@|203\.0\.113|198\.51\.100|Mozilla/);
    expect(report.recorded).toBe(true);
  });

  it("a second run the same day finds nothing and writes no second record (idempotent)", async () => {
    const now = new Date();
    await seedWorld(now);
    const { service } = makeStack();
    await service.run(now);
    // Same clock reading: a later one would legitimately catch the rows seeded
    // exactly on a cut-off (they turn "strictly older" a moment later).
    const second = await service.run(now);
    expect(Object.values(second.counts).every((v) => v === 0)).toBe(true);
    expect(second.recorded).toBe(false);
    expect(await imhaRecords()).toHaveLength(1);
  });

  it("an empty database still gets the daily proof that the job ran (once)", async () => {
    const { service } = makeStack();
    const first = await service.run();
    expect(first.recorded).toBe(true);
    expect((await service.run()).recorded).toBe(false);
    const records = await imhaRecords();
    expect(records).toHaveLength(1);
    expect(records[0]!.metadata).toMatchObject({ job: DATA_RETENTION_JOB, notifications: 0, emailLogs: 0 });
  });

  it.each([
    ["not set outside production (local stack, UI-test stack, tests)", { NODE_ENV: "development" }],
    ["explicit false in a production-mode process", { NODE_ENV: "production", DATA_RETENTION_PURGE_ENABLED: "false" }],
    ["a value that is neither true nor false", { NODE_ENV: "production", DATA_RETENTION_PURGE_ENABLED: "yes" }],
  ])("switched off (%s): nothing is read, changed or recorded", async (_name, env) => {
    const now = new Date();
    await seedWorld(now);
    const snapshot = async () => ({
      links: await prisma.passwordResetToken.count(),
      codes: await prisma.emailVerificationCode.count(),
      inquiries: await prisma.publicInquiry.count(),
      invites: await prisma.externalListingInvite.count(),
      referrals: await prisma.companyReferralInvite.count(),
      teamInvitations: await prisma.companyUserInvitation.count(),
      inquiryIps: await prisma.publicInquiry.count({ where: { createdIp: { not: null } } }),
      candidates: await prisma.supplierDiscoveryCandidate.count(),
      notifications: await prisma.notification.count(),
      digests: await prisma.emailDigestItem.count(),
      misses: await prisma.categorySearchMiss.count(),
      logs: await prisma.emailLog.findMany({ orderBy: { id: "asc" } }),
      events: await prisma.emailEvent.count(),
      audits: await prisma.auditLog.findMany({ orderBy: { id: "asc" } }),
      usages: await prisma.aiUsage.findMany({ orderBy: { id: "asc" } }),
    });
    const before = await snapshot();
    const { service } = makeStack(env);
    expect(service.enabled).toBe(false);
    const report = await service.run(now);
    expect(report.enabled).toBe(false);
    expect(report.recorded).toBe(false);
    expect(Object.values(report.counts).every((v) => v === 0)).toBe(true);
    expect(await snapshot()).toEqual(before);
    expect(await prisma.auditLog.count({ where: { action: DATA_RETENTION_ACTION } })).toBe(0);
  });

  it("batches are bounded per run; the rest follows on the next run and the record says so", async () => {
    const now = new Date();
    const a = await makeCompanyWithUser(prisma);
    const b = await makeUser(prisma, a.company.id);
    const old = new Date(retentionCutoffs(now).notifications.getTime() - DAY);
    // Five old notifications of one account; the other account (one page each)
    // has only a recent one.
    for (const userId of [a.user.id, a.user.id, a.user.id, a.user.id, a.user.id]) {
      await prisma.notification.create({
        data: { companyUserId: userId, companyId: a.company.id, type: "t", title: "t", body: "b", createdAt: old },
      });
    }
    const keep = await prisma.notification.create({
      data: { companyUserId: b.id, companyId: a.company.id, type: "t", title: "t", body: "b" },
    });
    const limits: RetentionLimits = { batchSize: 2, maxBatches: 2, userPageSize: 1 };
    const { service } = makeStack();

    const first = await service.run(now, limits);
    expect(first.counts.notifications).toBe(4);
    expect(first.capped).toEqual(["notifications"]);
    expect(await prisma.notification.count()).toBe(2);

    const second = await service.run(now, limits);
    expect(second.counts.notifications).toBe(1);
    expect(second.capped).toEqual([]);
    expect((await prisma.notification.findMany({ select: { id: true } })).map((r) => r.id)).toEqual([keep.id]);

    const records = await imhaRecords();
    expect(records).toHaveLength(2);
    expect(records[0]!.metadata).toMatchObject({ notifications: 4, capped: ["notifications"] });
    expect(records[1]!.metadata).toMatchObject({ notifications: 1 });
    expect(records[1]!.metadata).not.toHaveProperty("capped");
  });

  it("in-place scans start at the previous complete run's cut-off (minus a day); a capped run sets no start", async () => {
    const now = notFullScanDay(new Date());
    const net = (createdAt: Date) =>
      prisma.auditLog.create({
        data: { action: "auth.login", actorType: "company", ip: "198.51.100.1", userAgent: "UA", createdAt },
      });
    const cut = retentionCutoffs(now).auditNetworkData;
    await net(new Date(cut.getTime() - 30 * DAY));
    await net(new Date(cut.getTime() - 31 * DAY));
    const { service } = makeStack();

    // Capped: no watermark is recorded for the category.
    const capped = await service.run(now, { batchSize: 1, maxBatches: 1, userPageSize: 500 });
    expect(capped.counts.auditNetworkData).toBe(1);
    expect(capped.capped).toContain("auditNetworkData");
    expect(capped.through.auditNetworkData).toBeUndefined();

    // Complete: the next scan sees the full range, finishes, records its cut-off.
    const complete = await service.run(now);
    expect(complete.counts.auditNetworkData).toBe(1);
    expect(complete.through.auditNetworkData).toBe(cut.toISOString());

    // A later run reads the watermark: rows created later than (cut-off - 1 day)
    // are scanned, rows below it are not looked at again.
    const later = notFullScanDay(new Date(now.getTime() + 2 * DAY));
    const laterCut = retentionCutoffs(later).auditNetworkData;
    const inWindow = await net(new Date(laterCut.getTime() - HOUR));
    const belowWatermark = await net(new Date(cut.getTime() - 2 * DAY));
    const third = await service.run(later);
    expect(third.counts.auditNetworkData).toBe(1);
    expect(await prisma.auditLog.findUniqueOrThrow({ where: { id: inWindow.id } })).toMatchObject({ ip: null, userAgent: null });
    expect(await prisma.auditLog.findUniqueOrThrow({ where: { id: belowWatermark.id } })).toMatchObject({ ip: "198.51.100.1" });

    // Self-repair: the weekly full scan (Sunday, Istanbul) ignores the watermark
    // and strips the row that slipped below it - the 5651 ceiling does not
    // depend on the watermark chain alone.
    let sunday = new Date(later.getTime() + DAY);
    while (!isFullScanDay(sunday)) sunday = new Date(sunday.getTime() + DAY);
    const full = await service.run(sunday);
    expect(full.counts.auditNetworkData).toBeGreaterThanOrEqual(1);
    expect(await prisma.auditLog.findUniqueOrThrow({ where: { id: belowWatermark.id } })).toMatchObject({ ip: null, userAgent: null });
  });

  it("a failing category does not stop the others; the record lists it and the run throws", async () => {
    const now = new Date();
    const a = await makeCompanyWithUser(prisma);
    await prisma.notification.create({
      data: {
        companyUserId: a.user.id,
        companyId: a.company.id,
        type: "t",
        title: "t",
        body: "b",
        createdAt: new Date(retentionCutoffs(now).notifications.getTime() - DAY),
      },
    });
    const records = new RetentionRecordService(prisma as never);
    // The category search table "fails" (a database error in that step only).
    const broken = new Proxy(prisma, {
      get(target, prop) {
        if (prop === "categorySearchMiss") {
          return {
            findMany: async () => {
              throw new Error("relation is locked");
            },
            deleteMany: async () => ({ count: 0 }),
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const service = new DataRetentionService(broken as never, records, envConfig({ NODE_ENV: "production" }));
    await expect(service.run(now)).rejects.toThrow("retention categories failed: searchMisses");
    expect(await prisma.notification.count()).toBe(0);
    const rows = await imhaRecords();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toMatchObject({ notifications: 1, failed: ["searchMisses"] });
  });
});

describe("DataRetentionService.run — failure half-way", () => {
  it("a category that fails after a committed batch counts what it destroyed", async () => {
    const now = new Date();
    const a = await makeCompanyWithUser(prisma);
    for (let i = 0; i < 3; i++) {
      await prisma.notification.create({
        data: {
          companyUserId: a.user.id,
          companyId: a.company.id,
          type: "t",
          title: "t",
          body: "b",
          createdAt: new Date(retentionCutoffs(now).notifications.getTime() - DAY),
        },
      });
    }
    let deletes = 0;
    const flaky = new Proxy(prisma, {
      get(target, prop) {
        if (prop === "notification") {
          return {
            findMany: (args: never) => target.notification.findMany(args),
            deleteMany: async (args: never) => {
              deletes += 1;
              if (deletes > 1) throw new Error("connection reset");
              return target.notification.deleteMany(args);
            },
          };
        }
        const value = Reflect.get(target, prop) as unknown;
        return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(target) : value;
      },
    });
    const records = new RetentionRecordService(prisma as never);
    const service = new DataRetentionService(flaky as never, records, envConfig({ NODE_ENV: "production" }));
    await expect(service.run(now, { batchSize: 1, maxBatches: 10, userPageSize: 500 })).rejects.toThrow(
      "retention categories failed: notifications",
    );
    expect(await prisma.notification.count()).toBe(2);
    const rows = await imhaRecords();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.metadata).toMatchObject({ notifications: 1, failed: ["notifications"] });
  });
});

describe("imha records of the older purge jobs", () => {
  it("views.purge and sessions.purgeRevoked record their counts (and once a day when idle)", async () => {
    const records = new RetentionRecordService(prisma as never);
    const registry = new CronRegistryService();

    const views = new CompanyViewsScheduler({ purgeExpired: async () => 3 } as never, registry, records);
    await views.purge();
    await views.purge(); // a second busy run: recorded again
    const sessions = new SessionRevocationScheduler({ purgeExpired: async () => 0 } as never, registry, records);
    await sessions.purge();
    await sessions.purge(); // idle twice: one record

    const viewRows = await imhaRecords("views.purge");
    expect(viewRows.map((r) => r.metadata)).toEqual([
      { job: "views.purge", viewRecords: 3 },
      { job: "views.purge", viewRecords: 3 },
    ]);
    const sessionRows = await imhaRecords("sessions.purgeRevoked");
    expect(sessionRows.map((r) => r.metadata)).toEqual([{ job: "sessions.purgeRevoked", revokedSessions: 0 }]);
    // Each job keeps its own daily proof: the idle check is per job.
    expect(await imhaRecords(DATA_RETENTION_JOB)).toHaveLength(0);
  });
});
