import { IsString, MaxLength, MinLength } from "class-validator";

export class RejectApplicationDto {
  @IsString()
  @MinLength(5, { message: "Sebep en az 5 karakter olmalı" })
  @MaxLength(500)
  reason!: string;
}
