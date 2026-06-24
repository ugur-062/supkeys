import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminJwtAuthGuard } from "../../admin-auth/guards/admin-jwt-auth.guard";
import { ListAdminSuppliersDto } from "../dto/list-suppliers.dto";
import {
  AdminUpdateSupplierUserDto,
  UpdateSupplierDto,
} from "../dto/update-supplier.dto";
import { AdminSuppliersService } from "../services/admin-suppliers.service";

interface AdminAuthRequest extends Request {
  user?: { sub: string; type: string };
}

@Controller("admin/suppliers")
@UseGuards(AdminJwtAuthGuard)
export class AdminSuppliersController {
  constructor(private readonly service: AdminSuppliersService) {}

  @Get()
  list(@Query() query: ListAdminSuppliersDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Get(":id")
  getOne(@Param("id") id: string): Promise<unknown> {
    return this.service.getOne(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateSupplierDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.update(id, dto, req.user?.sub ?? "");
  }

  @Patch(":id/users/:userId")
  updateUser(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() dto: AdminUpdateSupplierUserDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.updateUser(id, userId, dto, req.user?.sub ?? "");
  }
}
