import { IsIn, IsOptional, IsString } from "class-validator";

export class ListAuditDto {
  @IsOptional()
  @IsIn(["tenant", "admin", "supplier", "system"])
  actorType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  pageSize?: string;
}
