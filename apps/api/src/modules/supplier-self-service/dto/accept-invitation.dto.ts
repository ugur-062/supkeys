import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class AcceptInvitationDto {
  /** Ham 64 karakterlik invite token (URL'den gelirse) */
  @IsOptional()
  @IsString()
  @MinLength(64)
  @MaxLength(64)
  invitationToken?: string;

  /**
   * Manuel girilen kısa kod (örn `K7X9-3M2P`).
   * Backend validasyonu: 4-1-4 format kontrolü ek olarak servis içinde yapılır.
   */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  shortCode?: string;
}
