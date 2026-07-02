import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyListingDocumentsService } from "./company-listing-documents.service";

@Controller("company/listings/:id/documents")
@UseGuards(CompanyJwtAuthGuard)
export class CompanyListingDocumentsController {
  constructor(private readonly service: CompanyListingDocumentsService) {}

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
    @Body() body: { fileName: string; mimeType: string; fileSize?: number },
  ) {
    return this.service.requestUploadUrl(user, id, body);
  }

  @Post()
  register(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() body: { key: string; fileName: string; mimeType: string },
  ) {
    return this.service.register(user, id, body);
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
