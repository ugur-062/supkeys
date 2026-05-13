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
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import {
  PermissionsGuard,
  RequirePermissions,
} from "../../auth/permissions/permissions.guard";
import {
  BatchInvitationsDto,
  PreviewInvitationDto,
} from "../dto/batch-invitations.dto";
import { CreateInvitationDto } from "../dto/create-invitation.dto";
import { ListInvitationsDto } from "../dto/list-invitations.dto";
import { SupplierInvitationsService } from "../services/supplier-invitations.service";

@Controller("tenants/me/supplier-invitations")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplierInvitationsController {
  constructor(
    private readonly service: SupplierInvitationsService,
  ) {}

  @Post()
  @RequirePermissions("settings:suppliers")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.create(user.tenantId, user.id, dto);
  }

  @Post("batch")
  @RequirePermissions("settings:suppliers")
  @HttpCode(HttpStatus.OK)
  batch(
    @Body() dto: BatchInvitationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.batch(user.tenantId, user.id, dto);
  }

  @Post("preview")
  @RequirePermissions("settings:suppliers")
  @HttpCode(HttpStatus.OK)
  preview(
    @Body() dto: PreviewInvitationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.previewInvitationEmail(user.tenantId, user.id, dto);
  }

  @Get()
  @RequirePermissions("settings:suppliers")
  list(
    @Query() query: ListInvitationsDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.list(user.tenantId, query);
  }

  @Get(":id")
  @RequirePermissions("settings:suppliers")
  findOne(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.findOne(user.tenantId, id);
  }

  @Post(":id/resend")
  @RequirePermissions("settings:suppliers")
  @HttpCode(HttpStatus.OK)
  resend(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.resend(user.tenantId, id);
  }

  @Post(":id/cancel")
  @RequirePermissions("settings:suppliers")
  @HttpCode(HttpStatus.OK)
  cancel(
    @Param("id") id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<unknown> {
    return this.service.cancel(user.tenantId, id);
  }
}
