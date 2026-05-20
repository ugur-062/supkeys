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

  @Get("contacts")
  listContacts(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
  ): Promise<unknown> {
    return this.service.listContactsForUser(this.actor(user));
  }

  // V2-4.2 — Unified tenant thread

  @Get("tenants/:tenantId/messages")
  listMessages(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("tenantId") tenantId: string,
  ): Promise<unknown> {
    return this.service.listMessages(this.actor(user), tenantId);
  }

  @Post("tenants/:tenantId/messages")
  sendMessage(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("tenantId") tenantId: string,
    @Body() dto: SendMessageDto,
  ): Promise<unknown> {
    return this.service.sendMessage(this.actor(user), tenantId, {
      content: dto.content,
      attachmentIds: dto.attachmentIds,
      context: dto.context,
      contextRefId: dto.contextRefId,
    });
  }

  @Get("messages/unread-count")
  unreadCount(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.getUnreadCount(this.actor(user));
  }
}
