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
import { CompanyJwtAuthGuard } from "../company-auth/guards/company-jwt-auth.guard";
import { ListingBidDocKind } from "@supkeys/db";
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
@UseGuards(CompanyJwtAuthGuard)
export class CompanyBidDocumentsController {
  constructor(private readonly service: CompanyBidDocumentsService) {}

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
    return this.service.requestUploadUrl(user, id, dto);
  }

  @Post()
  register(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Body() dto: RegisterDto,
  ) {
    return this.service.register(user, id, dto);
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
