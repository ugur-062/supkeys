import { IsEmail } from "class-validator";

export class CompanyForgotPasswordDto {
  @IsEmail({}, { message: "Geçerli e-posta girin" })
  email!: string;
}
