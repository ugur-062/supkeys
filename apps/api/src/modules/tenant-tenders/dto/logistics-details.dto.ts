import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export enum TransportModeDto {
  ROAD = "ROAD",
  SEA = "SEA",
  AIR = "AIR",
  RAIL = "RAIL",
  MULTIMODAL = "MULTIMODAL",
}

/**
 * Lojistik İhalesi — yapılandırılmış taşıma bilgisi (Tender.logisticsDetails JSON).
 * isLogistics=true olduğunda zorunlu alanlar: mod + çıkış il + varış il + kargo cinsi.
 */
export class LogisticsDetailsDto {
  @IsEnum(TransportModeDto)
  transportMode!: TransportModeDto;

  // ----- Çıkış -----
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  originCity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  originDistrict?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  originAddress?: string;

  // ----- Varış -----
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  destinationCity!: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  destinationDistrict?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  destinationAddress?: string;

  // ----- Kargo -----
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  cargoType!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  weightKg?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(1_000_000)
  volumeM3?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 0 })
  @Min(0)
  @Max(1_000_000)
  packageCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  vehicleType?: string;

  // ----- Tarihler -----
  @IsOptional()
  @IsDateString()
  loadingDate?: string;

  @IsOptional()
  @IsDateString()
  deliveryDate?: string;

  // ----- Özel durumlar -----
  @IsOptional()
  @IsBoolean()
  hazardous?: boolean;

  @IsOptional()
  @IsBoolean()
  refrigerated?: boolean;

  @IsOptional()
  @IsBoolean()
  fragile?: boolean;

  @IsOptional()
  @IsBoolean()
  stackable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
