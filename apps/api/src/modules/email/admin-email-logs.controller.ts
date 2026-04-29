import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminEmailLogsService } from "./admin-email-logs.service";
import { ListEmailLogsDto } from "./dto/list-email-logs.dto";

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
}
