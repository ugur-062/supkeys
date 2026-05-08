import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AdminJwtAuthGuard } from "../../admin-auth/guards/admin-jwt-auth.guard";
import { ListAdminTenantsDto } from "../dto/list-tenants.dto";
import { AdminTenantsService } from "../services/admin-tenants.service";

@Controller("admin/tenants")
@UseGuards(AdminJwtAuthGuard)
export class AdminTenantsController {
  constructor(private readonly service: AdminTenantsService) {}

  @Get()
  list(@Query() query: ListAdminTenantsDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Get(":id")
  getOne(@Param("id") id: string): Promise<unknown> {
    return this.service.getOne(id);
  }
}
