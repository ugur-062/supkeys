import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * V2-PUBLIC-PROFILE — Cover ve galeri foto için presigned PUT isteği DTO'su.
 * Sadece JPEG / PNG / WebP kabul edilir (genel görüntü için yeterli).
 */
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"];

export class RequestProfileUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  filename!: string;

  @IsIn(ALLOWED_IMAGE_MIMES)
  mimeType!: string;
}

/**
 * V2-PUBLIC-PROFILE — Cover finalize: PUT sonrası backend R2 head check + persist.
 */
export class FinalizeCoverDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  key!: string;
}

/**
 * V2-PUBLIC-PROFILE — Galeri foto finalize: key + opsiyonel caption.
 */
export class AddProfilePhotoDto {
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  key!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string;
}
