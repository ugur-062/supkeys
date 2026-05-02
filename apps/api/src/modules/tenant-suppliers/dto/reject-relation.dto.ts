import { IsOptional, IsString, MaxLength } from "class-validator";

export class RejectRelationDto {
  /**
   * Tedarikçiye iletilen sebep (opsiyonel). Verilmezse "Alıcı tarafından
   * reddedildi" varsayılan kullanılır.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
