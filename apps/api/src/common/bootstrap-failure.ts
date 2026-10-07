import { writeSync } from "node:fs";
import { Logger } from "@nestjs/common";

/**
 * AÇILIŞ HATASI HER ZAMAN GÖRÜNÜR (canlı öncesi sağlamlaştırma, 2026-10-07).
 *
 * KÖK NEDEN: `NestFactory.create(..., { bufferLogs: true })` Nest Logger'ını
 * TAMPONA alır; tampon ancak `app.listen()` içindeki init'te boşalır. Açılış
 * ondan ÖNCE düşerse (R2/Resend yapılandırması eksik, JWT_SECRET kısa,
 * `assertProd*` kapıları…) `new Logger().error(...)` satırı da tampona girer ve
 * `process.exit(1)` onu hiç yazmadan süreci bitirir. Ölçüldü: dört ayrı hatalı
 * yapılandırmada süreç yalnız dotenv satırlarını basıp 1 ile çıktı; Render'da
 * deploy kırmızı, günlükte SEBEP YOK.
 *
 * Sıra bilinçli:
 *  1. Sebep EŞZAMANLI olarak stderr'e yazılır (fd 2, `writeSync`) — Logger'a,
 *     Pino taşıyıcısına (dev'de worker thread) ya da olay döngüsüne bağlı
 *     değildir; hemen ardından `process.exit` gelse de kaybolmaz.
 *  2. Tamponlanmış Nest satırları boşaltılır (hangi modülün yüklendiği teşhis
 *     için değerlidir). Boşaltma düşerse sebep zaten yazılmıştır.
 */

export const BOOTSTRAP_FAILURE_PREFIX = "[Bootstrap] Application failed to start:";

export function formatBootstrapFailure(err: unknown): string {
  const reason = err instanceof Error ? (err.stack ?? err.message) : String(err);
  return `${BOOTSTRAP_FAILURE_PREFIX} ${reason}\n`;
}

export interface BootstrapFailureIo {
  /** Eşzamanlı stderr yazımı. */
  writeStderr: (text: string) => void;
  /** Tamponlanmış Nest günlüklerini boşaltır. */
  flushLogs: () => void;
}

const defaultIo: BootstrapFailureIo = {
  writeStderr: (text) => {
    try {
      writeSync(2, text);
    } catch {
      // Bloklamayan boruda EAGAIN vb. — son çare (yine stderr).
      console.error(text);
    }
  },
  flushLogs: () => Logger.flush(),
};

/** Açılış hatasının sebebini kaybolmayacak biçimde yazar. ASLA fırlatmaz. */
export function reportBootstrapFailure(err: unknown, io: BootstrapFailureIo = defaultIo): void {
  try {
    io.writeStderr(formatBootstrapFailure(err));
  } catch {
    // yazılamıyorsa yapacak bir şey yok — çıkış kodu yine 1 olacak
  }
  try {
    io.flushLogs();
  } catch {
    // sebep yukarıda yazıldı
  }
}
