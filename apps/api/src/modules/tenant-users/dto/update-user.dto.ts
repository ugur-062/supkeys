import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";

/**
 * COMPANY_ADMIN tarafından kullanılır — başka bir kullanıcı veya kendi kişisel bilgileri.
 * Self-update tarafında controller `role` ve `isActive` alanlarını strip eder.
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsEnum(["COMPANY_ADMIN", "BUYER", "APPROVER"] as const)
  role?: "COMPANY_ADMIN" | "BUYER" | "APPROVER";

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
