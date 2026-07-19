import { Global, Module } from "@nestjs/common";
import {
  PrismaService,
  PrismaBypassService,
  createInjectablePrisma,
} from "./prisma.service";

@Global()
@Module({
  // RLS Faz 1c: PrismaService token'ı useFactory ile sağlanır. RLS_ENABLED
  // kapalıyken çıplak instance (bugünle birebir); açıkken RLS extension'lı
  // client enjekte edilir (çağrı-yeri değişmez). bkz. prisma.service.ts.
  // RLS Faz 1d: PrismaBypassService — RLS extension'sız client (cross-tenant/
  // bağlamsız erişim: admin/auth/cron). Faz 2'de ilgili servislere enjekte
  // edilir; şu an inert altyapı (kimse enjekte etmiyor).
  providers: [
    { provide: PrismaService, useFactory: () => createInjectablePrisma() },
    PrismaBypassService,
  ],
  exports: [PrismaService, PrismaBypassService],
})
export class PrismaModule {}
