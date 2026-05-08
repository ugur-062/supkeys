import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../../admin-auth/guards/admin-jwt-auth.guard";
import { ListAdminSuppliersDto } from "../dto/list-suppliers.dto";
import { AdminSuppliersService } from "../services/admin-suppliers.service";

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
}
