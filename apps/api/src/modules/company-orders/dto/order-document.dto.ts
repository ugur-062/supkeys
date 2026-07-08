import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

export enum CompanyDocTypeDto {
  DELIVERY = "DELIVERY",
  PAYMENT = "PAYMENT",
  // Teminat mektubu — peşin (CASH) işte satıcı sipariş onayından ÖNCE yükler.
  // Şema/servis/frontend destekliyordu; DTO'da eksikti (yükleme reddediliyordu).
  TEMINAT = "TEMINAT",
}

export class UploadUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;

  @IsEnum(CompanyDocTypeDto)
  type!: CompanyDocTypeDto;

  @IsOptional()
  @IsInt()
  fileSize?: number;
}

export class RegisterDocDto {
  @IsEnum(CompanyDocTypeDto)
  type!: CompanyDocTypeDto;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @MaxLength(100)
  mimeType!: string;
}
