/**
 * KİŞİSEL VERİ SAKLAMA VE İMHA POLİTİKASI — the machine-readable half
 * (`retention-policy.ts`) and the nightly job's switch, scheduler and imha
 * records, without a database. The database behaviour (old rows processed,
 * recent rows and other tables untouched, the record written) is
 * `test/integration/data-retention.spec.ts`.
 *
 * The numbers below are the rows of the policy table (web
 * `sozlesmeler/saklama-imha`, section 8). A failing pin means a period moved
 * in code: change the policy table (and the texts that summarise it) in the
 * same change, or move the number back.
 */
import type { ConfigService } from "@nestjs/config";
import { CronRegistryService } from "../../src/common/cron/cron-registry.service";
import { CLOSED_COMPANY_ERASURE_DEADLINE_DAYS } from "../../src/modules/company-auth/account-closure";
import {
  SignupPurgeFailedError,
  UNVERIFIED_SIGNUP_TTL_DAYS,
} from "../../src/modules/company-auth/services/unverified-signup-cleanup.service";
import { UnverifiedSignupScheduler } from "../../src/modules/company-auth/schedulers/unverified-signup.scheduler";
import { VIEW_RETENTION_DAYS } from "../../src/modules/company-views/company-views.service";
import { DataRetentionScheduler } from "../../src/modules/data-retention/data-retention.scheduler";
import {
  DATA_RETENTION_JOB,
  DATA_RETENTION_PURGE_ENV,
  DataRetentionService,
  RETENTION_CATEGORIES,
} from "../../src/modules/data-retention/data-retention.service";
import {
  AI_CHAT_RETENTION_DAYS,
  AI_TEMP_UPLOAD_RETENTION_HOURS,
  AI_USAGE_EMAIL_RETENTION_YEARS,
  AI_USAGE_RETENTION_YEARS,
  ALL_AI_USAGE_STATUSES,
  AUDIT_NETWORK_DATA_RETENTION_YEARS,
  AUDIT_RECORD_RETENTION_YEARS,
  DISCOVERY_EMAIL_CONTEXTS,
  DISCOVERY_EMAIL_LOG_RETENTION_YEARS,
  EMAIL_LOG_RETENTION_YEARS,
  INQUIRY_IP_RETENTION_DAYS,
  INVITE_EMAIL_CONTEXTS,
  INVITE_EMAIL_LOG_RETENTION_YEARS,
  LEGAL_MAXIMUM_MARGIN_DAYS,
  NOTIFICATION_RETENTION_YEARS,
  REDUCED_EMAIL_LOG_DATA,
  REDUCED_EMAIL_LOG_SUBJECT,
  SEARCH_MISS_RETENTION_YEARS,
  SECURITY_EMAIL_CONTEXTS,
  SECURITY_EMAIL_LOG_RETENTION_YEARS,
  SENT_DIGEST_ITEM_RETENTION_DAYS,
  TEAM_INVITATION_RETENTION_YEARS,
  THIRD_PARTY_CONTACT_RETENTION_YEARS,
  UNUSED_LINK_RETENTION_DAYS,
  UNVERIFIED_INQUIRY_RETENTION_DAYS,
  aiUsageEmailWhere,
  auditNetworkDataWhere,
  calendarYearsCutoff,
  complaintLogToReduceWhere,
  discoveryCandidateWhere,
  expiredAiUsageWhere,
  expiredAuditRecordWhere,
  expiredEmailLogWhere,
  externalInviteWhere,
  inquiryIpWhere,
  isFullScanDay,
  isReducedEmailLog,
  notificationWhere,
  passwordResetLinkWhere,
  retentionCutoffs,
  searchMissWhere,
  sentDigestItemSql,
  staleReferralInviteWhere,
  staleTeamInvitationWhere,
  unverifiedInquiryWhere,
  verificationCodeWhere,
  yearsBefore,
} from "../../src/modules/data-retention/retention-policy";
import {
  DATA_RETENTION_ACTION,
  RetentionRecordService,
  watermarksFrom,
} from "../../src/modules/data-retention/retention-record.service";
import { INVITE_CONTEXT_TYPES, streamForContext } from "../../src/modules/email/email-streams";
import { SUPPRESSION_CLEAR_MARKER_WHERE } from "../../src/modules/email/suppression-marker";

const DAY = 86_400_000;
/** 16 October 2026, 12:00 UTC (15:00 Istanbul). */
const NOW = new Date("2026-10-16T12:00:00.000Z");

describe("the policy table, pinned", () => {
  it("periods applied by retention.purge", () => {
    expect(UNUSED_LINK_RETENTION_DAYS).toBe(30); // row 11
    expect(UNVERIFIED_INQUIRY_RETENTION_DAYS).toBe(30); // row 12
    expect(INQUIRY_IP_RETENTION_DAYS).toBe(30); // row 12, the sender IP
    expect(THIRD_PARTY_CONTACT_RETENTION_YEARS).toBe(1); // row 13
    expect(NOTIFICATION_RETENTION_YEARS).toBe(1); // row 15
    expect(SENT_DIGEST_ITEM_RETENTION_DAYS).toBe(90); // row 16
    expect(SEARCH_MISS_RETENTION_YEARS).toBe(1); // row 17
    expect(EMAIL_LOG_RETENTION_YEARS).toBe(10); // row 3
    expect(SECURITY_EMAIL_LOG_RETENTION_YEARS).toBe(1); // row 21 (a)
    expect(INVITE_EMAIL_LOG_RETENTION_YEARS).toBe(1); // row 21 (b)
    expect(DISCOVERY_EMAIL_LOG_RETENTION_YEARS).toBe(2); // row 21 (c)
    expect(TEAM_INVITATION_RETENTION_YEARS).toBe(1); // row 22
    expect(AUDIT_RECORD_RETENTION_YEARS).toBe(10); // rows 4, 19
    expect(AUDIT_NETWORK_DATA_RETENTION_YEARS).toBe(2); // row 4 (5651 m.5/3 ceiling)
    expect(AI_USAGE_RETENTION_YEARS).toBe(5); // row 6
    expect(AI_USAGE_EMAIL_RETENTION_YEARS).toBe(1); // row 6
  });

  it("periods applied by the older jobs", () => {
    expect(AI_CHAT_RETENTION_DAYS).toBe(90); // row 7, ai.cleanupChatSessions
    expect(VIEW_RETENTION_DAYS).toBe(180); // row 8, views.purge
    expect(UNVERIFIED_SIGNUP_TTL_DAYS).toBe(7); // row 10, signup.purgeUnverified
    expect(CLOSED_COMPANY_ERASURE_DEADLINE_DAYS).toBe(30); // row 2, admin erasure + reminder
    expect(AI_TEMP_UPLOAD_RETENTION_HOURS).toBe(24); // row 20, ai.cleanupExtractFiles
  });

  it("the margin before the legal ceiling is small and keeps the 5651 minimum of one year", () => {
    expect(LEGAL_MAXIMUM_MARGIN_DAYS).toBeGreaterThan(0);
    expect(LEGAL_MAXIMUM_MARGIN_DAYS).toBeLessThanOrEqual(7);
    const cut = retentionCutoffs(NOW).auditNetworkData;
    // Stripped BEFORE two years ...
    expect(cut.getTime()).toBeGreaterThan(yearsBefore(NOW, 2).getTime());
    expect(cut.getTime()).toBe(yearsBefore(NOW, 2).getTime() + LEGAL_MAXIMUM_MARGIN_DAYS * DAY);
    // ... and never before one year.
    expect(cut.getTime()).toBeLessThan(yearsBefore(NOW, 1).getTime());
  });
});

describe("cut-offs", () => {
  it("day and year periods count back from the same clock reading", () => {
    const c = retentionCutoffs(NOW);
    expect(c.unusedLinks).toEqual(new Date(NOW.getTime() - 30 * DAY));
    expect(c.unverifiedInquiries).toEqual(new Date(NOW.getTime() - 30 * DAY));
    expect(c.inquiryIps).toEqual(new Date(NOW.getTime() - 30 * DAY));
    expect(c.sentDigestItems).toEqual(new Date(NOW.getTime() - 90 * DAY));
    expect(c.thirdPartyContacts).toEqual(new Date("2025-10-16T12:00:00.000Z"));
    expect(c.teamInvitations).toEqual(new Date("2025-10-16T12:00:00.000Z"));
    expect(c.notifications).toEqual(new Date("2025-10-16T12:00:00.000Z"));
    expect(c.searchMisses).toEqual(new Date("2025-10-16T12:00:00.000Z"));
    expect(c.aiUsageEmails).toEqual(new Date("2025-10-16T12:00:00.000Z"));
    expect(c.securityEmailLogs).toEqual(new Date("2025-10-16T12:00:00.000Z"));
    expect(c.inviteEmailLogs).toEqual(new Date("2025-10-16T12:00:00.000Z"));
    expect(c.discoveryEmailLogs).toEqual(new Date("2024-10-16T12:00:00.000Z"));
    expect(c.auditRecords).toEqual(new Date("2016-10-16T12:00:00.000Z"));
  });

  it("the in-place scans ignore their watermark once a week (Sunday, Istanbul)", () => {
    expect(isFullScanDay(NOW)).toBe(false); // Friday
    expect(isFullScanDay(new Date("2026-10-18T02:30:00.000Z"))).toBe(true); // Sunday 05:30 Istanbul
    // Saturday 23:30 UTC is already Sunday 02:30 in Istanbul.
    expect(isFullScanDay(new Date("2026-10-17T23:30:00.000Z"))).toBe(true);
    expect(isFullScanDay(new Date("2026-10-18T21:30:00.000Z"))).toBe(false); // Monday 00:30 Istanbul
  });

  it("a calendar year back from 29 February lands on 1 March (never later than a year)", () => {
    expect(yearsBefore(new Date("2028-02-29T10:00:00.000Z"), 1)).toEqual(new Date("2027-03-01T10:00:00.000Z"));
  });

  it("e-mail logs: 10 years from the END of the Istanbul calendar year of creation", () => {
    // Today (2026): logs of 2015 and earlier are past (2015 + 10 = end of 2025).
    expect(retentionCutoffs(NOW).emailLogs).toEqual(new Date("2015-12-31T22:00:00.000Z")); // 1 Jan 2016 00:00 Istanbul (UTC+2 then)
    // 31 December 2036, 23:59 Istanbul: a log of 2026 is still inside its period.
    expect(calendarYearsCutoff(new Date("2036-12-31T20:59:00.000Z"), 10)).toEqual(new Date("2025-12-31T21:00:00.000Z"));
    // One minute later it is 1 January 2037 in Istanbul (still 31 December in UTC): 2026 is past.
    expect(calendarYearsCutoff(new Date("2036-12-31T21:00:00.000Z"), 10)).toEqual(new Date("2026-12-31T21:00:00.000Z"));
  });

  it("AI usage records: 5 years from the end of the calendar year (VUK m.253)", () => {
    expect(retentionCutoffs(NOW).aiUsageRecords).toEqual(new Date("2020-12-31T21:00:00.000Z")); // 1 Jan 2021 Istanbul
    // A record of 1 January 2026 stays through 31 December 2031.
    const created = new Date("2025-12-31T21:30:00.000Z"); // 1 Jan 2026 00:30 Istanbul
    expect(created < calendarYearsCutoff(new Date("2031-12-31T20:00:00.000Z"), 5)).toBe(false);
    expect(created < calendarYearsCutoff(new Date("2031-12-31T21:00:00.000Z"), 5)).toBe(true);
  });
});

describe("WHERE clauses: the whole rule, strictly older than the cut-off", () => {
  const c = retentionCutoffs(NOW);

  it("row 11: unused links after 30 days, used links once expired; codes after 30 days", () => {
    expect(passwordResetLinkWhere(NOW)).toEqual({
      OR: [{ createdAt: { lt: c.unusedLinks } }, { usedAt: { not: null }, expiresAt: { lt: NOW } }],
    });
    expect(verificationCodeWhere(NOW)).toEqual({ createdAt: { lt: c.unusedLinks } });
  });

  it("row 12: only never-verified, never-claimed requests without replies; the sender IP of every request after 30 days", () => {
    expect(unverifiedInquiryWhere(NOW)).toEqual({
      verifiedAt: null,
      claimedCompanyId: null,
      createdAt: { lt: c.unverifiedInquiries },
      replies: { none: {} },
    });
    expect(inquiryIpWhere(NOW)).toEqual({ createdIp: { not: null }, createdAt: { lt: c.inquiryIps } });
    const from = new Date("2026-09-01T00:00:00.000Z");
    expect(inquiryIpWhere(NOW, from)).toEqual({ createdIp: { not: null }, createdAt: { lt: c.inquiryIps, gte: from } });
  });

  it("row 13: a year after the invitation AND a year after the request stopped collecting quotes", () => {
    const settled = { status: { not: "OPEN" }, updatedAt: { lt: c.thirdPartyContacts } };
    expect(externalInviteWhere(NOW)).toEqual({ createdAt: { lt: c.thirdPartyContacts }, listing: settled });
    // A search before the request existed has no request: the year alone.
    expect(discoveryCandidateWhere(NOW)).toEqual({
      createdAt: { lt: c.thirdPartyContacts },
      run: { OR: [{ listingId: null }, { listing: { is: settled } }] },
    });
    // The link record: no request invitation left (no cascade), no send and no click for a year.
    expect(staleReferralInviteWhere(NOW)).toEqual({
      updatedAt: { lt: c.thirdPartyContacts },
      OR: [{ lastClickedAt: null }, { lastClickedAt: { lt: c.thirdPartyContacts } }],
      listingInvites: { none: {} },
    });
  });

  it("row 22: team invitations never accepted, a year after their last change and expiry", () => {
    expect(staleTeamInvitationWhere(NOW)).toEqual({
      status: { not: "ACCEPTED" },
      updatedAt: { lt: c.teamInvitations },
      expiresAt: { lt: c.teamInvitations },
    });
  });

  it("rows 15, 16, 17", () => {
    expect(notificationWhere(NOW)).toEqual({ createdAt: { lt: c.notifications } });
    // Sent items only (`<` is never true for NULL: unsent items wait for their
    // digest), and only once the request settled for as long (no foreign key: SQL).
    const digest = sentDigestItemSql(NOW);
    expect(digest.sql.replace(/\s+/g, " ")).toBe(
      'd."sentAt" < ? AND NOT EXISTS ( SELECT 1 FROM listings l WHERE l.id = d."listingId" AND (l.status = \'OPEN\' OR l."updatedAt" >= ?) )',
    );
    expect(digest.values).toEqual([c.sentDigestItems, c.sentDigestItems]);
    expect(searchMissWhere(NOW)).toEqual({ lastSeenAt: { lt: c.searchMisses } });
  });

  it("rows 3 and 21: the period depends on the kind of mail; complaints and suppression-clear markers are never deleted", () => {
    const pastPeriod = {
      OR: [
        { contextType: { in: [...SECURITY_EMAIL_CONTEXTS] }, queuedAt: { lt: c.securityEmailLogs } },
        { contextType: { in: [...INVITE_EMAIL_CONTEXTS] }, queuedAt: { lt: c.inviteEmailLogs } },
        { contextType: { in: [...DISCOVERY_EMAIL_CONTEXTS] }, queuedAt: { lt: c.discoveryEmailLogs } },
        { contextType: { startsWith: "lifecycle_" }, queuedAt: { lt: c.discoveryEmailLogs } },
        { queuedAt: { lt: c.emailLogs } },
      ],
    };
    // A complaint is the status OR the complaint time (a hard bounce after a
    // complaint sets BOUNCED over COMPLAINED).
    const complaint = { OR: [{ status: "COMPLAINED" }, { complainedAt: { not: null } }] };
    expect(expiredEmailLogWhere(NOW)).toEqual({
      AND: [pastPeriod],
      NOT: [complaint, SUPPRESSION_CLEAR_MARKER_WHERE],
    });
    expect(complaintLogToReduceWhere(NOW)).toEqual({
      AND: [pastPeriod, complaint],
      subject: { not: REDUCED_EMAIL_LOG_SUBJECT },
    });
    // The marker is a code, ASCII (system-written database text), and recognised as such.
    expect(REDUCED_EMAIL_LOG_SUBJECT).toMatch(/^[\x20-\x7e]+$/);
    expect(isReducedEmailLog({ subject: REDUCED_EMAIL_LOG_SUBJECT })).toBe(true);
    expect(isReducedEmailLog({ subject: "Talep daveti" })).toBe(false);
    // The reduction keeps address, status and dates; it removes content and links.
    expect(REDUCED_EMAIL_LOG_DATA).toMatchObject({
      subject: REDUCED_EMAIL_LOG_SUBJECT,
      toName: null,
      errorMessage: null,
      bounceReason: null,
      providerMessageId: null,
      contextType: null,
      contextId: null,
    });
    expect(Object.keys(REDUCED_EMAIL_LOG_DATA)).not.toEqual(expect.arrayContaining(["toEmail"]));
    expect(Object.keys(REDUCED_EMAIL_LOG_DATA)).not.toEqual(expect.arrayContaining(["status"]));
  });

  it("row 21 groups: security mails, cold invitations, discovery / welcome mails; everything else is row 3", () => {
    // Groups do not overlap.
    const all = [...SECURITY_EMAIL_CONTEXTS, ...INVITE_EMAIL_CONTEXTS, ...DISCOVERY_EMAIL_CONTEXTS];
    expect(new Set(all).size).toBe(all.length);
    // Cold invitations = the INVITE stream; discovery = the NOTIFICATION stream.
    expect([...INVITE_EMAIL_CONTEXTS].sort()).toEqual([...INVITE_CONTEXT_TYPES].sort());
    for (const t of DISCOVERY_EMAIL_CONTEXTS) expect([t, streamForContext(t)]).toEqual([t, "NOTIFICATION"]);
    for (const t of INVITE_EMAIL_CONTEXTS) expect([t, streamForContext(t)]).toEqual([t, "INVITE"]);
    expect(streamForContext("lifecycle_weekly")).toBe("LIFECYCLE");
    // Security / verification mails are transactional, and the access-critical ones are in.
    for (const t of SECURITY_EMAIL_CONTEXTS) expect([t, streamForContext(t)]).toEqual([t, "TRANSACTIONAL"]);
    expect(SECURITY_EMAIL_CONTEXTS).toEqual(expect.arrayContaining(["password_reset", "login_2fa", "email_verify"]));
    // Commercial-transaction mails stay under row 3.
    for (const t of ["listing_invitation", "bid_awarded", "order_status_changed", "message_received", "public_inquiry_received"]) {
      expect(all).not.toContain(t);
    }
  });

  it("row 4: records after 10 years; network data near the ceiling, from the watermark when there is one", () => {
    expect(expiredAuditRecordWhere(NOW)).toEqual({ createdAt: { lt: c.auditRecords } });
    const network = { OR: [{ ip: { not: null } }, { userAgent: { not: null } }] };
    expect(auditNetworkDataWhere(NOW)).toEqual({ createdAt: { lt: c.auditNetworkData }, ...network });
    const from = new Date("2024-10-01T00:00:00.000Z");
    expect(auditNetworkDataWhere(NOW, from)).toEqual({ createdAt: { lt: c.auditNetworkData, gte: from }, ...network });
  });

  it("row 6: every status is listed so the (status, createdAt) index serves the scan", () => {
    expect([...ALL_AI_USAGE_STATUSES].sort()).toEqual(["FAILED", "RESERVED", "SETTLED"]);
    expect(expiredAiUsageWhere(NOW)).toEqual({
      status: { in: ALL_AI_USAGE_STATUSES },
      createdAt: { lt: c.aiUsageRecords },
    });
    expect(aiUsageEmailWhere(NOW)).toEqual({
      status: { in: ALL_AI_USAGE_STATUSES },
      createdAt: { lt: c.aiUsageEmails },
      userEmail: { not: null },
    });
  });
});

describe("imha records", () => {
  it("watermarks: newest complete value per category, minus a day; skipped when missing or broken", () => {
    const metas = [
      { job: "retention.purge", capped: ["auditNetworkData"], through: { aiUsageEmails: "2025-10-15T12:00:00.000Z" } },
      { job: "retention.purge", through: { auditNetworkData: "garbage" } },
      null,
      { job: "retention.purge", through: { auditNetworkData: "2024-10-20T12:00:00.000Z", aiUsageEmails: "2025-10-01T00:00:00.000Z" } },
    ];
    expect(watermarksFrom(metas, ["auditNetworkData", "aiUsageEmails", "other"])).toEqual({
      aiUsageEmails: new Date("2025-10-14T12:00:00.000Z"),
      auditNetworkData: new Date("2024-10-19T12:00:00.000Z"),
    });
    expect(watermarksFrom([], ["auditNetworkData"])).toEqual({});
  });

  function recorder(existingToday: boolean, createFails = false) {
    const prisma = {
      auditLog: {
        findFirst: jest.fn(async () => (existingToday ? { id: "a1" } : null)),
        findMany: jest.fn(async () => []),
        create: jest.fn(async () => {
          if (createFails) throw new Error("connection reset");
          return { id: "new" };
        }),
      },
    };
    // `audit` = what was written (same shape the checks below read).
    return { audit: { log: prisma.auditLog.create }, prisma, service: new RetentionRecordService(prisma as never) };
  }

  it("a run that processed something always writes one entry: system actor, counts only", async () => {
    const { audit, prisma, service } = recorder(true);
    await expect(
      service.record("retention.purge", { notifications: 4, emailLogs: 0 }, { capped: ["notifications"], through: { aiUsageEmails: "x" } }),
    ).resolves.toBe(true);
    expect(prisma.auditLog.findFirst).not.toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith({
      data: {
        action: DATA_RETENTION_ACTION,
        actorType: "system",
        metadata: {
          job: "retention.purge",
          notifications: 4,
          emailLogs: 0,
          capped: ["notifications"],
          through: { aiUsageEmails: "x" },
        },
      },
    });
  });

  it("a record that cannot be written fails the run (unlike AuditService.log, which swallows the error)", async () => {
    const { service } = recorder(false, true);
    await expect(service.record("retention.purge", { notifications: 1 })).rejects.toThrow("connection reset");
  });

  it("a run with nothing to do writes once per Istanbul day", async () => {
    const first = recorder(false);
    await expect(first.service.record("views.purge", { viewRecords: 0 }, {}, NOW)).resolves.toBe(true);
    expect(first.audit.log).toHaveBeenCalledTimes(1);
    const where = (first.prisma.auditLog.findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }])[0]
      .where;
    expect(where).toEqual({
      action: DATA_RETENTION_ACTION,
      createdAt: { gte: new Date("2026-10-15T21:00:00.000Z") }, // 16 Oct 00:00 Istanbul
      metadata: { path: ["job"], equals: "views.purge" },
    });

    const again = recorder(true);
    await expect(again.service.record("views.purge", { viewRecords: 0 }, {}, NOW)).resolves.toBe(false);
    expect(again.audit.log).not.toHaveBeenCalled();
  });

  it("a failure is always recorded, even with nothing processed", async () => {
    const { audit, service } = recorder(true);
    await expect(service.record("retention.purge", { emailLogs: 0 }, { failed: ["emailLogs"] })).resolves.toBe(true);
    expect(audit.log).toHaveBeenCalledWith({
      data: expect.objectContaining({ metadata: { job: "retention.purge", emailLogs: 0, failed: ["emailLogs"] } }),
    });
  });
});

describe("the switch (DATA_RETENTION_PURGE_ENABLED)", () => {
  const make = (env: Record<string, string | undefined>) =>
    new DataRetentionService(
      {} as never,
      {} as never,
      { get: (key: string) => env[key] } as unknown as ConfigService,
    );

  it("same rule as the sign-up purge: production default on, explicit wins, anything else off", () => {
    expect(DATA_RETENTION_PURGE_ENV).toBe("DATA_RETENTION_PURGE_ENABLED");
    expect(make({ NODE_ENV: "production" }).enabled).toBe(true);
    expect(make({ NODE_ENV: "production", DATA_RETENTION_PURGE_ENABLED: "" }).enabled).toBe(true);
    expect(make({ NODE_ENV: "production", DATA_RETENTION_PURGE_ENABLED: "false" }).enabled).toBe(false);
    expect(make({ NODE_ENV: "development" }).enabled).toBe(false); // local stack, UI-test stack
    expect(make({ NODE_ENV: "test" }).enabled).toBe(false);
    expect(make({}).enabled).toBe(false);
    expect(make({ NODE_ENV: "development", DATA_RETENTION_PURGE_ENABLED: "true" }).enabled).toBe(true);
    expect(make({ NODE_ENV: "production", DATA_RETENTION_PURGE_ENABLED: "1" }).enabled).toBe(false);
    expect(make({ NODE_ENV: "production", DATA_RETENTION_PURGE_ENABLED: "TRUE" }).enabled).toBe(false);
  });

  it("off: run() reads and writes nothing", async () => {
    const prisma = new Proxy({}, { get: () => { throw new Error("database touched"); } });
    const records = { watermarks: jest.fn(), record: jest.fn() };
    const service = new DataRetentionService(
      prisma as never,
      records as never,
      { get: (key: string) => ({ NODE_ENV: "production", DATA_RETENTION_PURGE_ENABLED: "false" })[key] } as unknown as ConfigService,
    );
    const report = await service.run();
    expect(report.enabled).toBe(false);
    expect(report.recorded).toBe(false);
    expect(Object.values(report.counts).every((n) => n === 0)).toBe(true);
    expect(records.watermarks).not.toHaveBeenCalled();
    expect(records.record).not.toHaveBeenCalled();
  });

  it("categories are unique and none ends in Id (admin hides such keys)", () => {
    expect(new Set(RETENTION_CATEGORIES).size).toBe(RETENTION_CATEGORIES.length);
    for (const c of RETENTION_CATEGORIES) expect(c).not.toMatch(/[a-z](Id|Ids)$/);
  });
});

describe("DataRetentionScheduler", () => {
  afterEach(() => jest.useRealTimers());

  const scheduler = (enabled: boolean, run: jest.Mock = jest.fn(async () => undefined)) => {
    const registry = new CronRegistryService();
    const s = new DataRetentionScheduler({ enabled, run } as never, registry);
    return { registry, run, s };
  };

  it("registers the job under its key, nightly 05:30 Istanbul", () => {
    const { registry, s } = scheduler(false);
    s.onModuleInit();
    expect(DATA_RETENTION_JOB).toBe("retention.purge");
    const rec = registry.snapshot().find((r) => r.key === DATA_RETENTION_JOB);
    expect(rec?.schedule).toContain("05:30");
    expect(rec?.runCount).toBe(0);
  });

  it("off: the tick does nothing and the registry shows no run; no boot catch-up is scheduled", async () => {
    jest.useFakeTimers();
    const { registry, run, s } = scheduler(false);
    s.onModuleInit();
    await s.purge();
    jest.advanceTimersByTime(10 * 60_000);
    expect(run).not.toHaveBeenCalled();
    expect(registry.snapshot().find((r) => r.key === DATA_RETENTION_JOB)?.lastRunAt).toBeNull();
  });

  it("on: the tick runs through the wrapper; a failed run is recorded and rethrown", async () => {
    const ok = scheduler(true);
    await ok.s.purge();
    expect(ok.run).toHaveBeenCalledTimes(1);

    const failing = scheduler(true, jest.fn(async () => {
      throw new Error("[IMHA-HATA] retention categories failed: emailLogs");
    }));
    failing.s.onModuleInit();
    failing.s.onModuleDestroy(); // no catch-up in this test
    await expect(failing.s.purge()).rejects.toThrow("emailLogs");
    const rec = failing.registry.snapshot().find((r) => r.key === DATA_RETENTION_JOB);
    expect(rec?.lastStatus).toBe("error");
  });

  it("on: one boot catch-up after start-up", async () => {
    jest.useFakeTimers();
    const { run, s } = scheduler(true);
    s.onModuleInit();
    expect(run).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(90_000);
    expect(run).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe("signup.purgeUnverified writes its imha record even when the sweep fails", () => {
  const result = (over: Partial<{ deleted: number; failed: number; capped: boolean }> = {}) => ({
    scanned: 3,
    deleted: 2,
    skipped: 0,
    busy: 0,
    failed: 0,
    capped: false,
    ...over,
  });

  it("removed some accounts, failed on one: recorded with the count and as failed, then the failure marks the run", async () => {
    const failed = result({ failed: 1 });
    const cleanup = {
      enabled: true,
      purgeExpired: jest.fn(async () => {
        throw new SignupPurgeFailedError("unverified sign-up sweep: 1 account(s) could not be removed", failed);
      }),
    };
    const records = { record: jest.fn(async () => true) };
    const registry = new CronRegistryService();
    const s = new UnverifiedSignupScheduler(cleanup as never, registry, records as never);
    s.onModuleInit();
    await expect(s.purge()).rejects.toThrow("could not be removed");
    expect(records.record).toHaveBeenCalledWith(
      "signup.purgeUnverified",
      { unverifiedSignups: 2 },
      { capped: [], failed: ["unverifiedSignups"] },
    );
    expect(registry.snapshot().find((r) => r.key === "signup.purgeUnverified")?.lastStatus).toBe("error");
  });

  it("a record that cannot be written does not hide the sweep's own failure", async () => {
    const cleanup = {
      enabled: true,
      purgeExpired: jest.fn(async () => {
        throw new SignupPurgeFailedError("sweep failed", result({ failed: 1 }));
      }),
    };
    const records = { record: jest.fn(async () => { throw new Error("audit insert failed"); }) };
    const s = new UnverifiedSignupScheduler(cleanup as never, new CronRegistryService(), records as never);
    await expect(s.purge()).rejects.toThrow("sweep failed");
  });

  it("a clean sweep records its count and a hit cap", async () => {
    const cleanup = { enabled: true, purgeExpired: jest.fn(async () => result({ capped: true })) };
    const records = { record: jest.fn(async () => true) };
    await new UnverifiedSignupScheduler(cleanup as never, new CronRegistryService(), records as never).purge();
    expect(records.record).toHaveBeenCalledWith(
      "signup.purgeUnverified",
      { unverifiedSignups: 2 },
      { capped: ["unverifiedSignups"], failed: [] },
    );
  });
});
