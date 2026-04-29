import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./common/prisma/prisma.module";
import { AdminAuthModule } from "./modules/admin-auth/admin-auth.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ["../../.env"],
    }),
    PrismaModule,
    AuthModule,
    AdminAuthModule,
    HealthModule,
  ],
})
export class AppModule {}
