import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminEmailLogsService } from "./admin-email-logs.service";
import { ListEmailLogsDto } from "./dto/list-email-logs.dto";

interface AdminAuthRequest extends Request {
  user?: { sub: string; type: string };
}

@Controller("admin/email-logs")
@UseGuards(AdminJwtAuthGuard)
export class AdminEmailLogsController {
  constructor(private readonly service: AdminEmailLogsService) {}

  @Get()
  async list(@Query() query: ListEmailLogsDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Get(":id")
  async findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }

  @Post(":id/resend")
  @HttpCode(HttpStatus.OK)
  async resend(
    @Param("id") id: string,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.resend(id, req.user?.sub ?? "");
  }
}
