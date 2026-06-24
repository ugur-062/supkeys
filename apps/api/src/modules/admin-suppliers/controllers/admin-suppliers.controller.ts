import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { AdminJwtAuthGuard } from "../../admin-auth/guards/admin-jwt-auth.guard";
import { AdminChangeEmailDto } from "../dto/change-email.dto";
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

  @Post(":id/users/:userId/password-reset")
  issuePasswordReset(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.issuePasswordReset(id, userId, req.user?.sub ?? "");
  }

  @Post(":id/users/:userId/verify-email")
  forceVerifyEmail(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.forceVerifyEmail(id, userId, req.user?.sub ?? "");
  }

  @Post(":id/users/:userId/reset-2fa")
  reset2fa(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.reset2FA(id, userId, req.user?.sub ?? "");
  }

  @Patch(":id/users/:userId/email")
  changeEmail(
    @Param("id") id: string,
    @Param("userId") userId: string,
    @Body() dto: AdminChangeEmailDto,
    @Req() req: AdminAuthRequest,
  ): Promise<unknown> {
    return this.service.changeEmail(id, userId, dto.email, req.user?.sub ?? "");
  }
}
