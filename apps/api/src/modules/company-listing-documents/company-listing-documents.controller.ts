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
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { CompanyListingDocumentsService } from "./company-listing-documents.service";

@Controller("company/listings/:id/documents")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyListingDocumentsController {
  constructor(private readonly service: CompanyListingDocumentsService) {}

  @Get()
  @RequireCompanyPermission(["buy:view", "sell:view"])
  list(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.list(user, id);
  }

  @Post("upload-url")
  @RequireCompanyPermission("buy:listing:manage")
  uploadUrl(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() body: { fileName: string; mimeType: string; fileSize?: number },
  ) {
    return this.service.requestUploadUrl(user, id, body);
  }

  @Post()
  @RequireCompanyPermission("buy:listing:manage")
  register(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body()
    body: {
      key: string;
      fileName: string;
      mimeType: string;
      kind?: import("@rothern/db").ListingDocKind;
      /** Faz 3: doluysa belge o KALEME bağlanır (ilan seviyesi değil). */
      itemId?: string;
    },
  ) {
    return this.service.register(user, id, body);
  }

  @Delete(":docId")
  @RequireCompanyPermission("buy:listing:manage")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("docId") docId: string,
  ) {
    return this.service.remove(user, id, docId);
  }
}
