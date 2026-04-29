import { Controller, Get } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    let dbStatus = "down";
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = "up";
    } catch {
      dbStatus = "down";
    }

    return {
      status: "ok",
      service: "supkeys-api",
      timestamp: new Date().toISOString(),
      checks: {
        database: dbStatus,
      },
    };
  }
}
