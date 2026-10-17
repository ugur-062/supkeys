import { Module } from "@nestjs/common";
import { CompanyViewsModule } from "../company-views/company-views.module";
import { CompanyAuthModule } from "../company-auth/company-auth.module";
import { CompanyBlocksModule } from "../company-blocks/company-blocks.module";
import { EmailModule } from "../email/email.module";
import { NotificationModule } from "../notifications/notification.module";
import { InvitePreviewController, ReferralOptOutController, ReferralVisitController } from "./controllers/referral-optout.controller";
import { CompanyConnectionsController } from "./controllers/company-connections.controller";
import { CompanyDirectoryController } from "./controllers/company-directory.controller";
import { CompanyConnectionsService } from "./services/company-connections.service";
import { ExternalInviteDispatcher } from "./services/external-invite-dispatcher.service";
import { ListingEmailInvitesService } from "./services/listing-email-invites.service";
import { ExternalInviteScheduler } from "./schedulers/external-invite.scheduler";

@Module({
  imports: [CompanyAuthModule, CompanyBlocksModule, EmailModule, NotificationModule, CompanyViewsModule],
  controllers: [CompanyConnectionsController, CompanyDirectoryController, ReferralOptOutController, ReferralVisitController, InvitePreviewController],
  providers: [CompanyConnectionsService, ListingEmailInvitesService, ExternalInviteDispatcher, ExternalInviteScheduler],
  // Faz AI-2: asistan araçları bu servisi kullanıcı kimliğiyle çağırır.
  exports: [CompanyConnectionsService, ExternalInviteDispatcher],
})
export class CompanyConnectionsModule {}
