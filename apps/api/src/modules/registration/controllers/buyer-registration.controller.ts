import {
  BadRequestException,
  Controller,
  Get,
  Query,
} from "@nestjs/common";
import { BuyerRegistrationService } from "../services/buyer-registration.service";

@Controller("registration/buyer")
export class BuyerRegistrationController {
  constructor(private readonly service: BuyerRegistrationService) {}

  @Get("invitation-info")
  invitationInfo(@Query("token") token?: string) {
    if (!token) throw new BadRequestException("Token gerekli");
    return this.service.getInvitationInfo(token);
  }
}
