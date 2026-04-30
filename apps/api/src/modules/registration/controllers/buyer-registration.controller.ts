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
import { CreateBuyerApplicationDto } from "../dto/create-buyer-application.dto";
import { BuyerRegistrationService } from "../services/buyer-registration.service";

@Controller("registration/buyer")
export class BuyerRegistrationController {
  constructor(private readonly service: BuyerRegistrationService) {}

  @Post("applications")
  @HttpCode(HttpStatus.CREATED)
  create(
    @Body() dto: CreateBuyerApplicationDto,
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

  @Get("invitation-info")
  invitationInfo(@Query("token") token?: string) {
    if (!token) throw new BadRequestException("Token gerekli");
    return this.service.getInvitationInfo(token);
  }
}
