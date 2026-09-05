import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../company-auth/decorators/current-company-user.decorator";
import { RequireCompanyPermission } from "../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../company-auth/guards/company-permissions.guard";
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { ListingBidDocKind } from "@rothern/db";
import { CompanyBidDocumentsService } from "./company-bid-documents.service";

class UploadUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;
}

class RegisterDto {
  @IsString()
  @MaxLength(500)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @IsOptional()
  @IsEnum(ListingBidDocKind)
  kind?: ListingBidDocKind;
}

@Controller("company/listings/:id/bid-documents")
@UseGuards(CompanyJwtAuthGuard, CompanyPermissionsGuard)
export class CompanyBidDocumentsController {
  constructor(private readonly service: CompanyBidDocumentsService) {}

  @Get()
  @RequireCompanyPermission(["buy:view", "sell:view"])
  list(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.list(user, id);
  }

  @Post("upload-url")
  @RequireCompanyPermission("sell:bid:submit")
  uploadUrl(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: UploadUrlDto,
  ) {
    return this.service.requestUploadUrl(user, id, dto);
  }

  @Post()
  @RequireCompanyPermission("sell:bid:submit")
  register(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: RegisterDto,
  ) {
    return this.service.register(user, id, dto);
  }

  @Delete(":docId")
  @RequireCompanyPermission("sell:bid:submit")
  remove(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("docId") docId: string,
  ) {
    return this.service.remove(user, id, docId);
  }
}
