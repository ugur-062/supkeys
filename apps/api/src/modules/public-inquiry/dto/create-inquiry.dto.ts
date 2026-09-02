import { Transform } from "class-transformer";
import {
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

const trim = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

/**
 * Misafir bilgi talebi — ANONİM gövde. Her alan dar: doğrulanmamış bir
 * kaynaktan geliyor ve içeriği satıcıya gösterilecek.
 */
export class CreateInquiryDto {
  @Matches(/^[a-z0-9-]{1,120}$/, { message: "Geçersiz firma adresi" })
  companySlug!: string;

  @Matches(/^[a-z0-9-]{1,160}$/, { message: "Geçersiz ürün adresi" })
  productSlug!: string;

  @Transform(trim) @IsString() @MinLength(2) @MaxLength(100) name!: string;

  @Transform(({ value }) =>
    typeof value === "string" ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  @MaxLength(200)
  email!: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(150)
  companyName?: string;

  @IsOptional() @Transform(trim) @IsString() @MaxLength(40) phone?: string;

  @Transform(trim) @IsString() @MinLength(10) @MaxLength(3000) message!: string;

  /** Serbest metin miktar beyanı ("500 adet") — yapılandırılmış alan değil. */
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) quantity?: string;

  /**
   * BOT TUZAĞI — formda gizli, insan doldurmaz. Doluysa istek sessizce
   * başarılı görünür ama yazılmaz (bota hangi kontrolün yakaladığı
   * öğretilmez).
   */
  @IsOptional() @IsString() @MaxLength(200) website?: string;

  /** Form açılışından gönderime geçen süre — bot 2 saniyeden hızlıdır. */
  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : value;
  })
  @IsInt()
  @Min(0)
  elapsedMs?: number;
}
