import { Injectable, Logger, Optional, type OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  CronRegistryService,
  trackCronRun,
} from "../../../common/cron/cron-registry.service";
import { PrismaBypassService } from "../../../common/prisma/prisma.service";
import { reportToSentry } from "../../../instrument";
import {
  CLOSED_COMPANY_ERASURE_ALERT_DAYS,
  CLOSED_COMPANY_ERASURE_DEADLINE_DAYS,
  CLOSED_COMPANY_WHERE,
} from "../account-closure";

const DAY_MS = 24 * 60 * 60 * 1000;
/** At most this many companies are named in one report (the admin filter lists them all). */
const REPORT_LIMIT = 20;

export interface ClosedCompanyErasureReport {
  /** Closed companies older than `CLOSED_COMPANY_ERASURE_ALERT_DAYS`, still waiting for the erasure. */
  waiting: number;
  /** Of those, the ones already past `CLOSED_COMPANY_ERASURE_DEADLINE_DAYS`. */
  overdue: number;
}

/**
 * REMINDER FOR THE 30-DAY KVKK ERASURE OF CLOSED COMPANIES (2026-10-16).
 *
 * When the last user of a company deletes their account, the company is only
 * suspended (`AccountDeletionService`, note `CLOSED_BY_OWNER_NOTE`); the
 * company-level erasure (`AdminCompaniesService.deleteOrAnonymize`) is started
 * by an administrator. The privacy texts promise it within
 * `CLOSED_COMPANY_ERASURE_DEADLINE_DAYS` days, so nothing may depend on
 * someone remembering: every morning this job counts the closed companies
 * that are `CLOSED_COMPANY_ERASURE_ALERT_DAYS` days old and not erased yet
 * (`isActive` turns false only at the anonymisation; a hard delete removes the
 * row; a company with a live user again is not "closed" - `CLOSED_COMPANY_WHERE`)
 * and reports them as a Sentry warning and a server log line, every day
 * until they are erased. The admin company list shows the same set under the
 * filter "KVKK silme bekliyor". Operator routine: `docs/pending-operator-tasks.md`.
 *
 * Reads only (ids and dates, no personal data in the report). No catch-up at
 * start-up: a missed morning is caught the next one.
 */
@Injectable()
export class ClosedCompanyErasureScheduler implements OnModuleInit {
  private readonly logger = new Logger(ClosedCompanyErasureScheduler.name);

  constructor(
    // Cron without a tenant: bypass client, read-only.
    private readonly prisma: PrismaBypassService,
    // @Optional: tests build the scheduler by hand, outside the DI container.
    @Optional() private readonly cronRegistry?: CronRegistryService,
  ) {}

  onModuleInit(): void {
    this.cronRegistry?.register(
      "account.closedCompanyErasure",
      `Reports companies closed by their last user that still wait for the KVKK erasure after ${CLOSED_COMPANY_ERASURE_ALERT_DAYS} days`,
      "daily 09:30 (Istanbul)",
    );
  }

  @Cron("30 9 * * *", { timeZone: "Europe/Istanbul" })
  async remind(): Promise<void> {
    return trackCronRun(this.cronRegistry, "account.closedCompanyErasure", async () => {
      await this.check();
    });
  }

  async check(now: Date = new Date()): Promise<ClosedCompanyErasureReport> {
    // Same set as the admin list filter "KVKK silme bekliyor" (`CLOSED_COMPANY_WHERE`).
    const where = {
      ...CLOSED_COMPANY_WHERE,
      blockedAt: { lte: new Date(now.getTime() - CLOSED_COMPANY_ERASURE_ALERT_DAYS * DAY_MS) },
    };
    const [waiting, oldest] = await Promise.all([
      this.prisma.company.count({ where }),
      this.prisma.company.findMany({
        where,
        select: { id: true, rothernId: true, blockedAt: true },
        orderBy: [{ blockedAt: "asc" }, { id: "asc" }],
        take: REPORT_LIMIT,
      }),
    ]);
    if (waiting === 0) return { waiting: 0, overdue: 0 };
    const deadline = new Date(now.getTime() - CLOSED_COMPANY_ERASURE_DEADLINE_DAYS * DAY_MS);
    const overdue = await this.prisma.company.count({
      where: { ...where, blockedAt: { lte: deadline } },
    });
    const companies = oldest.map((c) => ({
      id: c.id,
      rothernId: c.rothernId,
      daysSinceClosure: c.blockedAt ? Math.floor((now.getTime() - c.blockedAt.getTime()) / DAY_MS) : null,
    }));
    const message = `[KVKK-SILME-BEKLIYOR] ${waiting} closed compan${waiting === 1 ? "y" : "ies"} waiting for the KVKK erasure (${overdue} past ${CLOSED_COMPANY_ERASURE_DEADLINE_DAYS} days): admin company list, filter "KVKK silme bekliyor", then the company summary tab (KVKK delete / anonymise)`;
    this.logger.warn(`${message} ${JSON.stringify(companies)}`);
    reportToSentry("[KVKK-SILME-BEKLIYOR]", overdue > 0 ? "error" : "warning", {
      tags: { kvkk: "closed-company-erasure" },
      extra: { waiting, overdue, companies },
    });
    return { waiting, overdue };
  }
}
