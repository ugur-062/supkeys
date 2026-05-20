import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { SendMessageDto } from "../dto/send-message.dto";
import { NoCacheInterceptor } from "../interceptors/no-cache.interceptor";
import {
  type MessageActor,
  MessagesService,
} from "../services/messages.service";

@Controller("tenants/me")
@UseGuards(JwtAuthGuard)
@UseInterceptors(NoCacheInterceptor)
export class TenantMessagesController {
  constructor(private readonly service: MessagesService) {}

  private actor(user: AuthenticatedUser): MessageActor {
    return { kind: "tenant", tenantId: user.tenantId, userId: user.id };
  }

  // ---------- Header dropdown ----------

  @Get("threads")
  listAllThreads(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.listAllThreadsForUser(this.actor(user));
  }

  // ---------- /mesajlar sayfası ----------

  @Get("contacts")
  listContacts(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.service.listContactsForUser(this.actor(user));
  }

  // ---------- V2-4.2 — Unified supplier thread (TENDER/ORDER/DIRECT) ----------

  @Get("suppliers/:supplierId/messages")
  listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("supplierId") supplierId: string,
  ): Promise<unknown> {
    return this.service.listMessages(this.actor(user), supplierId);
  }

  @Post("suppliers/:supplierId/messages")
  sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("supplierId") supplierId: string,
    @Body() dto: SendMessageDto,
  ): Promise<unknown> {
    return this.service.sendMessage(this.actor(user), supplierId, {
      content: dto.content,
      attachmentIds: dto.attachmentIds,
      context: dto.context,
      contextRefId: dto.contextRefId,
    });
  }

  // ---------- Tender detay dropdown ----------

  @Get("tenders/:tenderId/threads")
  listTenderThreads(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tenderId") tenderId: string,
  ) {
    return this.service.listTenderThreadsForTenant(this.actor(user), tenderId);
  }

  // ---------- Sidebar badge ----------

  @Get("messages/unread-count")
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getUnreadCount(this.actor(user));
  }
}
