import { IsString, MaxLength, MinLength } from "class-validator";

export class InviteConnectionDto {
  @IsString()
  @MinLength(4, { message: "Firma kodu gerekli" })
  @MaxLength(20)
  rothernId!: string;
}
