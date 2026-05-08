import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ListAttachmentsDto } from "../dto/list-attachments.dto";
import { RequestUploadUrlDto } from "../dto/request-upload-url.dto";
import {
  AttachmentsService,
  type ActorContext,
} from "../services/attachments.service";

/**
 * Tenant kullanıcıları için attachment endpoint'leri.
 * Path prefix: /api/attachments
 */
@Controller("attachments")
@UseGuards(JwtAuthGuard)
export class TenantAttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  private actor(user: AuthenticatedUser): ActorContext {
    return {
      kind: "tenant",
      tenantId: user.tenantId,
      userId: user.id,
      role: user.role,
    };
  }

  @Post("upload-url")
  requestUploadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.service.requestUploadUrl(this.actor(user), dto);
  }

  @Post(":id/finalize")
  finalize(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.service.finalizeUpload(this.actor(user), id);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListAttachmentsDto,
  ) {
    return this.service.list(this.actor(user), query.scope, query.scopeRefId);
  }

  @Get(":id/download-url")
  getDownloadUrl(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.service.getDownloadUrl(this.actor(user), id);
  }

  @Delete(":id")
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ) {
    return this.service.delete(this.actor(user), id);
  }
}
