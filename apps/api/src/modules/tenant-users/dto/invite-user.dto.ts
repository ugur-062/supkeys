import { IsEmail, IsEnum, IsNotEmpty, MaxLength } from "class-validator";

export class InviteUserDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  @MaxLength(200)
  email!: string;

  @IsEnum(["COMPANY_ADMIN", "BUYER", "APPROVER"] as const, {
    message: "Geçerli bir rol seçin",
  })
  @IsNotEmpty()
  role!: "COMPANY_ADMIN" | "BUYER" | "APPROVER";
}
