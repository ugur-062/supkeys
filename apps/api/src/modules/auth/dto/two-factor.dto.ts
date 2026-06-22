import { IsString, Length } from "class-validator";

export class VerifyOtpDto {
  @IsString()
  challengeId!: string;

  @IsString()
  @Length(6, 6, { message: "Doğrulama kodu 6 haneli olmalıdır" })
  code!: string;
}
