import { ListingDocKind } from "@rothern/db";
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Talep belgesi gövdeleri (derin denetim 2026-09-29 X15/X01/S027). Önceden
 * `@Body()` satır içi tip literaliydi → metatype `Object`, global ValidationPipe
 * (whitelist/forbidNonWhitelisted) hiç çalışmıyordu; `fileName: 123` ya da
 * `kind: "FOO"` servis içinde TypeError/Prisma hatasıyla 500'e dönüşüyordu.
 * Kardeş `company-bid-documents` DTO'larıyla aynı kalıp; tavanlar servis
 * kontrolleriyle uyumlu (anahtar ≤300, kayıtta ad 200'e kırpılır).
 */
export class ListingDocUploadUrlDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @IsOptional()
  @IsInt()
  fileSize?: number;
}

export class RegisterListingDocDto {
  @IsString()
  @MaxLength(300)
  key!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(120)
  mimeType!: string;

  @IsOptional()
  @IsEnum(ListingDocKind)
  kind?: ListingDocKind;

  /** Faz 3: doluysa belge o KALEME bağlanır (ilan seviyesi değil). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  itemId?: string;
}
