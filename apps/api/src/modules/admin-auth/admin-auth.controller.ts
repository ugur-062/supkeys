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
  CurrentAdmin,
  type AuthenticatedAdmin,
} from "../../common/decorators/current-admin.decorator";
import { AdminAuthService } from "./admin-auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";

@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: AdminLoginDto) {
    return this.adminAuthService.login(dto);
  }

  @Get("me")
  @UseGuards(AdminJwtAuthGuard)
  me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return admin;
  }
}
