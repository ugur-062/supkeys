import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { RequireCompanyPermission } from "../../company-auth/decorators/require-company-permission.decorator";
import { CompanyPermissionsGuard } from "../../company-auth/guards/company-permissions.guard";
import { ProductExtractService } from "./product-extract.service";

class ProductExtractDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true }) fileKeys!: string[];
}

/**
 * "Katalogdan ürün ekle (AI)" — guard zinciri diğer AI çıkarımlarıyla aynı
 * (JWT + Silver+), ek olarak ürün yazma izni (`sell:product:manage`): bu uç
 * yalnız önizleme dönse de ürün kataloğunu doldurma akışının parçası. (Eski
 * `templates:manage` kapısı saf Satışçı'yı dışarıda bırakıyordu — yetki
 * tablosu 2026-09-05.)
 *
 * Dosyalar `POST company/ai/uploads/url` presign'ıyla yüklenir (aynı anahtar
 * alanı). Yazma YOK — kullanıcı önizlemeyi onaylayınca
 * `POST company/items/import/commit` yazar.
 */
@Controller("company/ai")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard, CompanyPermissionsGuard)
export class ProductExtractController {
  constructor(private readonly service: ProductExtractService) {}

  @Post("product-extract")
  @RequireCompanyPermission("sell:product:manage")
  extract(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: ProductExtractDto,
  ) {
    return this.service.extract(user, dto);
  }
}
