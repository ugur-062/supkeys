import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  MaxLength,
} from "class-validator";

export class InviteByEmailDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  @MaxLength(200)
  email!: string;
}

/** Toplu e-posta daveti — eski sistem paritesi (50'ye kadar). */
export class InviteByEmailBatchDto {
  @IsArray()
  @ArrayMinSize(1, { message: "En az bir e-posta girin" })
  @ArrayMaxSize(50, { message: "Tek seferde en fazla 50 e-posta" })
  @IsEmail({}, { each: true, message: "Geçersiz e-posta adresi var" })
  @MaxLength(200, { each: true })
  emails!: string[];
}

/** Faz C — dış ihale daveti: ihale + en fazla 20 e-posta. */
export class ExternalTenderInviteDto {
  @IsString()
  listingId!: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  emails!: string[];
}
