import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminInterventionsService } from "./admin-interventions.service";
import { AdminCancelDto } from "./dto/cancel.dto";

interface AdminAuthRequest extends Request {
  user?: { sub: string; type: string };
}

@Controller("admin")
@UseGuards(AdminJwtAuthGuard)
export class AdminInterventionsController {
  constructor(private readonly service: AdminInterventionsService) {}

  @Post("tenders/:id/cancel")
  cancelTender(
    @Param("id") id: string,
    @Body() dto: AdminCancelDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.cancelTender(id, dto.reason, req.user?.sub ?? "");
  }

  @Post("orders/:id/cancel")
  cancelOrder(
    @Param("id") id: string,
    @Body() dto: AdminCancelDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.cancelOrder(id, dto.reason, req.user?.sub ?? "");
  }
}
