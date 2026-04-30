import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { VerifyEmailDto } from "../dto/verify-email.dto";
import { EmailVerificationService } from "../services/email-verification.service";

@Controller("registration")
export class EmailVerificationController {
  constructor(private readonly service: EmailVerificationService) {}

  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyEmailDto) {
    return this.service.verify(dto);
  }
}
