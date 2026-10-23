import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class ListAuditDto {
  // `company` bugünkü firma aktörü (yazım noktalarının çoğu); `tenant` /
  // `supplier` eski satırlar için kabul edilmeye devam eder.
  @IsOptional()
  @IsIn(["company", "tenant", "admin", "supplier", "system"])
  actorType?: string;

  @IsOptional()
  @IsString()
  action?: string;

  @IsOptional()
  @IsString()
  search?: string;

  // Tam sayı ve aralık DTO'da: eskiden `Number("abc")` = NaN ya da 1.5
  // Prisma'ya `skip`/`take` olarak gidip 400 yerine 500 veriyordu.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
