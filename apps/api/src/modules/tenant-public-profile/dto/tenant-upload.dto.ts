import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];

export class RequestTenantUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  filename!: string;

  @IsIn(ALLOWED_IMAGE_MIMES)
  mimeType!: string;
}

export class FinalizeTenantImageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  key!: string;
}
