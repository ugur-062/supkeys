import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  AuthenticatedSupplierUser,
  CurrentSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { ChangeSupplierPasswordDto } from "../dto/change-password.dto";
import { UpdateSupplierNotificationPrefsDto } from "../dto/notification-prefs.dto";
import { UpdateAccountDto } from "../dto/update-account.dto";
import { SupplierAccountService } from "../services/supplier-account.service";

@UseGuards(SupplierJwtAuthGuard)
@Controller("supplier-account")
export class SupplierAccountController {
  constructor(private readonly service: SupplierAccountService) {}

  @Patch("me")
  updateAccount(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.service.updateAccount(user.supplierUserId, dto);
  }

  @Post("me/change-password")
  changePassword(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: ChangeSupplierPasswordDto,
  ) {
    return this.service.changePassword(user.supplierUserId, dto);
  }

  @Get("me/notification-prefs")
  getNotificationPrefs(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ) {
    return this.service.getNotificationPrefs(user.supplierUserId);
  }

  @Patch("me/notification-prefs")
  updateNotificationPrefs(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: UpdateSupplierNotificationPrefsDto,
  ) {
    return this.service.updateNotificationPrefs(user.supplierUserId, dto.prefs);
  }
}
