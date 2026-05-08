import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class StartDeliveryDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  deliveryNote?: string;

  @IsOptional()
  @IsDateString()
  expectedDeliveryDate?: string;
}
