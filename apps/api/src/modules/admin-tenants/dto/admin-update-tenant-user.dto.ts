import { IsBoolean, IsEnum, IsOptional } from "class-validator";

export class AdminUpdateTenantUserDto {
  @IsOptional()
  @IsEnum(["COMPANY_ADMIN", "BUYER", "APPROVER"], {
    message: "Geçersiz rol",
  })
  role?: "COMPANY_ADMIN" | "BUYER" | "APPROVER";

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
