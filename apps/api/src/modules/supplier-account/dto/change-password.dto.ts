import { IsString, Matches, MaxLength, MinLength } from "class-validator";

export class ChangeSupplierPasswordDto {
  @IsString()
  @MinLength(1, { message: "Mevcut şifre gerekli" })
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: "Yeni şifre en az 8 karakter olmalı" })
  @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message: "Yeni şifre en az 1 büyük harf, 1 küçük harf ve 1 rakam içermeli",
  })
  newPassword!: string;
}
