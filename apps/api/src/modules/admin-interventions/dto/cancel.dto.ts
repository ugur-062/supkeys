import { IsString, MinLength, MaxLength } from "class-validator";

export class AdminCancelDto {
  @IsString()
  @MinLength(10, { message: "İptal sebebi en az 10 karakter olmalıdır" })
  @MaxLength(500)
  reason!: string;
}
