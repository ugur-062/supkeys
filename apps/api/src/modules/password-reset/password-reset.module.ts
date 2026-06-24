import { Module } from "@nestjs/common";
import { EmailModule } from "../email/email.module";
import { PasswordResetService } from "./password-reset.service";

@Module({
  imports: [EmailModule],
  providers: [PasswordResetService],
  exports: [PasswordResetService],
})
export class PasswordResetModule {}
