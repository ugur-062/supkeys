import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../decorators/current-supplier-user.decorator";
import { SupplierLoginDto } from "../dto/supplier-login.dto";
import { SupplierJwtAuthGuard } from "../guards/supplier-jwt-auth.guard";
import { SupplierAuthService } from "../services/supplier-auth.service";

@Controller("supplier-auth")
export class SupplierAuthController {
  constructor(private readonly service: SupplierAuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: SupplierLoginDto) {
    return this.service.login(dto);
  }

  @Get("me")
  @UseGuards(SupplierJwtAuthGuard)
  me(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.getMe(user.supplierUserId);
  }
}
