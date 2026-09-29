/**
 * E-POSTA GÖNDERİM KISICI — süreç içi (derin denetim 2026-09-29 Y-08).
 *
 * Sorun: BullMQ kaldırıldıktan sonra toplu bildirimler (davet, kapanış,
 * kategori eşleşmesi ≤300 alıcı, yönetici duyurusu ≤5000 firma) her alıcı için
 * `void email.send(...)` ile AYNI ANDA başlıyordu. Resend hesabı saniyede
 * birkaç istek kabul eder ve SDK 429'da yeniden denemez → fazlası FAILED
 * damgalanıp bir daha gönderilmiyordu; her gönderim 3-4 DB sorgusu da açtığı
 * için küçük havuz P2024'e düşebiliyordu.
 *
 * Çözüm (iki katman, ikisi de bu sınıfta):
 *  1. EŞZAMANLILIK: aynı anda en fazla `maxConcurrent` gönderim hattı (DB
 *     sorguları + render + sağlayıcı çağrısı) koşar; kalanı ÖNCELİK sırasına
 *     göre bekler: `high` (işlem e-postası: kod, şifre, sipariş) → `normal`
 *     (bildirim/davet) → `bulk` (yönetici duyurusu). Böylece 5000'lik duyuru
 *     kuyruğu doğrulama kodunu ya da tedarikçi davetini arkasında bekletmez.
 *  2. HIZ: sağlayıcıya giden HER istek (yeniden denemeler dahil) jeton kovası
 *     üzerinden geçer — saniyede `ratePerSec` istek, en fazla `ratePerSec`
 *     patlama.
 *
 * Tek süreç varsayımı: API tek örnek (render.yaml). Örnek sayısı artarsa hesap
 * limiti örneklere bölünmelidir (`EMAIL_SEND_RATE_PER_SEC`).
 */
export type EmailSendPriority = "high" | "normal" | "bulk";

const PRIORITY_ORDER: readonly EmailSendPriority[] = ["high", "normal", "bulk"];

export interface EmailSendThrottleOptions {
  ratePerSec: number;
  maxConcurrent: number;
  /** Test kancası — gerçek saat yerine. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) =>
  new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    (t as { unref?: () => void }).unref?.();
  });

export class EmailSendThrottle {
  private readonly ratePerSec: number;
  private readonly capacity: number;
  private readonly maxConcurrent: number;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  private active = 0;
  private readonly waiting: Record<EmailSendPriority, Array<() => void>> = {
    high: [],
    normal: [],
    bulk: [],
  };

  private tokens: number;
  private lastRefill: number;
  /** Jeton bekleyenler sırayla uyansın diye zincir (FIFO). */
  private tokenChain: Promise<void> = Promise.resolve();

  constructor(opts: EmailSendThrottleOptions) {
    this.ratePerSec = opts.ratePerSec > 0 ? opts.ratePerSec : 2;
    this.capacity = Math.max(1, Math.floor(this.ratePerSec));
    this.maxConcurrent = Math.max(1, Math.floor(opts.maxConcurrent));
    this.now = opts.now ?? Date.now;
    this.sleep = opts.sleep ?? realSleep;
    this.tokens = this.capacity;
    this.lastRefill = this.now();
  }

  /** Bekleyen (henüz hat almamış) gönderim sayısı — log/test için. */
  get pending(): number {
    return PRIORITY_ORDER.reduce((n, p) => n + this.waiting[p].length, 0);
  }

  get running(): number {
    return this.active;
  }

  /** Yeniden deneme beklemesi — testte enjekte edilen uyku ile. */
  wait(ms: number): Promise<void> {
    return this.sleep(ms);
  }

  /** `fn`'i bir eşzamanlılık hattında koşturur (öncelik sırasıyla). */
  async run<T>(priority: EmailSendPriority, fn: () => Promise<T>): Promise<T> {
    await this.acquireSlot(priority);
    try {
      return await fn();
    } finally {
      this.releaseSlot();
    }
  }

  /** Sağlayıcıya bir istek atmadan önce çağrılır — jeton yoksa bekler. */
  acquireToken(): Promise<void> {
    const next = this.tokenChain.then(() => this.takeToken());
    // Zincir bir hata yüzünden kırılmasın.
    this.tokenChain = next.catch(() => undefined);
    return next;
  }

  private async takeToken(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = Math.ceil(((1 - this.tokens) * 1000) / this.ratePerSec);
      await this.sleep(Math.max(1, waitMs));
    }
  }

  private refill() {
    const t = this.now();
    const elapsed = t - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(
        this.capacity,
        this.tokens + (elapsed * this.ratePerSec) / 1000,
      );
      this.lastRefill = t;
    }
  }

  private acquireSlot(priority: EmailSendPriority): Promise<void> {
    if (this.active < this.maxConcurrent && this.pending === 0) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.waiting[priority].push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private releaseSlot() {
    this.active--;
    for (const p of PRIORITY_ORDER) {
      const next = this.waiting[p].shift();
      if (next) {
        next();
        return;
      }
    }
  }
}

/**
 * Sağlayıcı hatası yeniden denenmeli mi? Yalnız isteğin GİTMEDİĞİ ya da
 * sağlayıcının geçici olarak reddettiği durumlar: 429 (`rate_limit_exceeded`)
 * ve 5xx (`application_error` / `internal_server_error` — SDK ağ hatasını da
 * `application_error` olarak döndürür). Zaman aşımı DENENMEZ: istek sağlayıcıya
 * ulaşıp kabul edilmiş olabilir → çift e-posta riski. 4xx (adres/parametre
 * hatası) kalıcıdır.
 *
 * `ResendProvider` hatayı `[resend] <name>: <message>` biçiminde fırlatır
 * (packages/email/src/providers/resend.ts).
 */
export function isRetryableEmailError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\[resend\] (rate_limit_exceeded|application_error|internal_server_error)\b/.test(
    msg,
  );
}

/** Deneme `attempt` (1'den) başarısız olduktan sonra beklenecek süre. */
export function retryDelayMs(attempt: number, random: () => number = Math.random): number {
  const base = 1000 * 2 ** (attempt - 1); // 1 sn, 2 sn, …
  return base + Math.floor(random() * 250);
}
