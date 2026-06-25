import { IsEnum, IsString, MaxLength, MinLength } from "class-validator";

export enum CompanyDocTypeDto {
  DELIVERY = "DELIVERY",
  PAYMENT = "PAYMENT",
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
