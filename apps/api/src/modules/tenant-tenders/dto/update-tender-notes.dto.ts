import { IsOptional, IsString, MaxLength } from "class-validator";

/**
 * V2-7+ — Alıcının dahili notu (internalNotes). Tedarikçiler görmez.
 * Boş string → notu temizle.
 */
export class UpdateTenderNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  internalNotes?: string;
}
