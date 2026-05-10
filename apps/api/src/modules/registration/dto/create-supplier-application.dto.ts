import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsString,
} from "class-validator";
import { CreateBuyerApplicationDto } from "./create-buyer-application.dto";

export class CreateSupplierApplicationDto extends CreateBuyerApplicationDto {
  // V2-6 — UNSPSC Family ID'leri. Tedarikçinin teklif verdiği iş kolları.
  // Admin onayında SupplierCategory junction'a kopyalanır.
  @IsArray({ message: "En az 1 kategori seçmelisiniz" })
  @ArrayMinSize(1, { message: "En az 1 kategori seçmelisiniz" })
  @ArrayMaxSize(20, { message: "En fazla 20 kategori seçebilirsiniz" })
  @IsString({ each: true, message: "Kategori ID'si geçerli bir metin olmalı" })
  categoryIds!: string[];
}
