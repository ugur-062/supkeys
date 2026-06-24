import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
} from "class-validator";

/** Tedarikçi faaliyet kategorileri — ana (segment, ≤3) + alt (sınırsız). */
export class UpdateSupplierCategoriesDto {
  @IsArray()
  @ArrayMinSize(1, { message: "En az 1 ana kategori seçmelisiniz" })
  @ArrayMaxSize(3, { message: "En fazla 3 ana kategori seçebilirsiniz" })
  @IsString({ each: true })
  mainCategoryIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subCategoryIds?: string[];
}
