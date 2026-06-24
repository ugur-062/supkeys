import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const ORDER_STATUSES = [
  "PENDING",
  "ACCEPTED",
  "IN_DELIVERY",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
] as const;

export class AdminSetOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: (typeof ORDER_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class AdminSetPaymentStatusDto {
  @IsIn(["CONFIRMED", "REJECTED"])
  status!: "CONFIRMED" | "REJECTED";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
