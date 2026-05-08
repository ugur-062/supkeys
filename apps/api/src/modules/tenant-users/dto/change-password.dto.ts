import { IsString, MaxLength, MinLength } from "class-validator";

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: "Mevcut şifre gerekli" })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "Yeni şifre en az 8 karakter olmalı" })
  @MaxLength(72)
  newPassword!: string;
}
