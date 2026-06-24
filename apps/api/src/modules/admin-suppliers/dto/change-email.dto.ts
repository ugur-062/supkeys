import { IsEmail, MaxLength } from "class-validator";

/** Admin destek — kullanıcı e-posta adresini değiştirir. */
export class AdminChangeEmailDto {
  @IsEmail({}, { message: "Geçerli bir e-posta giriniz" })
  @MaxLength(200)
  email!: string;
}
