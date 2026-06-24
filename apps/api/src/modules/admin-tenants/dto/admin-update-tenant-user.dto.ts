import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from "class-validator";

export class AdminUpdateTenantUserDto {
  @IsOptional()
  @IsEnum(["COMPANY_ADMIN", "BUYER", "APPROVER"], {
    message: "Geçersiz rol",
  })
  role?: "COMPANY_ADMIN" | "BUYER" | "APPROVER";

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;
}
