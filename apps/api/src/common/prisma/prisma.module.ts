import { Global, Module } from "@nestjs/common";
import {
  PrismaService,
  createInjectablePrisma,
} from "./prisma.service";

@Global()
@Module({
  // RLS Faz 1c: PrismaService token'ı useFactory ile sağlanır. RLS_ENABLED
  // kapalıyken çıplak instance (bugünle birebir); açıkken RLS extension'lı
  // client enjekte edilir (çağrı-yeri değişmez). bkz. prisma.service.ts.
  providers: [
    { provide: PrismaService, useFactory: () => createInjectablePrisma() },
  ],
  exports: [PrismaService],
})
export class PrismaModule {}
