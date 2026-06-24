import {
  BadRequestException,
  Controller,
  Get,
  Query,
} from "@nestjs/common";
import { SupplierRegistrationService } from "../services/supplier-registration.service";

@Controller("registration/supplier")
export class SupplierRegistrationController {
  constructor(private readonly service: SupplierRegistrationService) {}

  @Get("invitation-info")
  invitationInfo(@Query("token") token?: string) {
    if (!token) throw new BadRequestException("Token gerekli");
    return this.service.getInvitationInfo(token);
  }
}
