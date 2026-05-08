import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CreateAddressDto } from "../dto/create-address.dto";
import { ListAddressesDto } from "../dto/list-addresses.dto";
import { UpdateAddressDto } from "../dto/update-address.dto";
import { TenantAddressesService } from "../services/tenant-addresses.service";

@Controller("tenants/me/addresses")
@UseGuards(JwtAuthGuard)
export class TenantAddressesController {
  constructor(private readonly service: TenantAddressesService) {}

  @Get()
  list(
    @Query() query: ListAddressesDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(user.tenantId, query);
  }

  @Get(":id")
  getOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.getOne(user.tenantId, id);
  }

  // Yazma — COMPANY_ADMIN only
  @Post()
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateAddressDto,
  ): Promise<unknown> {
    return this.service.create(user.tenantId, dto);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateAddressDto,
  ): Promise<unknown> {
    return this.service.update(user.tenantId, id, dto);
  }

  @Post(":id/set-default")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.setDefault(user.tenantId, id);
  }

  @Delete(":id")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.remove(user.tenantId, id);
  }
}
