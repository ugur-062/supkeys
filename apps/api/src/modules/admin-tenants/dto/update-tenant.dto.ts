import { IsInt, IsOptional, Max, Min } from "class-validator";

export class UpdateTenantDto {
  // V2-6.5 — BUYER (Satın Almacı) kontenjanı. 0 = davete kapalı.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  buyerSeatLimit?: number;
}
