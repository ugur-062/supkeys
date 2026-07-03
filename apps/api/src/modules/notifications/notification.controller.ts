import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { MarkReadDto } from "./dto/mark-read.dto";
import {
  NotificationService,
  type NotificationPortal,
} from "./notification.service";

/** Query'den güvenli portal — geçersizse ortak (undefined). */
function parsePortal(v?: string): NotificationPortal | undefined {
  return v === "satinalma" || v === "satis" ? v : undefined;
}

@Controller("notifications")
@UseGuards(CompanyJwtAuthGuard)
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  @Get()
  list(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("unread") unread?: string,
    @Query("portal") portal?: string,
  ) {
    return this.service.listForUser(user.userId, {
      unreadOnly: unread === "1" || unread === "true",
      portal: parsePortal(portal),
    });
  }

  @Get("unread-count")
  async unreadCount(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("portal") portal?: string,
  ) {
    return {
      count: await this.service.unreadCount(user.userId, parsePortal(portal)),
    };
  }

  @Post("read")
  @HttpCode(HttpStatus.OK)
  async read(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: MarkReadDto,
  ) {
    return { updated: await this.service.markRead(user.userId, dto.ids) };
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  async readAll(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Query("portal") portal?: string,
  ) {
    return {
      updated: await this.service.markAllRead(user.userId, parsePortal(portal)),
    };
  }
}
