import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { Roles } from "../../../common/decorators/roles.decorator";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ChangePasswordDto } from "../dto/change-password.dto";
import { InviteUserDto } from "../dto/invite-user.dto";
import { UpdateNotificationPrefsDto } from "../dto/notification-prefs.dto";
import { UpdateUserDto } from "../dto/update-user.dto";
import { TenantUsersService } from "../services/tenant-users.service";

@Controller("tenants/me/users")
@UseGuards(JwtAuthGuard)
export class TenantUsersController {
  constructor(private readonly service: TenantUsersService) {}

  // ---------- READ ----------

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.list(user.tenantId);
  }

  @Get("me")
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.getMe(user.id);
  }

  // ---------- WRITE — SELF ----------

  @Patch("me")
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateUserDto,
  ): Promise<unknown> {
    // Self-update'te sadece kişisel bilgiler değiştirilebilir
    const safe: UpdateUserDto = {
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
    };
    return this.service.update(user.tenantId, user.id, user.id, safe);
  }

  // Security audit O-1 — sensitive endpoint, dakikada 5 deneme
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("change-password")
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<unknown> {
    return this.service.changePassword(user.id, dto);
  }

  @Patch("me/notification-prefs")
  updateNotificationPrefs(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateNotificationPrefsDto,
  ): Promise<unknown> {
    return this.service.updateNotificationPrefs(user.id, dto);
  }

  // ---------- WRITE — COMPANY_ADMIN ----------

  @Get("invitations")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  listInvitations(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.listInvitations(user.tenantId);
  }

  @Post("invite")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteUserDto,
  ): Promise<unknown> {
    return this.service.invite(user.tenantId, user.id, dto);
  }

  @Delete("invitations/:id")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  cancelInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.cancelInvitation(user.tenantId, id);
  }

  @Post("invitations/:id/resend")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  resendInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.resendInvitation(user.tenantId, id);
  }

  @Get(":id")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.service.findById(user.tenantId, id);
  }

  @Patch(":id")
  @UseGuards(RolesGuard)
  @Roles("COMPANY_ADMIN")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<unknown> {
    return this.service.update(user.tenantId, id, user.id, dto);
  }
}
