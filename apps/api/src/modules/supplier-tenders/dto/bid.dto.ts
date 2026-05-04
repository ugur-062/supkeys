import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

/** `Currency` Prisma enum'u — backend'de string-literal union olarak doğrulanır */
export enum CurrencyDto {
  TRY = "TRY",
  USD = "USD",
  EUR = "EUR",
}

export class BidItemDto {
  @IsString()
  @IsNotEmpty()
  tenderItemId!: string;

  /**
   * null/undefined → bu kaleme teklif verilmedi.
   * Sayı ise unitPrice olarak kaydedilir; toplam fiyat backend'de
   * tenderItem.quantity ile çarpılarak hesaplanır.
   */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  unitPrice?: number | null;

  /** TenderItem.customQuestion varsa bu kaleme teklif verilince zorunlu */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  customAnswer?: string;
}

export class BidAttachmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName!: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024) // 10MB per file
  fileSize!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  mimeType!: string;

  @IsString()
  @IsNotEmpty()
  /** base64 data URL veya MinIO URL (V2) */
  fileUrl!: string;
}

export class CreateOrUpdateBidDto {
  @IsEnum(CurrencyDto)
  currency!: CurrencyDto;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => BidItemDto)
  items!: BidItemDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => BidAttachmentDto)
  attachments?: BidAttachmentDto[];
}
