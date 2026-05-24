import { IsEmail, IsOptional, IsString, MaxLength } from "class-validator";

/**
 * V2-7 — İhaleye e-posta ile tedarikçi daveti (kayıtsız veya bağlı olmayan
 * kayıtlı tedarikçi). Kabul edilince otomatik TenderInvitation oluşur.
 */
export class InviteByEmailDto {
  @IsEmail({}, { message: "Geçerli bir e-posta adresi girin" })
  @MaxLength(255)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}
