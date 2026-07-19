import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@rothern/db";
import { createRlsExtension, isRlsEnabled } from "./rls-extension";

/**
 * DI token + type (servisler bunu enjekte eder). Yaşam-döngülü PrismaClient.
 * NOT: modül bunu useFactory (`createInjectablePrisma`) ile sağlar; RLS AÇIKken
 * enjekte edilen değer bu sınıfın DÜZ instance'ı DEĞİL, extension'lı client'tır.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/**
 * BYPASS client (INV-MT-5 Faz 1d) — RLS extension'ı ASLA uygulanmaz. Cross-tenant
 * / bağlamsız erişimler için: admin realm (tüm firmaları okur), auth pre-context
 * (jwt-validate/login — firma bağlamından ÖNCE companyUser'ı cross-tenant bulur),
 * cron/sistem işleri (bağlam yok). Faz 2+ prod'da `DATABASE_URL_BYPASS` OWNER/
 * BYPASSRLS rolüne bağlanır → RLS'i YAPISAL bypass eder (ana client kısıtlı role
 * geçince). Env verilmezse ana `DATABASE_URL` (bugün owner) → BİREBİR aynı davranış.
 *
 * Wiring (admin/auth/cron servislerine enjeksiyon) Faz 2'de yapılır — orada
 * kısıtlı rol + policy'lerle bypass GERÇEKTEN test edilebilir; bugün (flag OFF,
 * policy yok) inert altyapı.
 */
@Injectable()
export class PrismaBypassService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const url = process.env.DATABASE_URL_BYPASS;
    super(url ? { datasources: { db: { url } } } : undefined);
  }
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}

/**
 * DI değeri üretir (INV-MT-5 Faz 1c wiring).
 *
 * - `RLS_ENABLED !== "true"` → ÇIPLAK `PrismaService` instance'ı döner —
 *   bugünle BİREBİR (eskiden `providers: [PrismaService]` de aynı `new
 *   PrismaService()`'i üretiyordu). Sıfır davranış farkı.
 * - AÇIK → `base.$extends(RLS extension)` client'ı + üstüne base'in
 *   `$connect`/`$disconnect`'ine bağlı `onModuleInit`/`onModuleDestroy`
 *   iliştirilir. Extended client DOĞRUDAN enjekte edilir → çağrı-yeri
 *   (`this.prisma.company.x`) HİÇ değişmeden RLS extension devrede (Proxy YOK).
 *   base ile extended AYNI engine/bağlantıyı paylaşır → base.$connect yeterli.
 */
export function createInjectablePrisma(
  env: NodeJS.ProcessEnv = process.env,
): PrismaService {
  const base = new PrismaService();
  if (!isRlsEnabled(env)) return base;

  const extended = base.$extends(createRlsExtension()) as unknown as Record<
    string,
    unknown
  >;
  // Nest yaşam-döngüsü hook'larını extended client'a iliştir (base bağlantısını
  // yönetir). Assign tutmazsa Prisma zaten ilk sorguda lazy-connect eder.
  extended.onModuleInit = () => base.$connect();
  extended.onModuleDestroy = () => base.$disconnect();
  return extended as unknown as PrismaService;
}
