import { Injectable } from "@nestjs/common";

export interface CronRunRecord {
  /** İnsan-okur ad (admin Sistem Sağlığı sayfasında gösterilir). */
  label: string;
  /** Zamanlama açıklaması ("her dakika", "günlük 03:00" ...). */
  schedule: string;
  lastRunAt: Date | null;
  lastStatus: "ok" | "error" | null;
  lastError: string | null;
  runCount: number;
}

/**
 * In-memory cron çalışma kaydı — admin Sistem Sağlığı sayfası "cron'lar en
 * son ne zaman koştu?" sorusuna cevap verir (uyuyan/uyanan free-tier'da ve
 * restart sonrası kaçırılan işleri teşhis için). Bilinçli olarak DB'siz:
 * kayıt kaybı = "bu açılıştan beri çalışmadı" bilgisi, o da değerlidir
 * (bootAt ile birlikte okunur).
 */
@Injectable()
export class CronRegistryService {
  readonly bootAt = new Date();
  private readonly jobs = new Map<string, CronRunRecord>();

  /** Scheduler modül init'inde tanıtır — hiç koşmasa da listede görünsün. */
  register(key: string, label: string, schedule: string): void {
    if (this.jobs.has(key)) return;
    this.jobs.set(key, {
      label,
      schedule,
      lastRunAt: null,
      lastStatus: null,
      lastError: null,
      runCount: 0,
    });
  }

  recordRun(key: string, error?: unknown): void {
    const rec = this.jobs.get(key);
    if (!rec) return;
    rec.lastRunAt = new Date();
    rec.runCount += 1;
    if (error === undefined) {
      rec.lastStatus = "ok";
      rec.lastError = null;
    } else {
      rec.lastStatus = "error";
      rec.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  snapshot(): Array<{ key: string } & CronRunRecord> {
    return [...this.jobs.entries()].map(([key, rec]) => ({ key, ...rec }));
  }
}

/**
 * Cron gövdesini kayıtla sarar. `registry` undefined olabilir (testler
 * scheduler'ı elle `new`'ler, DI dışı) — o durumda yalnız fn çalışır.
 */
export async function trackCronRun(
  registry: CronRegistryService | undefined,
  key: string,
  fn: () => Promise<void>,
): Promise<void> {
  try {
    await fn();
    registry?.recordRun(key);
  } catch (err) {
    registry?.recordRun(key, err);
    throw err;
  }
}
