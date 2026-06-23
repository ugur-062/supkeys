import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  SupplierSignupDto,
  VerifySupplierEmailDto,
} from "../dto/supplier-signup.dto";
import { SupplierSignupService } from "../services/supplier-signup.service";

@Controller("registration/supplier")
export class SupplierSignupController {
  constructor(private readonly service: SupplierSignupService) {}

  // Madde 29 — önce hesap; ardından e-posta kod doğrulama.
  @Post("signup")
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  signup(@Body() dto: SupplierSignupDto) {
    return this.service.signup(dto);
  }

  @Post("verify-email")
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifySupplierEmailDto) {
    return this.service.verifyEmail(dto);
  }

  @Post("resend-code")
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  resend(@Body() body: { challengeId: string }) {
    return this.service.resend(body.challengeId);
  }
}
