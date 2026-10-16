import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@rothern/db";
import { appDayKey, appDayStart } from "../../common/time/app-calendar";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { reportToSentry } from "../../instrument";
import { AUDIT_CRITICAL_LOSS_MARKER } from "../audit/audit.service";

/**
 * Audit action of an imha record. Labels: admin `audit-actions.ts`
 * (`ACTION_LABELS`, filter "Sistem: periyodik imha") and the metadata keys in
 * admin `audit-format.ts`.
 */
export const DATA_RETENTION_ACTION = "system.retention_purge";

/** How many recent records of a job are searched for a watermark. */
const WATERMARK_LOOKBACK = 30;
/** A watermark is used this much earlier than it says (clock skew, rows committed late). */
const WATERMARK_OVERLAP_MS = 24 * 60 * 60 * 1000;

export interface RetentionRecordDetails {
  /** Categories that stopped at the per-run limit; the rest waits for the next run. */
  capped?: readonly string[];
  /** Categories that failed in this run. */
  failed?: readonly string[];
  /**
   * In-place categories that finished completely: their cut-off (ISO). Every
   * row older than it was processed - the next run starts there (watermark).
   */
  through?: Readonly<Record<string, string>>;
}

/**
 * Watermarks from recent imha records of one job, newest record first. For
 * each category: the newest `through` value, minus the overlap. A record
 * without it (the category stopped at the limit or failed) is skipped, so an
 * older complete run still bounds the scan - every row older than ITS cut-off
 * was processed then, and these tables only gain rows with a creation time of
 * "now". No valid value: no lower bound (full scan).
 */
export function watermarksFrom(
  metadatas: readonly unknown[],
  categories: readonly string[],
): Record<string, Date> {
  const out: Record<string, Date> = {};
  for (const category of categories) {
    for (const meta of metadatas) {
      const through = (meta as { through?: unknown } | null)?.through;
      if (!through || typeof through !== "object") continue;
      const value = (through as Record<string, unknown>)[category];
      if (typeof value !== "string") continue;
      const at = Date.parse(value);
      if (Number.isNaN(at)) continue;
      out[category] = new Date(at - WATERMARK_OVERLAP_MS);
      break;
    }
  }
  return out;
}

/**
 * IMHA RECORDS (policy section 10, Yönetmelik m.7/3).
 *
 * Every automatic deletion / reduction run leaves ONE audit entry: system
 * actor, action `system.retention_purge`, metadata `{ job, <category>: count,
 * ... }`. Counts and category names only - never the data that was destroyed
 * (no address, no id). The entries are audit records and live 10 years
 * (row 4 / row 19), well over the three years of m.7/3.
 *
 * Written when the run processed something or hit a limit or a failure; a run
 * with nothing to do writes at most one entry per job and Istanbul day (the
 * proof that the job ran), so restarts (boot catch-up) do not flood the log.
 *
 * Written directly (bypass client), NOT through `AuditService.log`: that one
 * swallows a failed insert by design (the business action must go on), but a
 * destruction run without its record is a FAILED run - the error reaches
 * Sentry (`AUDIT_CRITICAL_LOSS_MARKER`) and is rethrown, so the job wrapper marks
 * the run failed and `[CRON-HATA] <job>` fires too.
 *
 * Used by `retention.purge` and by the older purge jobs (`views.purge`,
 * `ai.cleanupChatSessions`, `ai.cleanupExtractFiles`, `sessions.purgeRevoked`,
 * `signup.purgeUnverified`), each with its registry key as `job`.
 */
@Injectable()
export class RetentionRecordService {
  private readonly logger = new Logger(RetentionRecordService.name);

  constructor(
    // Cron context, no tenant: bypass client.
    private readonly prisma: PrismaBypassService,
  ) {}

  /**
   * Writes the imha record of one run (see the class note). Returns whether
   * an entry was written; throws when the write failed.
   */
  async record(
    job: string,
    counts: Readonly<Record<string, number>>,
    details: RetentionRecordDetails = {},
    now: Date = new Date(),
  ): Promise<boolean> {
    const capped = details.capped ?? [];
    const failed = details.failed ?? [];
    const through = details.through ?? {};
    const busy = Object.values(counts).some((n) => n > 0) || capped.length > 0 || failed.length > 0;
    if (!busy && (await this.recordedSince(job, appDayStart(appDayKey(now)) ?? now))) return false;
    const metadata: Prisma.InputJsonObject = {
      job,
      ...counts,
      ...(capped.length ? { capped: [...capped] } : {}),
      ...(failed.length ? { failed: [...failed] } : {}),
      ...(Object.keys(through).length ? { through: { ...through } } : {}),
    };
    try {
      // System actor: no person, tenant, IP or browser string - counts only.
      await this.prisma.auditLog.create({
        data: { action: DATA_RETENTION_ACTION, actorType: "system", metadata },
      });
    } catch (err) {
      // The proof of destruction is lost: alarm (no personal data in the
      // event - the job key only) and fail the run.
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.error(`${AUDIT_CRITICAL_LOSS_MARKER} action=${DATA_RETENTION_ACTION} job=${job}: ${reason}`);
      reportToSentry(AUDIT_CRITICAL_LOSS_MARKER, "error", {
        tags: { audit: "critical-loss", action: DATA_RETENTION_ACTION },
        extra: { job, reason },
      });
      throw err;
    }
    return true;
  }

  /** Watermarks of `job` for `categories` (`watermarksFrom`). Index `(action, createdAt)`. */
  async watermarks(job: string, categories: readonly string[]): Promise<Record<string, Date>> {
    const rows = await this.prisma.auditLog.findMany({
      where: { action: DATA_RETENTION_ACTION, metadata: { path: ["job"], equals: job } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: WATERMARK_LOOKBACK,
      select: { metadata: true },
    });
    return watermarksFrom(
      rows.map((r) => r.metadata),
      categories,
    );
  }

  private async recordedSince(job: string, since: Date): Promise<boolean> {
    const row = await this.prisma.auditLog.findFirst({
      where: {
        action: DATA_RETENTION_ACTION,
        createdAt: { gte: since },
        metadata: { path: ["job"], equals: job },
      },
      select: { id: true },
    });
    return row !== null;
  }
}
