import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminJwtAuthGuard } from "../admin-auth/guards/admin-jwt-auth.guard";
import { AdminConnectionsService } from "./admin-connections.service";
import {
  ListConnectionsDto,
  UpdateConnectionDto,
} from "./dto/admin-connections.dto";

interface AdminAuthRequest extends Request {
  user?: { sub: string; type: string };
}

@Controller("admin/connections")
@UseGuards(AdminJwtAuthGuard)
export class AdminConnectionsController {
  constructor(private readonly service: AdminConnectionsService) {}

  @Get()
  list(@Query() query: ListConnectionsDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateConnectionDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.updateStatus(id, dto, req.user?.sub ?? "");
  }

  @Delete(":id")
  remove(
    @Param("id") id: string,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.remove(id, req.user?.sub ?? "");
  }
}
