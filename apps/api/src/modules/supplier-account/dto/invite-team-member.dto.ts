import { IsEmail, MaxLength } from "class-validator";

export class InviteTeamMemberDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  @MaxLength(160)
  email!: string;
}
