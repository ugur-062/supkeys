import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDemoRequestDto {
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  companyName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(150)
  contactName!: string;

  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  companySize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  source?: string;
}
