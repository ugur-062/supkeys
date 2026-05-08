import { Transform } from "class-transformer";
import { IsBooleanString, IsOptional, IsString, IsIn, MaxLength } from "class-validator";

export class ListApprovalRequestsDto {
  @IsOptional()
  @IsString()
  @IsIn(["PENDING", "APPROVED", "REJECTED", "CANCELLED"])
  status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

  @IsOptional()
  @IsString()
  @IsIn(["TENDER_PUBLISH", "TENDER_AWARD"])
  type?: "TENDER_PUBLISH" | "TENDER_AWARD";

  @IsOptional()
  @IsString()
  initiatorUserId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  tenderNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  approvalNumber?: string;

  @IsOptional()
  @IsBooleanString()
  @Transform(({ value }) => (typeof value === "string" ? value : String(value)))
  pendingForMe?: string;
}
