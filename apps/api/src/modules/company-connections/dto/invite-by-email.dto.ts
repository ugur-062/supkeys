import { IsEmail, MaxLength } from "class-validator";

export class InviteByEmailDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  @MaxLength(200)
  email!: string;
}
