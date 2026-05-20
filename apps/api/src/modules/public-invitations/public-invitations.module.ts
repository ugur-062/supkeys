import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { SupabaseAuthModule } from "../supabase-auth/supabase-auth.module";
import { PublicInvitationsController } from "./controllers/public-invitations.controller";
import { PublicInvitationsService } from "./services/public-invitations.service";

@Module({
  imports: [AuthModule, SupabaseAuthModule],
  controllers: [PublicInvitationsController],
  providers: [PublicInvitationsService],
})
export class PublicInvitationsModule {}
