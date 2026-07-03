import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyMessagesService } from "./company-messages.service";
import { SendMessageDto } from "./dto/send-message.dto";

@Controller("company/messages")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyMessagesController {
  constructor(private readonly service: CompanyMessagesService) {}

  /** Portal gelen kutusu (satinalma | satis). */
  @Get("threads")
  threads(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("portal") portal: string,
  ) {
    return this.service.listThreads(user, portal);
  }

  /** Nav rozeti — AKTİF portalın okunmamış mesaj sayısı (portal verilmezse toplam). */
  @Get("unread-count")
  unread(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("portal") portal?: string,
  ) {
    return this.service.unreadCount(user, portal);
  }

  /** Bir firmayla bu portaldaki konuşma. */
  @Get("with/:otherCompanyId")
  thread(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("otherCompanyId") otherCompanyId: string,
    @Query("portal") portal: string,
  ) {
    return this.service.getThread(user, portal, otherCompanyId);
  }

  /** Mesaj gönder. */
  @Post("with/:otherCompanyId")
  send(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("otherCompanyId") otherCompanyId: string,
    @Query("portal") portal: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.service.send(user, portal, otherCompanyId, dto.body);
  }
}
