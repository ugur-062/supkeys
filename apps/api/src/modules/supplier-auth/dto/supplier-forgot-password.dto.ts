import { IsEmail } from "class-validator";

export class SupplierForgotPasswordDto {
  @IsEmail({}, { message: "Geçerli bir e-posta giriniz" })
  email!: string;
}
