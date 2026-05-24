import { Transform } from "class-transformer";
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";

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

  /**
   * Polish-1 — generic search across approvalNumber + tender.tenderNumber + tender.title
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsBooleanString()
  @Transform(({ value }) => (typeof value === "string" ? value : String(value)))
  pendingForMe?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
