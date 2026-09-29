import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@rothern/db";

/**
 * ÇOK ÖRNEKLİ KOŞUMDA ÇİFT TETİKLEME KİLİDİ (2026-09-12).
 *
 * Bugün Render'da TEK örnek koşuyor ve 15 zamanlanmış işin hiçbirinde kilit
 * yok. İkinci örnek açıldığı gün her iş İKİ kez çalışır: çift hatırlatma
 * e-postası, çift özet, çift temizlik. Ölçekleme anında fark edilmesi zor,
 * etkisi müşteriye doğrudan yansıyan bir hata sınıfı.
 *
 * Uygulama: Postgres **oturum düzeyi advisory lock**. İşi ancak kilidi ALAN
 * örnek koşar, diğeri sessizce atlar.
 *
 * İKİ TUZAK:
 *  1. Advisory lock OTURUMA bağlıdır; `DATABASE_URL` PgBouncer'ın işlem
 *     havuzundan geçtiği için oradaki bağlantı iki sorgu arasında değişebilir.
 *     Bu yüzden kilit, oturum modundaki `DIRECT_URL` üzerinden AYRI ve tek
 *     bağlantılı bir istemciyle alınır.
 *  2. **FAIL-OPEN**: kilit altyapısı bozulursa (DIRECT_URL yok, bağlantı
 *     hatası) iş ATLANMAZ, koşar. Aksi hâlde tek bir yapılandırma hatası tüm
 *     zamanlanmış işleri sessizce durdururdu — kilidin önlediği zarardan çok
 *     daha büyük bir zarar.
 *  3. **AYNI SÜREÇTE ÜST ÜSTE BİNME** (derin denetim Y-08 gözden geçirme):
 *     `pg_try_advisory_lock` aynı oturumda YENİDEN alınabilir (sayaçlı) ve
 *     kilit istemcisi tek bağlantılıdır → önceki koşu bitmeden gelen ikinci
 *     tetik (ör. e-posta hız sınırı yüzünden 15 dk'yı aşan `emailPrograms.tick`)
 *     kilidi "alıp" aynı özet e-postalarını ikinci kez gönderiyordu. Bu yüzden
 *     DB kilidinden ÖNCE süreç içi bir koşu kümesi bakılır; bu koruma
 *     fail-open yolunda da geçerlidir.
 */
@Injectable()
export class CronLockService implements OnModuleDestroy {
  private readonly logger = new Logger(CronLockService.name);
  private client: PrismaClient | null = null;
  private disabled = false;
  /** Bu süreçte şu an koşan işler — aynı işin üst üste binmesini engeller. */
  private readonly running = new Set<string>();

  private lockClient(): PrismaClient | null {
    if (this.disabled) return null;
    if (this.client) return this.client;
    const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!url) {
      this.disabled = true;
      return null;
    }
    try {
      // connection_limit=1 → advisory lock aynı oturumda alınır ve bırakılır.
      const sep = url.includes("?") ? "&" : "?";
      this.client = new PrismaClient({
        datasources: { db: { url: `${url}${sep}connection_limit=1` } },
      });
      return this.client;
    } catch (err) {
      this.logger.warn(`cron kilidi kurulamadı, kilitsiz devam: ${String(err)}`);
      this.disabled = true;
      return null;
    }
  }

  /** 64-bit anahtar: iş adının kararlı hash'i. */
  private keyOf(name: string): bigint {
    let h = 1469598103934665603n; // FNV-1a 64
    for (const ch of Buffer.from(name, "utf8")) {
      h ^= BigInt(ch);
      h = (h * 1099511628211n) & 0xffffffffffffffffn;
    }
    // Postgres bigint imzalıdır.
    return h >= 1n << 63n ? h - (1n << 64n) : h;
  }

  /**
   * Kilidi alabilirse `fn`i koşar. Başka örnek tutuyorsa ATLAR ve false döner.
   * Aynı iş bu süreçte hâlâ koşuyorsa da ATLAR. Kilit altyapısı yoksa
   * fail-open: `fn` yine koşar.
   */
  async runExclusive(name: string, fn: () => Promise<void>): Promise<boolean> {
    if (this.running.has(name)) {
      this.logger.warn(`cron skipped (previous run still in progress): ${name}`);
      return false;
    }
    this.running.add(name);
    try {
      return await this.runWithDbLock(name, fn);
    } finally {
      this.running.delete(name);
    }
  }

  private async runWithDbLock(name: string, fn: () => Promise<void>): Promise<boolean> {
    const db = this.lockClient();
    if (!db) {
      await fn();
      return true;
    }
    const key = this.keyOf(name);
    let acquired = false;
    try {
      const rows = await db.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(${key}::bigint) AS locked`;
      acquired = rows[0]?.locked === true;
    } catch (err) {
      this.logger.warn(`cron kilidi alınamadı (${name}), kilitsiz koşuluyor: ${String(err)}`);
      await fn();
      return true;
    }
    if (!acquired) {
      this.logger.log(`cron atlandı (başka örnek koşuyor): ${name}`);
      return false;
    }
    try {
      await fn();
      return true;
    } finally {
      await db
        .$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`
        .catch((err: unknown) => this.logger.warn(`cron kilidi bırakılamadı (${name}): ${String(err)}`));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect().catch(() => undefined);
  }
}
