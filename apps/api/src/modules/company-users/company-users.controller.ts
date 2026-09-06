import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { COMPANY_PERMISSION_GROUP_LABELS, VIEWER_PRESET } from "@rothern/shared";
import {
  COMPANY_PERMISSION_CATALOG,
  COMPANY_ROLE_PRESETS,
  COMPANY_ROLE_PERMISSIONS,
} from "../company-auth/permissions/company-permissions.constants";
import { CompanyUsersService } from "./company-users.service";
import {
  InviteCompanyUserDto,
  SeatSelectionDto,
  SetUserActiveDto,
  UpdateUserDto,
  UpdateUserPermissionsDto,
  SetUserPermissionsDto,
  UpdateUserRolesDto,
} from "./dto/company-user.dto";

@Controller("company/users")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyUsersController {
  constructor(private readonly service: CompanyUsersService) {}

  @Get()
  @RequireCompanyPermission("users:manage")
  list(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.list(user.companyId);
  }

  /** Faz K — koltuk kullanımı: { limit, used, pendingSeatInvites, overflow }. */
  @Get("seats")
  @RequireCompanyPermission("users:manage")
  seats(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.seatUsage(user.companyId);
  }

  /** Faz K — kurucu koltuk seçimi (aşkın durumda kalacakları belirler). */
  @Post("seat-selection")
  @RequireCompanyPermission("users:manage")
  seatSelection(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: SeatSelectionDto,
  ) {
    return this.service.applySeatSelection(user, dto.keep ?? dto.keepUserIds ?? []);
  }

  /**
   * Yetki tablosu kataloğu (Faz 4): gruplu satırlar (koltuk işareti, "yalnız
   * Kurucu verir" bayrağı), grup etiketleri, hazır setler (rol çipleri +
   * Görüntüleyici). `roleDefaults` eski istemci için aynen.
   */
  @Get("permission-catalog")
  @RequireCompanyPermission("users:manage")
  permissionCatalog() {
    return {
      catalog: COMPANY_PERMISSION_CATALOG,
      groups: COMPANY_PERMISSION_GROUP_LABELS,
      presets: {
        SATIN_ALMACI: COMPANY_ROLE_PRESETS.SATIN_ALMACI,
        SATISCI: COMPANY_ROLE_PRESETS.SATISCI,
        ONAYLAYICI: COMPANY_ROLE_PRESETS.ONAYLAYICI,
        YONETICI: COMPANY_ROLE_PRESETS.YONETICI,
        GORUNTULEYICI: VIEWER_PRESET,
      },
      roleDefaults: COMPANY_ROLE_PERMISSIONS,
    };
  }

  @Post()
  @RequireCompanyPermission("users:manage")
  // E-posta bomba amplifikasyonuna karşı sınır (kimlikli manager da spam atmasın).
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  invite(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: InviteCompanyUserDto,
  ) {
    return this.service.invite(user, dto);
  }

  /** Bekleyen davetler (iptal/yeniden gönder aksiyonlarıyla). */
  @Get("invitations")
  @RequireCompanyPermission("users:manage")
  listInvitations(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listInvitations(user.companyId);
  }

  @Delete("invitations/:id")
  @RequireCompanyPermission("users:manage")
  cancelInvitation(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.cancelInvitation(user, id);
  }

  @Post("invitations/:id/resend")
  @RequireCompanyPermission("users:manage")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  resendInvitation(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.resendInvitation(user, id);
  }

  @Patch(":id/roles")
  @RequireCompanyPermission("users:manage")
  updateRoles(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpdateUserRolesDto,
  ) {
    return this.service.updateRoles(user, id, dto);
  }

  @Patch(":id")
  @RequireCompanyPermission("users:manage")
  updateUser(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.updateUser(user, id, dto);
  }

  @Patch(":id/active")
  @RequireCompanyPermission("users:manage")
  setActive(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: SetUserActiveDto,
  ) {
    return this.service.setActive(user, id, dto.active);
  }

  /** ESKİ: rol setine göre +/- fark (yalnız Kurucu). Yeni istemci PUT kullanır. */
  @Patch(":id/permissions")
  @RequireCompanyPermission("users:manage")
  updatePermissions(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UpdateUserPermissionsDto,
  ) {
    return this.service.updatePermissions(user, id, dto);
  }

  /**
   * Yetki tablosu (Faz 4): kişinin izin listesini OLDUĞU GİBİ yazar. Kurallar
   * serviste: kendi satırı yok (Kurucu hariç), "Kullanıcı ve yetki" tikini
   * yalnız Kurucu verir, koltuk kapısı, son yetki sahibi koruması, denetim
   * kaydı + kişiye bildirim.
   */
  @Put(":id/permissions")
  @RequireCompanyPermission("users:manage")
  setPermissions(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: SetUserPermissionsDto,
  ) {
    return this.service.setPermissions(user, id, dto.permissions);
  }

  @Delete(":id")
  @RequireCompanyPermission("users:manage")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user, id);
  }
}
