import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export class ListConnectionsDto {
  @IsOptional() @IsString() supplierId?: string;
  @IsOptional() @IsString() tenantId?: string;
  @IsOptional() @IsIn(["ACTIVE", "PENDING_TENANT_APPROVAL", "BLOCKED"]) status?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsString() page?: string;
  @IsOptional() @IsString() pageSize?: string;
}

export class UpdateConnectionDto {
  @IsIn(["ACTIVE", "BLOCKED"]) status!: "ACTIVE" | "BLOCKED";
  @IsOptional() @IsString() @MaxLength(500) blockedReason?: string;
}
