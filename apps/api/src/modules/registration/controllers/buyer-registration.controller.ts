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
    @Ip() ip: string,
    @Headers("user-agent") userAgent?: string,
  ) {
    return this.service.create(dto, ip, userAgent);
  }

  @Get("applications/:id/status")
  status(@Param("id") id: string) {
    return this.service.getStatus(id);
  }
}
