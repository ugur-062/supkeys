import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export class PermissionsOverrideDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  added?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  removed?: string[];
}

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

  /**
   * V2-6.5 — RBAC override. null gönderilirse override silinir (saf role default
   * etkin olur); obje verilirse `added`/`removed` listeleri kabul edilir.
   * Service seviyesinde her permission string'i ALL_PERMISSIONS'a karşı doğrulanır.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => PermissionsOverrideDto)
  permissionsOverride?: PermissionsOverrideDto | null;
}
