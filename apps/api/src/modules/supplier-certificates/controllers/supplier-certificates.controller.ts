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
  AuthenticatedSupplierUser,
  CurrentSupplierUser,
} from "../../supplier-auth/decorators/current-supplier-user.decorator";
import { SupplierJwtAuthGuard } from "../../supplier-auth/guards/supplier-jwt-auth.guard";
import {
  CreateCertDto,
  RequestCertUploadDto,
} from "../dto/supplier-certificate.dto";
import { SupplierCertificatesService } from "../services/supplier-certificates.service";

// G9 madde 26 — Sertifikalarım. Tüm tedarikçi kullanıcıları yönetir.
@UseGuards(SupplierJwtAuthGuard)
@Controller("supplier-certificates")
export class SupplierCertificatesController {
  constructor(private readonly service: SupplierCertificatesService) {}

  @Get()
  list(@CurrentSupplierUser() user: AuthenticatedSupplierUser) {
    return this.service.list(user.supplierUserId);
  }

  @Post("upload-url")
  requestUpload(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: RequestCertUploadDto,
  ) {
    return this.service.requestUpload(user.supplierUserId, dto);
  }

  @Post()
  create(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Body() dto: CreateCertDto,
  ) {
    return this.service.create(user.supplierUserId, dto);
  }

  @Delete(":id")
  remove(
    @CurrentSupplierUser() user: AuthenticatedSupplierUser,
    @Param("id") id: string,
  ) {
    return this.service.remove(user.supplierUserId, id);
  }
}
