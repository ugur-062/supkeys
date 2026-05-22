import {
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * V2-7 — Kapanış zamanını değiştir / ihaleyi hemen kapat.
 * closeNow=true → newCloseAt yok sayılır, ihale anında IN_AWARD'a alınır.
 * closeNow=false → newCloseAt zorunlu, geleceğe; bidsCloseAt güncellenir.
 * Her iki halde de note zorunlu ve davetli tedarikçilere e-posta ile iletilir.
 */
export class ChangeClosingTimeDto {
  @IsBoolean()
  closeNow!: boolean;

  @IsOptional()
  @IsDateString()
  newCloseAt?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: "Not en az 5 karakter olmalı" })
  @MaxLength(1000, { message: "Not en fazla 1000 karakter" })
  note!: string;
}
