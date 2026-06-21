import { IsNotEmpty, IsString, MaxLength } from "class-validator";

/**
 * Faz 3 madde 16 — Tedarikçi ödemeyi almadığını bildirir (sebep zorunlu).
 */
export class RejectOrderPaymentDto {
  @IsString()
  @IsNotEmpty({ message: "Red sebebi zorunludur" })
  @MaxLength(1000)
  reason!: string;
}
