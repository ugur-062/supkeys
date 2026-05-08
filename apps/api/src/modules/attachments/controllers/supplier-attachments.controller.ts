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
  CurrentSupplierUser,
  type AuthenticatedSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import { ListAttachmentsDto } from "../dto/list-attachments.dto";
import { RequestUploadUrlDto } from "../dto/request-upload-url.dto";
import {
  AttachmentsService,
  type ActorContext,
} from "../services/attachments.service";

/**
 * Tedarikçi kullanıcıları için attachment endpoint'leri.
 * Path prefix: /api/supplier/attachments
 */
@Controller("supplier/attachments")
@UseGuards(SupplierJwtAuthGuard)
export class SupplierAttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  private actor(user: AuthenticatedSupplierUser): ActorContext {
    return {
      kind: "supplier",
      supplierId: user.supplierId,
      supplierUserId: user.supplierUserId,
    };
  }

  @Post("upload-url")
  requestUploadUrl(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: RequestUploadUrlDto,
  ) {
    return this.service.requestUploadUrl(this.actor(user), dto);
  }

  @Post(":id/finalize")
  finalize(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
  ) {
    return this.service.finalizeUpload(this.actor(user), id);
  }

  @Get()
  list(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Query() query: ListAttachmentsDto,
  ) {
    return this.service.list(this.actor(user), query.scope, query.scopeRefId);
  }

  @Get(":id/download-url")
  getDownloadUrl(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
  ) {
    return this.service.getDownloadUrl(this.actor(user), id);
  }

  @Delete(":id")
  delete(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
  ) {
    return this.service.delete(this.actor(user), id);
  }
}
