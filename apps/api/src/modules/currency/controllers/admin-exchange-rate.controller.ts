import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../../admin-auth/guards/admin-jwt-auth.guard";
import { ExchangeRateService } from "../services/exchange-rate.service";

/**
 * Admin manuel TCMB refresh — UI yok V2-3'te, curl/operasyon için.
 */
@Controller("admin/exchange-rates")
@UseGuards(AdminJwtAuthGuard)
export class AdminExchangeRateController {
  constructor(private readonly service: ExchangeRateService) {}

  @Post("refresh-now")
  @HttpCode(200)
  async refreshNow() {
    return this.service.refreshFromTcmb();
  }
}
