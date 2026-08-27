import { Injectable, Logger } from "@nestjs/common";
import { reportToSentry } from "../../instrument";

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
    /**
     * Denetim 2026-08-27 Parça 11 #2: cron hataları HİÇBİR alarma ulaşmıyordu.
     * `@nestjs/schedule` işi `CronJob.from({...options, onTick})` ile kuruyor
     * ve `errorHandler` GEÇMİYOR; `cron@4` reddi kendi yakalayıp ham
     * `console.error("[Cron] error in callback")` basıyor. Yani hata (a) Pino
     * JSON hattının dışında kalıyor (reqId'siz, redaction'sız), (b) cron zaten
     * yakaladığı için `unhandledRejection` ağına da düşmüyor. Sonuç: her dakika
     * patlayan bir iş (ör. ihale kapatma) günlerce sessizce ölü kalabiliyordu;
     * tek iz, bir adminin Sistem sayfasını açıp rozeti görmesiydi (o kayıt da
     * süreç-ömürlü). Alarm zincirini burada, tek noktadan bağlıyoruz.
     */
    const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
    new Logger("Cron").error(`[CRON-HATA] ${key}: ${reason}`);
    reportToSentry(`[CRON-HATA] ${key}`, "error", {
      tags: { cron: key },
      extra: { reason: reason.slice(0, 2000) },
    });
    throw err;
  }
}
