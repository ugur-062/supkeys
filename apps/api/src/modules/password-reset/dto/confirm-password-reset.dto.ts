import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(40)
  @MaxLength(80)
  token!: string;

  @IsString()
  @MinLength(8, { message: "Parola en az 8 karakter olmalı" })
  @MaxLength(72)
  @Matches(/[A-Za-z]/, { message: "Parola en az bir harf içermeli" })
  @Matches(/\d/, { message: "Parola en az bir rakam içermeli" })
  newPassword!: string;
}
