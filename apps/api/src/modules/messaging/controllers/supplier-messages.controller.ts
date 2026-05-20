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
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { SendMessageDto } from "../dto/send-message.dto";
import { NoCacheInterceptor } from "../interceptors/no-cache.interceptor";
import {
  type MessageActor,
  MessagesService,
} from "../services/messages.service";

@Controller("supplier")
@UseGuards(SupplierJwtAuthGuard)
@UseInterceptors(NoCacheInterceptor)
export class SupplierMessagesController {
  constructor(private readonly service: MessagesService) {}

  private actor(user: AuthenticatedSupplierUser): MessageActor {
    return {
      kind: "supplier",
      supplierId: user.supplierId,
      supplierUserId: user.supplierUserId,
    };
  }

  @Get("threads")
  listAllThreads(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.listAllThreadsForUser(this.actor(user));
  }

  // ---------- V2-4.1 — Şirket-bazlı DIRECT mesajlar (/mesajlar sayfası) ----------

  @Get("contacts")
  listContacts(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.listContactsForUser(this.actor(user));
  }

  @Get("tenants/:tenantId/messages")
  listDirectMessages(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("tenantId") tenantId: string,
  ): Promise<unknown> {
    // Supplier perspektifinden DIRECT — contextRefId = tenantId
    return this.service.listMessages(this.actor(user), "DIRECT", tenantId);
  }

  @Post("tenants/:tenantId/messages")
  sendDirectMessage(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("tenantId") tenantId: string,
    @Body() dto: SendMessageDto,
  ): Promise<unknown> {
    return this.service.sendMessage(this.actor(user), "DIRECT", tenantId, dto);
  }

  @Get("orders/:orderId/messages")
  listOrderMessages(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("orderId") orderId: string,
  ): Promise<unknown> {
    return this.service.listMessages(this.actor(user), "ORDER", orderId);
  }

  @Post("orders/:orderId/messages")
  sendOrderMessage(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("orderId") orderId: string,
    @Body() dto: SendMessageDto,
  ): Promise<unknown> {
    return this.service.sendMessage(this.actor(user), "ORDER", orderId, dto);
  }

  @Get("tenders/:tenderId/messages")
  listTenderMessages(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("tenderId") tenderId: string,
  ): Promise<unknown> {
    return this.service.listMessages(this.actor(user), "TENDER", tenderId);
  }

  @Post("tenders/:tenderId/messages")
  sendTenderMessage(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("tenderId") tenderId: string,
    @Body() dto: SendMessageDto,
  ): Promise<unknown> {
    return this.service.sendMessage(this.actor(user), "TENDER", tenderId, dto);
  }

  @Get("messages/unread-count")
  unreadCount(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.getUnreadCount(this.actor(user));
  }
}
