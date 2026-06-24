import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Matches,
  ValidateIf,
} from "class-validator";

/** Admin tedarikçi yönetimi (üyelik + blok + metadata). */
export class UpdateSupplierDto {
  // Üyelik — admin override (ödeme akışı dışı; STANDARD↔PREMIUM).
  @IsOptional()
  @IsIn(["STANDARD", "PREMIUM"])
  membership?: "STANDARD" | "PREMIUM";

  // Blokla/aç. false → blockedAt/blockedReason set; true → temizlenir.
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  blockedReason?: string;

  // ----- Metadata (admin destek düzeltmeleri) -----
  @IsOptional()
  @IsString()
  @Length(2, 200)
  companyName?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d{10,11}$/, { message: "VKN/TCKN 10 veya 11 haneli olmalı" })
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  taxOffice?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  industry?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 200)
  website?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  city?: string;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  district?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  postalCode?: string | null;
}

/** Admin tedarikçi kullanıcı yönetimi (aktif/pasif). */
export class AdminUpdateSupplierUserDto {
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
