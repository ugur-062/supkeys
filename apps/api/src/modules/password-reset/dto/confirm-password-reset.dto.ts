import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ConfirmPasswordResetDto {
  @IsString()
  @MinLength(40)
  @MaxLength(80)
  token!: string;

  // Politika ChangePasswordDto ile AYNI — iki yol farklı güçte parola
  // kabul etmesin.
  @IsString()
  @MinLength(8, { message: "Parola en az 8 karakter olmalı" })
  @MaxLength(72)
  @Matches(/[a-z]/, { message: "Parola en az bir küçük harf içermeli" })
  @Matches(/[A-Z]/, { message: "Parola en az bir büyük harf içermeli" })
  @Matches(/\d/, { message: "Parola en az bir rakam içermeli" })
  newPassword!: string;
}
