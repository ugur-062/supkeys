import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  Post,
  Query,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { CreateSupplierApplicationDto } from "../dto/create-supplier-application.dto";
import { SupplierRegistrationService } from "../services/supplier-registration.service";

@Controller("registration/supplier")
export class SupplierRegistrationController {
  constructor(private readonly service: SupplierRegistrationService) {}

  // Security audit O-1 — abuse protection: dakikada 5 başvuru/IP
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post("applications")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateSupplierApplicationDto,
    @Query("invitation") invitationToken: string | undefined,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
    @Query("connect") connectTenantSlug?: string,
  ) {
    return this.service.create(
      dto,
      invitationToken,
      ip,
      userAgent,
      connectTenantSlug,
    );
  }

  @Get("applications/:id/status")
  status(@Param("id") id: string) {
    return this.service.getStatus(id);
  }

  @Get("invitation-info")
  invitationInfo(@Query("token") token?: string) {
    if (!token) throw new BadRequestException("Token gerekli");
    return this.service.getInvitationInfo(token);
  }
}
