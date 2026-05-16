import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { VerifyEmailDto } from "../dto/verify-email.dto";
import { EmailVerificationService } from "../services/email-verification.service";

@Controller("registration")
export class EmailVerificationController {
  constructor(private readonly service: EmailVerificationService) {}

  // Security audit O-1 — token brute-force koruması: dakikada 10 deneme/IP
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post("verify-email")
  @HttpCode(HttpStatus.OK)
  verify(@Body() dto: VerifyEmailDto) {
    return this.service.verify(dto);
  }
}
