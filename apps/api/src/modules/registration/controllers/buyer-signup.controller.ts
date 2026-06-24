import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  BuyerSignupDto,
  VerifyBuyerEmailDto,
} from "../dto/buyer-signup.dto";
import { BuyerSignupService } from "../services/buyer-signup.service";

@Controller("registration/buyer")
export class BuyerSignupController {
  constructor(private readonly service: BuyerSignupService) {}

  // Madde 29 — alıcı: davet linki ile hesap, ardından e-posta kod doğrulama.
  @Post("signup")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  signup(@Body() dto: BuyerSignupDto) {
    return this.service.signup(dto);
  }

  @Post("verify-email")
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyBuyerEmailDto) {
    return this.service.verifyEmail(dto);
  }

  @Post("resend-code")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  resend(@Body() body: { challengeId: string }) {
    return this.service.resend(body.challengeId);
  }
}
