import { IsEnum, IsString, Length } from "class-validator";

export enum VerifyEmailType {
  BUYER = "buyer",
  SUPPLIER = "supplier",
}

export class VerifyEmailDto {
  @IsString()
  @Length(64, 64, { message: "Geçersiz token formatı" })
  token!: string;

  @IsEnum(VerifyEmailType)
  type!: VerifyEmailType;
}
