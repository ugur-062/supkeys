import { ArrayMinSize, IsArray, IsString } from "class-validator";

/**
 * Mevcut ihaleye tedarikçi davet ekleme.
 * Backend status gate'i: DRAFT veya OPEN_FOR_BIDS.
 * İngiliz Usulü ihalede son 2 dk'da kabul edilmez (anti-snipe ile çakışmasın).
 */
export class AddInvitationsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "En az bir tedarikçi seçin" })
  @IsString({ each: true })
  supplierIds!: string[];
}
