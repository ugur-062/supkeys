import { IsString, MaxLength, MinLength } from "class-validator";

export class BlockSupplierDto {
  @IsString()
  @MinLength(10, { message: "Sebep en az 10 karakter olmalı" })
  @MaxLength(500)
  reason!: string;
}
