import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
} from "class-validator";

export class UpdateSupplierCategoriesDto {
  // V2-6 — Tedarikçinin kategori listesi (Family seviyesi). Replace-all semantik:
  // mevcut SupplierCategory satırları silinir, gönderilen listeye göre yeniden
  // yazılır. Tek transaction içinde.
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 kategori seçmelisiniz" })
  @ArrayMaxSize(20, { message: "En fazla 20 kategori seçebilirsiniz" })
  @IsString({ each: true })
  categoryIds!: string[];
}
