import { randomUUID } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { reportToSentry } from "../../instrument";
import { PrismaBypassService } from "../prisma/prisma.service";
import { readAuthCookie, type Realm } from "./cookie";

/**
 * OTURUM BAZLI İPTAL (2026-10-07, canlı öncesi sağlamlaştırma H2 — sahip
 * kararı 2026-10-05: çıkışta YALNIZ o oturum sunucuda iptal edilir, öteki
 * cihazlar açık kalır).
 *
 * Önceden çıkış yalnız çerezi siliyordu; aynı JWT ömrü boyunca (kalıcı
 * oturumda 7 gün) geçerli kalıyordu — çerezi kopyalamış biri için çıkış
 * hiçbir şey değiştirmiyordu.
 *
 * MODEL: her verilen JWT bir `jti` (oturum kimliği) taşır. Kayan yenileme
 * (AuthCookieInterceptor) claim'leri kopyaladığı için jti OTURUM BOYUNCA
 * AYNI kalır — yani "oturum" = aynı jti'yi taşıyan jeton zinciri. Çıkışta jti
 * `revoked_sessions`a yazılır; üç kapı ona bakar:
 *   1. CompanyJwtStrategy / AdminJwtStrategy (her kimlikli REST isteği)
 *   2. RealtimeGateway (/rt handshake)
 *   3. AuthCookieInterceptor kayan yenilemesi — kapısız (herkese açık) uçta
 *      iptal edilmiş jetona TAZE jeton basılmasın (yoksa zincir satırın
 *      `expiresAt`'inden uzun yaşar ve temizlikten sonra dirilirdi).
 *
 * `tokenVersion` (parola değişimi = TÜM cihazlar) AYRI mekanizmadır ve aynen
 * durur. jti'siz eski jetonlar (bu sürümden önce verilmiş) iptal EDİLEMEZ ama
 * geçerli kalır; ilk kayan yenilemede jti kazanırlar.
 */

/** Yeni oturum kimliği — jeton veren HER yol bunu `jti` claim'ine koyar. */
export function newSessionId(): string {
  return randomUUID();
}

/** Satır, oturumun olası en geç jetonundan bu kadar uzun yaşar (saat kayması). */
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;
/** Ömür yapılandırması okunamazsa güvenli üst sınır. */
const FALLBACK_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
/** Pozitif önbellek üst sınırı (bellek şişmesin). */
const CACHE_MAX = 5000;

@Injectable()
export class SessionRevocationService {
  private readonly logger = new Logger(SessionRevocationService.name);
  /** Yalnız süre hesabı ve imza doğrulaması için — modül JwtService'inden bağımsız. */
  private readonly jwt = new JwtService({});
  private maxLifetimeMsCache: number | null = null;

  /**
   * YALNIZ POZİTİF önbellek (jti → satırın expiresAt'i, ms). İptal geri
   * alınamaz, o yüzden "iptal edildi" bilgisini saklamak her örnekte güvenli.
   * "İptal edilmedi" BİLEREK saklanmaz: çok örnekli koşumda A örneğinde çıkış
   * yapılınca B örneği önbellek süresi boyunca eski jetonu kabul ederdi.
   * Bedeli istek başına bir birincil-anahtar sorgusu (kullanıcı sorgusuyla
   * paralel koşar).
   */
  private readonly revokedCache = new Map<string, number>();

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly config: ConfigService,
  ) {}

  /** Bu oturum kimliği iptal edilmiş mi. jti'siz (eski) jeton → false. */
  async isRevoked(jti: unknown): Promise<boolean> {
    if (typeof jti !== "string" || jti.length === 0) return false;
    const cached = this.revokedCache.get(jti);
    if (cached !== undefined) {
      if (cached > Date.now()) return true;
      this.revokedCache.delete(jti);
    }
    const row = await this.prisma.revokedSession.findUnique({
      where: { jti },
      select: { expiresAt: true },
    });
    if (!row) return false;
    // Süresi geçmiş satır da (temizlik henüz silmediyse) İPTAL sayılır —
    // güvenli taraf; o jti'li canlı jeton zaten kalmamış olmalı.
    this.remember(jti, row.expiresAt.getTime());
    return true;
  }

  /**
   * Oturumu iptal et. `tokenExpSec` = çıkışta sunulan jetonun `exp`'i.
   *
   * Satırın ömrü yalnız SUNULAN jetonun exp'i DEĞİL: aynı jti'yi taşıyan
   * başka bir kopya (çalınmış çerez) kayan yenilemeyle daha geç bir exp almış
   * olabilir. İptal anında var olabilecek en geç exp = şimdi + azami jeton
   * ömrü; iptalden SONRA yenileme kapalı (bkz. sınıf yorumu, kapı 3), yani
   * bu sınır aşılamaz.
   */
  async revoke(jti: string, realm: Realm, tokenExpSec?: number): Promise<void> {
    const now = Date.now();
    const byLifetime = now + this.maxLifetimeMs();
    const byToken = typeof tokenExpSec === "number" ? tokenExpSec * 1000 : 0;
    const expiresAt = new Date(Math.max(byLifetime, byToken) + EXPIRY_MARGIN_MS);
    await this.prisma.revokedSession.upsert({
      where: { jti },
      create: { jti, realm, expiresAt },
      // Aynı oturum için ikinci çıkış (çift tık / iki sekme) — süre kısalmaz.
      update: {},
    });
    this.remember(jti, expiresAt.getTime());
  }

  /**
   * Ham jetondan iptal: imza + süre doğrulanır (sahte/bozuk jetonla tabloya
   * satır yazdırılamaz), realm eşleşmeli. jti yoksa (eski jeton) ya da jeton
   * geçersizse hiçbir şey yapılmaz. Dönen değer iptal edilen jti ya da null.
   */
  async revokeToken(token: string | null | undefined, realm: Realm): Promise<string | null> {
    if (!token) return null;
    let payload: { type?: unknown; jti?: unknown; exp?: unknown };
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.getOrThrow<string>("JWT_SECRET"),
      });
    } catch {
      return null; // süresi dolmuş/bozuk — iptal edilecek canlı oturum yok
    }
    if (payload.type !== realm) return null;
    if (typeof payload.jti !== "string" || payload.jti.length === 0) return null;
    await this.revoke(
      payload.jti,
      realm,
      typeof payload.exp === "number" ? payload.exp : undefined,
    );
    return payload.jti;
  }

  /**
   * Çıkış ucu için: istekteki oturum jetonunu (çerez + geçiş uyumu Bearer —
   * stratejinin okuduğu iki kaynak) iptal eder. HATA FIRLATMAZ: çıkış,
   * veritabanı erişilemese de çerezi silebilmeli; hata loglanır + Sentry'e
   * gider (sessizce yutulursa "çıkış yaptım" sanılan oturum açık kalır).
   * Dönen değer iptal edilen oturum kimlikleri.
   */
  async revokeFromRequest(req: Request, realm: Realm): Promise<string[]> {
    const header = req.headers?.authorization;
    const bearer =
      typeof header === "string" && /^Bearer /i.test(header)
        ? header.replace(/^Bearer /i, "").trim()
        : null;
    const revoked: string[] = [];
    for (const token of new Set([readAuthCookie(req, realm), bearer])) {
      try {
        const jti = await this.revokeToken(token, realm);
        if (jti) revoked.push(jti);
      } catch (err) {
        const message = `Session revocation could not be written (${realm}) - cookie cleared but the token stays valid until it expires: ${
          err instanceof Error ? err.message : String(err)
        }`;
        this.logger.error(message);
        reportToSentry(message, "error", { tags: { where: "session-revocation.logout", realm } });
      }
    }
    return revoked;
  }

  /** Süresi geçmiş satırları sil (gece temizliği). Silinen satır sayısı. */
  async purgeExpired(now: Date = new Date()): Promise<number> {
    const { count } = await this.prisma.revokedSession.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    for (const [jti, exp] of this.revokedCache) {
      if (exp <= now.getTime()) this.revokedCache.delete(jti);
    }
    return count;
  }

  private remember(jti: string, expiresAtMs: number): void {
    if (this.revokedCache.size >= CACHE_MAX) {
      // En eski girdiyi at (Map ekleme sırasını korur). Atılan jti için
      // sonraki istek veritabanına düşer — doğruluk etkilenmez.
      const oldest = this.revokedCache.keys().next().value;
      if (oldest !== undefined) this.revokedCache.delete(oldest);
    }
    this.revokedCache.set(jti, expiresAtMs);
  }

  /**
   * Bir jetonun alabileceği en uzun ömür: kalıcı ("oturumu açık bırak") ve
   * oturum çerezi sürelerinin büyüğü. Süre dizgileri ("7d", "1h") elle
   * ayrıştırılmaz — imzalayanla AYNI kütüphaneye imzalatılıp exp−iat okunur,
   * böylece iki yorum ayrışamaz.
   */
  private maxLifetimeMs(): number {
    if (this.maxLifetimeMsCache !== null) return this.maxLifetimeMsCache;
    const spans = [
      this.config.get<string>("JWT_PERSISTENT_EXPIRES_IN", "7d"),
      this.config.get<string>("JWT_EXPIRES_IN", "1h"),
    ];
    let max = 0;
    for (const span of spans) {
      try {
        const probe = this.jwt.sign({}, { secret: "lifetime-probe", expiresIn: span });
        const { iat, exp } = this.jwt.decode(probe) as { iat?: number; exp?: number };
        if (typeof iat === "number" && typeof exp === "number") {
          max = Math.max(max, (exp - iat) * 1000);
        } else {
          max = Math.max(max, FALLBACK_LIFETIME_MS);
        }
      } catch {
        max = Math.max(max, FALLBACK_LIFETIME_MS);
      }
    }
    this.maxLifetimeMsCache = max > 0 ? max : FALLBACK_LIFETIME_MS;
    return this.maxLifetimeMsCache;
  }
}
