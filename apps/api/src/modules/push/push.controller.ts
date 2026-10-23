import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import {
  RegisterPushDeviceDto,
  UnregisterPushDeviceDto,
} from "./dto/push-device.dto";
import { PushDeviceService } from "./push-device.service";

/**
 * Push device registration of the mobile app (the web page inside the
 * Capacitor shell calls these). The person's OWN device: no company
 * permission applies (allowlisted in the permission drift spec).
 */
@Controller("company-auth/push-devices")
export class PushDeviceController {
  constructor(private readonly devices: PushDeviceService) {}

  /**
   * Binds the token to the signed-in user and to this session's version
   * (upsert by token). Only FCM-shaped tokens are accepted (DTO).
   */
  @Post()
  @Throttle({ auth: { limit: 20, ttl: 60_000 } })
  @UseGuards(CompanyJwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  register(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: RegisterPushDeviceDto,
  ) {
    return this.devices.register(user, dto.token, dto.platform);
  }

  /**
   * Forgets the token. No guard on purpose: sign-out calls it, also after the
   * session expired. Knowing the token is the only credential; the answer is
   * the same whether a row existed or not.
   */
  @Post("unregister")
  @Throttle({ auth: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  unregister(@Body() dto: UnregisterPushDeviceDto) {
    return this.devices.unregister(dto.token);
  }
}
