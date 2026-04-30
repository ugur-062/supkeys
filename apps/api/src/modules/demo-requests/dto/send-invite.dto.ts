import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

export class SendInviteDto {
  @IsEmail({}, { message: "Geçerli bir e-posta giriniz" })
  @MaxLength(200)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
