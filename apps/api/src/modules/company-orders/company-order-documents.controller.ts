import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { CompanyDocType } from "@rothern/db";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyOrderDocumentsService } from "./company-order-documents.service";
import { RegisterDocDto, UploadUrlDto } from "./dto/order-document.dto";

@Controller("company/orders/:id/documents")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyOrderDocumentsController {
  constructor(private readonly service: CompanyOrderDocumentsService) {}

  @Get()
  list(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.list(user, id);
  }

  @Post("upload-url")
  uploadUrl(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UploadUrlDto,
  ) {
    return this.service.requestUploadUrl(user, id, {
      fileName: dto.fileName,
      mimeType: dto.mimeType,
      type: dto.type as CompanyDocType,
    });
  }

  @Post()
  register(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: RegisterDocDto,
  ) {
    return this.service.register(user, id, {
      type: dto.type as CompanyDocType,
      key: dto.key,
      fileName: dto.fileName,
      mimeType: dto.mimeType,
    });
  }

  @Delete(":docId")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("docId") docId: string,
  ) {
    return this.service.remove(user, id, docId);
  }
}
