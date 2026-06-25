import { IsEmail, IsString, MinLength } from "class-validator";

export class CompanyLoginDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;
}
