import {
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
import { CreateSupplierApplicationDto } from "../dto/create-supplier-application.dto";
import { SupplierRegistrationService } from "../services/supplier-registration.service";

@Controller("registration/supplier")
export class SupplierRegistrationController {
  constructor(private readonly service: SupplierRegistrationService) {}

  @Post("applications")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateSupplierApplicationDto,
    @Query("invitation") invitationToken: string | undefined,
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.service.create(dto, invitationToken, ip, userAgent);
  }

  @Get("applications/:id/status")
  status(@Param("id") id: string) {
    return this.service.getStatus(id);
  }
}
