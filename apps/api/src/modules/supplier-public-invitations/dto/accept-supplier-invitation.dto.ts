import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";

export class AcceptSupplierInvitationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: "Şifre en az 1 büyük, 1 küçük harf ve 1 rakam içermeli",
  })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}
