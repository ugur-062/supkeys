import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from "class-validator";

export class UpdateTenantDto {
  // V2-6.5 — BUYER (Satın Almacı) kontenjanı. 0 = davete kapalı.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  buyerSeatLimit?: number;

  // V2-6.5 — Üyelik bitiş tarihi. Doğrudan tarih atamak için.
  // null verilirse "sınırsız" (legacy/dev) anlamına gelir.
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  membershipEndAt?: string | null;

  // V2-6.5 — Mevcut bitiş tarihinden (yoksa şimdiden) n ay uzat (1-12).
  // membershipEndAt ile aynı request'te kullanılmamalı; eğer ikisi de
  // gelirse service extendMonths'ı baz alır.
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  extendMonths?: number;

  // V2-6.5 — Tenant meta (admin destek operasyonları için).
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @Matches(/^\d{10,11}$/, { message: "VKN/TCKN 10 veya 11 haneli olmalı" })
  taxNumber?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  taxOffice?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  industry?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  city?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  district?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  addressLine?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 20)
  postalCode?: string | null;
}
