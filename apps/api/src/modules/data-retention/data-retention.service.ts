import { Injectable, Logger, type OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import {
  resolveSignupPurgeSwitch,
  type SignupPurgeSwitch,
} from "../company-auth/services/unverified-signup-cleanup.service";
import {
  REDUCED_EMAIL_LOG_DATA,
  aiUsageEmailWhere,
  auditNetworkDataWhere,
  complaintLogToReduceWhere,
  discoveryCandidateWhere,
  expiredAiUsageWhere,
  expiredAuditRecordWhere,
  expiredEmailLogWhere,
  externalInviteWhere,
  inquiryIpWhere,
  isFullScanDay,
  notificationWhere,
  passwordResetLinkWhere,
  retentionCutoffs,
  searchMissWhere,
  sentDigestItemSql,
  staleReferralInviteWhere,
  staleTeamInvitationWhere,
  unverifiedInquiryWhere,
  verificationCodeWhere,
} from "./retention-policy";
import { RetentionRecordService } from "./retention-record.service";

/** Registry key of the job (admin label in `lib/cron-jobs.ts`); also `job` in its imha records. */
export const DATA_RETENTION_JOB = "retention.purge";

/**
 * THE SWITCH. Same rule as `UNVERIFIED_SIGNUP_PURGE_ENABLED`
 * (`resolveSignupPurgeSwitch`):
 *  - exactly "true" / "false" wins;
 *  - not set (or empty): ON only when `NODE_ENV` is "production" - the Render
 *    staging and production services need no setting - OFF everywhere else
 *    (local development, the local UI-test stack, tests, scripts);
 *  - any other value: OFF (a typo must not fall through to "on").
 * Off: the nightly tick returns before the job wrapper (the registry shows a
 * job that never ran here) and `run()` reads and changes nothing.
 * Unlike the sign-up purge this job touches only its own database (no auth
 * provider call), so a restored copy may keep it on; switching it off there
 * keeps the copy identical to its source for inspection.
 */
export const DATA_RETENTION_PURGE_ENV = "DATA_RETENTION_PURGE_ENABLED";

/**
 * Categories of one run, in run order: deletions first (fewer rows left to
 * update), then the in-place reductions. These are the metadata keys of the
 * imha record (admin labels in `audit-format.ts`); `emailEvents` is reported
 * next to them (events go with their log).
 */
export const RETENTION_CATEGORIES = [
  "passwordResetLinks",
  "emailVerificationCodes",
  "unverifiedInquiries",
  "externalInvites",
  // After `externalInvites`: a link record freed by tonight's invite deletions goes tonight.
  "referralInvites",
  "discoveryCandidates",
  "teamInvitations",
  "notifications",
  "digestItems",
  "searchMisses",
  "emailLogs",
  "auditRecords",
  "aiUsageRecords",
  "emailLogsReduced",
  "inquiryIps",
  "auditNetworkData",
  "aiUsageEmails",
] as const;
export type RetentionCategory = (typeof RETENTION_CATEGORIES)[number];

/** In-place categories: their rows stay, so a watermark bounds the next scan (except on full-scan days). */
const WATERMARKED = ["inquiryIps", "auditNetworkData", "aiUsageEmails"] as const satisfies readonly RetentionCategory[];
type WatermarkedCategory = (typeof WATERMARKED)[number];

export interface RetentionLimits {
  /** Rows per statement. */
  batchSize: number;
  /** Statements per category and run; the rest waits for the next run. */
  maxBatches: number;
  /** Account ids per page in the notification scan. */
  userPageSize: number;
}

/**
 * At most 50 000 rows per category and night, 1 000 per statement: the first
 * run on a large table (or after a long pause) cannot hold locks for long or
 * fill the WAL in one go; it simply continues the next night (the record
 * lists the category under `capped`).
 */
export const DEFAULT_RETENTION_LIMITS: RetentionLimits = {
  batchSize: 1000,
  maxBatches: 50,
  userPageSize: 500,
};

export type RetentionCounts = Record<RetentionCategory | "emailEvents", number>;

export interface RetentionRunReport {
  enabled: boolean;
  counts: RetentionCounts;
  capped: RetentionCategory[];
  failed: RetentionCategory[];
  /** Watermarked categories that finished: the cut-off they finished at (ISO). */
  through: Partial<Record<WatermarkedCategory, string>>;
  /** An imha record was written for this run. */
  recorded: boolean;
}

interface StepResult {
  capped: boolean;
  /** Only for watermarked categories that finished: the cut-off applied. */
  through?: Date;
}

interface Budget {
  batchesLeft: number;
}

/**
 * Rows processed by one category so far. Kept outside the step so a step that
 * fails half-way still reports what it did commit (each batch commits on its own).
 */
interface Progress {
  processed: number;
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

function emptyCounts(): RetentionCounts {
  const counts = { emailEvents: 0 } as RetentionCounts;
  for (const c of RETENTION_CATEGORIES) counts[c] = 0;
  return counts;
}

/**
 * Bounded batches: select up to `batchSize` ids with the rule, process them
 * with the rule re-asserted, repeat until a batch comes back short. Without an
 * ORDER BY on purpose: every selected row is processed or no longer matches,
 * so the next select never sees it again (this is not the "unordered take +
 * filter in code" pattern - the whole rule is in the query). Each statement
 * commits on its own.
 */
async function drain(
  budget: Budget,
  batchSize: number,
  progress: Progress,
  nextIds: () => Promise<string[]>,
  apply: (batch: string[]) => Promise<number>,
): Promise<StepResult> {
  for (;;) {
    if (budget.batchesLeft <= 0) return { capped: true };
    const batch = await nextIds();
    if (batch.length === 0) return { capped: false };
    budget.batchesLeft -= 1;
    progress.processed += await apply(batch);
    if (batch.length < batchSize) return { capped: false };
  }
}

/**
 * PERIODIC DESTRUCTION (Kişisel Veri Saklama ve İmha Politikası, 2026-10-16).
 *
 * Applies every automatic period of the policy table that no other job owns
 * (`retention-policy.ts` lists them, with the exact WHERE clause of each):
 * deletes expired password links and verification codes, unverified visitor
 * requests, third-party invitation data (request invitations, invitation link
 * records, discovery candidates), stale team invitations, notifications, sent
 * digest items, stale category searches, e-mail logs, audit records and AI
 * usage records, and strips the IP address of old visitor requests, the IP
 * address / browser string of old audit records and the e-mail address of
 * old AI usage records.
 *
 * Every category runs on its own: a failure is logged, the others still run,
 * the imha record lists it under `failed` and the run throws at the end (the
 * cron registry and the alarm show it). Batches are bounded
 * (`DEFAULT_RETENTION_LIMITS`). One imha record per run
 * (`RetentionRecordService`).
 *
 * Tables it never touches: the opt-out lists, companies, accounts, requests,
 * quotes, orders, messages, discovery runs - and every row that does not
 * match a rule exactly.
 */
@Injectable()
export class DataRetentionService implements OnModuleInit {
  private readonly logger = new Logger(DataRetentionService.name);
  /** Read once: the process environment does not change while the API runs. */
  private readonly purgeSwitch: SignupPurgeSwitch;
  private readonly nodeEnv: string | undefined;

  constructor(
    // Cron context, no tenant: bypass client.
    private readonly prisma: PrismaBypassService,
    private readonly records: RetentionRecordService,
    config: ConfigService,
  ) {
    this.nodeEnv = config.get<string>("NODE_ENV");
    this.purgeSwitch = resolveSignupPurgeSwitch(config.get<string>(DATA_RETENTION_PURGE_ENV), this.nodeEnv);
  }

  get enabled(): boolean {
    return this.purgeSwitch.enabled;
  }

  /** The state of the switch, once at start-up. */
  onModuleInit(): void {
    const env = `NODE_ENV=${this.nodeEnv ?? "(unset)"}`;
    if (this.purgeSwitch.source === "invalid") {
      this.logger.warn(
        `Data retention purge is OFF: ${DATA_RETENTION_PURGE_ENV} has a value that is neither "true" nor "false" (${env}).`,
      );
      return;
    }
    const why =
      this.purgeSwitch.source === "explicit"
        ? `${DATA_RETENTION_PURGE_ENV}=${this.purgeSwitch.enabled}`
        : `${DATA_RETENTION_PURGE_ENV} not set, ${env}; on by default only when NODE_ENV is "production"`;
    if (this.purgeSwitch.enabled) this.logger.log(`Data retention purge is ON (${why}).`);
    else if (this.nodeEnv === "production") this.logger.warn(`Data retention purge is OFF in a production-mode process (${why}).`);
    else this.logger.log(`Data retention purge is OFF (${why}).`);
  }

  /**
   * One run. Does nothing when the switch is off. Throws AFTER the imha record
   * when a category failed.
   */
  async run(now: Date = new Date(), limits: RetentionLimits = DEFAULT_RETENTION_LIMITS): Promise<RetentionRunReport> {
    const report: RetentionRunReport = {
      enabled: this.enabled,
      counts: emptyCounts(),
      capped: [],
      failed: [],
      through: {},
      recorded: false,
    };
    if (!this.enabled) return report;

    // Where the in-place scans may start (rows below were stripped by an
    // earlier complete run). A failure here only costs a full scan; once a
    // week the whole range is scanned anyway (`isFullScanDay`: self-repair).
    let from: Record<string, Date> = {};
    if (!isFullScanDay(now)) {
      try {
        from = await this.records.watermarks(DATA_RETENTION_JOB, WATERMARKED);
      } catch (err) {
        this.logger.warn(`Retention watermarks unreadable, scanning in full: ${String(err)}`);
      }
    }

    const steps: Record<RetentionCategory, (p: Progress) => Promise<StepResult>> = {
      passwordResetLinks: (p) => this.deleteRows("passwordResetToken", passwordResetLinkWhere(now), limits, p),
      emailVerificationCodes: (p) => this.deleteRows("emailVerificationCode", verificationCodeWhere(now), limits, p),
      unverifiedInquiries: (p) => this.deleteRows("publicInquiry", unverifiedInquiryWhere(now), limits, p),
      externalInvites: (p) => this.deleteRows("externalListingInvite", externalInviteWhere(now), limits, p),
      referralInvites: (p) => this.deleteRows("companyReferralInvite", staleReferralInviteWhere(now), limits, p),
      discoveryCandidates: (p) => this.deleteRows("supplierDiscoveryCandidate", discoveryCandidateWhere(now), limits, p),
      teamInvitations: (p) => this.deleteRows("companyUserInvitation", staleTeamInvitationWhere(now), limits, p),
      notifications: (p) => this.deleteNotifications(now, limits, p),
      digestItems: (p) => this.deleteSentDigestItems(now, limits, p),
      searchMisses: (p) => this.deleteRows("categorySearchMiss", searchMissWhere(now), limits, p),
      emailLogs: (p) => this.deleteEmailLogs(now, limits, p, report.counts),
      auditRecords: (p) => this.deleteRows("auditLog", expiredAuditRecordWhere(now), limits, p),
      aiUsageRecords: (p) => this.deleteRows("aiUsage", expiredAiUsageWhere(now), limits, p),
      emailLogsReduced: (p) => this.reduceComplaintLogs(now, limits, p, report.counts),
      inquiryIps: (p) => this.stripInquiryIps(now, from.inquiryIps ?? null, limits, p),
      auditNetworkData: (p) => this.stripAuditNetworkData(now, from.auditNetworkData ?? null, limits, p),
      aiUsageEmails: (p) => this.stripAiUsageEmails(now, from.aiUsageEmails ?? null, limits, p),
    };

    for (const category of RETENTION_CATEGORIES) {
      const progress: Progress = { processed: 0 };
      try {
        const result = await steps[category](progress);
        if (result.capped) report.capped.push(category);
        if (result.through && (WATERMARKED as readonly string[]).includes(category)) {
          report.through[category as WatermarkedCategory] = result.through.toISOString();
        }
      } catch (err) {
        report.failed.push(category);
        const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
        this.logger.error(`[IMHA-HATA] ${category}: ${reason}`);
      } finally {
        // What committed before a failure is destroyed all the same: it is counted.
        report.counts[category] = progress.processed;
      }
    }

    report.recorded = await this.records.record(
      DATA_RETENTION_JOB,
      report.counts,
      { capped: report.capped, failed: report.failed, through: report.through },
      now,
    );

    const nonZero = Object.entries(report.counts).filter(([, n]) => n > 0);
    if (nonZero.length > 0) {
      this.logger.log(`Retention purge: ${nonZero.map(([k, n]) => `${k}=${n}`).join(" ")}`);
    }
    if (report.capped.length > 0) {
      this.logger.warn(
        `Retention purge stopped at the per-run limit for ${report.capped.join(", ")}; the rest follows on the next run`,
      );
    }
    if (report.failed.length > 0) {
      throw new Error(`[IMHA-HATA] retention categories failed: ${report.failed.join(", ")}`);
    }
    return report;
  }

  // ─── Steps ───────────────────────────────────────────────────────────────

  /**
   * Plain deletion with the rule. The model delegates are typed loosely here
   * (one code path for ten tables); each `where` is built and type-checked by
   * its function in `retention-policy.ts`.
   */
  private async deleteRows(
    model: DeletableModel,
    where: object,
    limits: RetentionLimits,
    progress: Progress,
  ): Promise<StepResult> {
    const delegate = this.prisma[model] as unknown as RowDelegate;
    return drain(
      { batchesLeft: limits.maxBatches },
      limits.batchSize,
      progress,
      async () => ids(await delegate.findMany({ where, select: { id: true }, take: limits.batchSize })),
      async (batch) => (await delegate.deleteMany({ where: { AND: [{ id: { in: batch } }, where] } })).count,
    );
  }

  /** Row 15, per page of account ids so the `(companyUserId, createdAt)` index serves every scan. */
  private async deleteNotifications(now: Date, limits: RetentionLimits, progress: Progress): Promise<StepResult> {
    const where = notificationWhere(now);
    const budget: Budget = { batchesLeft: limits.maxBatches };
    let afterId: string | undefined;
    for (;;) {
      const users = await this.prisma.companyUser.findMany({
        where: afterId ? { id: { gt: afterId } } : {},
        orderBy: { id: "asc" },
        take: limits.userPageSize,
        select: { id: true },
      });
      if (users.length === 0) return { capped: false };
      afterId = users[users.length - 1]!.id;
      const scoped = { AND: [{ companyUserId: { in: ids(users) } }, where] };
      const r = await drain(
        budget,
        limits.batchSize,
        progress,
        async () => ids(await this.prisma.notification.findMany({ where: scoped, select: { id: true }, take: limits.batchSize })),
        async (batch) =>
          (await this.prisma.notification.deleteMany({ where: { AND: [{ id: { in: batch } }, where] } })).count,
      );
      if (r.capped) return { capped: true };
      if (users.length < limits.userPageSize) return { capped: false };
    }
  }

  /**
   * Row 16: sent digest items whose request settled. The rule is one SQL
   * fragment (`sentDigestItemSql`: the item has no foreign key to its
   * request), used by the select and re-asserted by the delete.
   */
  private async deleteSentDigestItems(now: Date, limits: RetentionLimits, progress: Progress): Promise<StepResult> {
    const rule = sentDigestItemSql(now);
    return drain(
      { batchesLeft: limits.maxBatches },
      limits.batchSize,
      progress,
      async () =>
        ids(
          await this.prisma.$queryRaw<{ id: string }[]>`
            SELECT d.id FROM email_digest_items d WHERE ${rule} LIMIT ${limits.batchSize}`,
        ),
      async (batch) =>
        Number(await this.prisma.$executeRaw`DELETE FROM email_digest_items d WHERE d.id = ANY(${batch}) AND ${rule}`),
    );
  }

  /**
   * Rows 3 and 21: e-mail logs past their period; their events go with them
   * (cascade). The events are counted and the logs deleted in ONE transaction,
   * with the same scope, so the counts match what was destroyed (a webhook
   * event committed between the two statements is the only possible miss).
   */
  private async deleteEmailLogs(
    now: Date,
    limits: RetentionLimits,
    progress: Progress,
    counts: RetentionCounts,
  ): Promise<StepResult> {
    const where = expiredEmailLogWhere(now);
    return drain(
      { batchesLeft: limits.maxBatches },
      limits.batchSize,
      progress,
      async () => ids(await this.prisma.emailLog.findMany({ where, select: { id: true }, take: limits.batchSize })),
      async (batch) => {
        const scoped = { AND: [{ id: { in: batch } }, where] };
        const [events, logs] = await this.prisma.$transaction([
          this.prisma.emailEvent.count({ where: { emailLog: scoped } }),
          this.prisma.emailLog.deleteMany({ where: scoped }),
        ]);
        counts.emailEvents += events;
        return logs.count;
      },
    );
  }

  /** Rows 3 / 21 + 14: a spam complaint past its period is reduced to a refusal record; its events are deleted. */
  private async reduceComplaintLogs(
    now: Date,
    limits: RetentionLimits,
    progress: Progress,
    counts: RetentionCounts,
  ): Promise<StepResult> {
    const where = complaintLogToReduceWhere(now);
    return drain(
      { batchesLeft: limits.maxBatches },
      limits.batchSize,
      progress,
      async () => ids(await this.prisma.emailLog.findMany({ where, select: { id: true }, take: limits.batchSize })),
      async (batch) => {
        const scoped = { AND: [{ id: { in: batch } }, where] };
        const [events, logs] = await this.prisma.$transaction([
          this.prisma.emailEvent.deleteMany({ where: { emailLog: scoped } }),
          this.prisma.emailLog.updateMany({ where: scoped, data: REDUCED_EMAIL_LOG_DATA }),
        ]);
        counts.emailEvents += events.count;
        return logs.count;
      },
    );
  }

  /** Row 12: the sender IP of visitor requests older than 30 days. */
  private async stripInquiryIps(
    now: Date,
    from: Date | null,
    limits: RetentionLimits,
    progress: Progress,
  ): Promise<StepResult> {
    const cutoff = retentionCutoffs(now).inquiryIps;
    const where = inquiryIpWhere(now, from);
    const r = await drain(
      { batchesLeft: limits.maxBatches },
      limits.batchSize,
      progress,
      async () => ids(await this.prisma.publicInquiry.findMany({ where, select: { id: true }, take: limits.batchSize })),
      async (batch) =>
        (
          await this.prisma.publicInquiry.updateMany({
            where: { AND: [{ id: { in: batch } }, where] },
            data: { createdIp: null },
          })
        ).count,
    );
    return r.capped ? r : { ...r, through: cutoff };
  }

  /** Row 4: IP address and browser string of audit records near the two-year ceiling. */
  private async stripAuditNetworkData(
    now: Date,
    from: Date | null,
    limits: RetentionLimits,
    progress: Progress,
  ): Promise<StepResult> {
    const cutoff = retentionCutoffs(now).auditNetworkData;
    const where = auditNetworkDataWhere(now, from);
    const r = await drain(
      { batchesLeft: limits.maxBatches },
      limits.batchSize,
      progress,
      async () => ids(await this.prisma.auditLog.findMany({ where, select: { id: true }, take: limits.batchSize })),
      async (batch) =>
        (
          await this.prisma.auditLog.updateMany({
            where: { AND: [{ id: { in: batch } }, where] },
            data: { ip: null, userAgent: null },
          })
        ).count,
    );
    return r.capped ? r : { ...r, through: cutoff };
  }

  /** Row 6: the e-mail address of AI usage records older than a year. */
  private async stripAiUsageEmails(
    now: Date,
    from: Date | null,
    limits: RetentionLimits,
    progress: Progress,
  ): Promise<StepResult> {
    const cutoff = retentionCutoffs(now).aiUsageEmails;
    const where = aiUsageEmailWhere(now, from);
    const r = await drain(
      { batchesLeft: limits.maxBatches },
      limits.batchSize,
      progress,
      async () => ids(await this.prisma.aiUsage.findMany({ where, select: { id: true }, take: limits.batchSize })),
      async (batch) =>
        (
          await this.prisma.aiUsage.updateMany({
            where: { AND: [{ id: { in: batch } }, where] },
            data: { userEmail: null },
          })
        ).count,
    );
    return r.capped ? r : { ...r, through: cutoff };
  }
}

/** Tables the generic deletion step serves. */
type DeletableModel =
  | "passwordResetToken"
  | "emailVerificationCode"
  | "publicInquiry"
  | "externalListingInvite"
  | "companyReferralInvite"
  | "supplierDiscoveryCandidate"
  | "companyUserInvitation"
  | "categorySearchMiss"
  | "auditLog"
  | "aiUsage";

interface RowDelegate {
  findMany(args: { where: object; select: { id: true }; take: number }): Promise<{ id: string }[]>;
  deleteMany(args: { where: object }): Promise<{ count: number }>;
}
