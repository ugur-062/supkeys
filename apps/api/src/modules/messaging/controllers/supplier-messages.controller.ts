import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { SendMessageDto } from "../dto/send-message.dto";
import {
  type MessageActor,
  MessagesService,
} from "../services/messages.service";

@Controller("supplier")
@UseGuards(SupplierJwtAuthGuard)
export class SupplierMessagesController {
  constructor(private readonly service: MessagesService) {}

  private actor(user: AuthenticatedSupplierUser): MessageActor {
    return {
      kind: "supplier",
      supplierId: user.supplierId,
      supplierUserId: user.supplierUserId,
    };
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
