import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../../common/decorators/current-admin.decorator";
import { AdminJwtAuthGuard } from "../../admin-auth/guards/admin-jwt-auth.guard";
import { ListApplicationsDto } from "../dto/list-applications.dto";
import { RejectApplicationDto } from "../dto/reject-application.dto";
import { AdminSupplierApplicationsService } from "../services/admin-supplier-applications.service";

@Controller("admin/supplier-applications")
@UseGuards(AdminJwtAuthGuard)
export class AdminSupplierApplicationsController {
  constructor(
    private readonly service: AdminSupplierApplicationsService,
  ) {}

  @Get()
  list(@Query() query: ListApplicationsDto): Promise<unknown> {
    return this.service.list(query);
  }

  @Get("stats")
  stats(): Promise<unknown> {
    return this.service.stats();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<unknown> {
    return this.service.findOne(id);
  }

  @Post(":id/approve")
  @HttpCode(HttpStatus.OK)
  approve(
    @Param("id") id: string,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<unknown> {
    return this.service.approve(id, admin.id);
  }

  @Post(":id/reject")
  @HttpCode(HttpStatus.OK)
  reject(
    @Param("id") id: string,
    @Body() dto: RejectApplicationDto,
    @CurrentAdmin() admin: AuthenticatedAdmin,
  ): Promise<unknown> {
    return this.service.reject(id, admin.id, dto);
  }
}
