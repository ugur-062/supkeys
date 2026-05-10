import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { SendMessageDto } from "../dto/send-message.dto";
import {
  type MessageActor,
  MessagesService,
} from "../services/messages.service";

@Controller("tenants/me")
@UseGuards(JwtAuthGuard)
export class TenantMessagesController {
  constructor(private readonly service: MessagesService) {}

  private actor(user: AuthenticatedUser): MessageActor {
    return { kind: "tenant", tenantId: user.tenantId, userId: user.id };
  }

  // ---------- ORDER context ----------

  @Get("orders/:orderId/messages")
  listOrderMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
  ): Promise<unknown> {
    return this.service.listMessages(this.actor(user), "ORDER", orderId);
  }

  @Post("orders/:orderId/messages")
  sendOrderMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
    @Body() dto: SendMessageDto,
  ): Promise<unknown> {
    return this.service.sendMessage(this.actor(user), "ORDER", orderId, dto);
  }

  // ---------- TENDER context ----------

  @Get("tenders/:tenderId/threads")
  listTenderThreads(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tenderId") tenderId: string,
  ) {
    return this.service.listTenderThreadsForTenant(this.actor(user), tenderId);
  }

  @Get("tenders/:tenderId/threads/:supplierId/messages")
  listTenderMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tenderId") tenderId: string,
    @Param("supplierId") supplierId: string,
  ): Promise<unknown> {
    return this.service.listMessages(
      this.actor(user),
      "TENDER",
      tenderId,
      supplierId,
    );
  }

  @Post("tenders/:tenderId/threads/:supplierId/messages")
  sendTenderMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("tenderId") tenderId: string,
    @Param("supplierId") supplierId: string,
    @Body() dto: SendMessageDto,
  ): Promise<unknown> {
    return this.service.sendMessage(this.actor(user), "TENDER", tenderId, {
      ...dto,
      targetSupplierId: supplierId,
    });
  }

  // ---------- Sidebar badge ----------

  @Get("messages/unread-count")
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getUnreadCount(this.actor(user));
  }
}
