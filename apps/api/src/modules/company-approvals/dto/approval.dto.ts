import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { MAX_MONEY } from "../../../common/constants/money";

export enum ApprovalTypeDto {
  LISTING_PUBLISH = "LISTING_PUBLISH",
  LISTING_AWARD = "LISTING_AWARD",
}

export enum ApprovalFlowStatusDto {
  DRAFT = "DRAFT",
  ACTIVE = "ACTIVE",
  PASSIVE = "PASSIVE",
}

export enum ListingTypeDto {
  ALIM = "ALIM",
  SATIS = "SATIS",
}

export enum CompanyRoleDto {
  YONETICI = "YONETICI",
  SATIN_ALMACI = "SATIN_ALMACI",
  SATISCI = "SATISCI",
  ONAYLAYICI = "ONAYLAYICI",
}

export class ApprovalFlowStepDto {
  @IsString()
  approverUserId!: string;

  // Diagramda gösterilen yumuşak etiket (örn. "Satınalma Müdürü").
  @IsOptional()
  @IsString()
  @MaxLength(80)
  displayLabel?: string;

  // Bu eşik ALTINDAysa adım atlanır (SKIPPED). null = her zaman gerekli.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(MAX_MONEY)
  conditionMinAmount?: number;
}

export class CreateApprovalFlowDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsEnum(ApprovalTypeDto)
  type!: ApprovalTypeDto;

  // null/undefined → her iki ilan tipine uygulanır.
  @IsOptional()
  @IsEnum(ListingTypeDto)
  listingType?: ListingTypeDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsEnum(CompanyRoleDto, { each: true })
  initiatorRoles?: CompanyRoleDto[];

  @IsArray()
  @ArrayMinSize(1, { message: "En az bir onay adımı ekleyin" })
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ApprovalFlowStepDto)
  steps!: ApprovalFlowStepDto[];
}

export class UpdateApprovalFlowStatusDto {
  @IsEnum(ApprovalFlowStatusDto)
  status!: ApprovalFlowStatusDto;
}

export class DecideApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
