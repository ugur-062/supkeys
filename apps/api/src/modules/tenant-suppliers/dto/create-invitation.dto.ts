import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateInvitationDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi giriniz" })
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(150)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
