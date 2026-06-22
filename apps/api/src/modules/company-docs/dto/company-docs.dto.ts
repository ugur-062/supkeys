import { IsString, MaxLength, MinLength } from "class-validator";

export class CompanyDocUploadUrlDto {
  @IsString()
  docType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsString()
  @MaxLength(150)
  mimeType!: string;
}

export class SaveCompanyDocDto {
  @IsString()
  docType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  key!: string;
}
