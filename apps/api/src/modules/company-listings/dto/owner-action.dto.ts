import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { tApi } from "../../../common/i18n/i18n.service";

export class AddInvitationsDto {
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @Type(() => String)
  rothernIds!: string[];
}

export class InternalNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string;
}

export class ChangeClosingDto {
  @IsISO8601(
    {},
    { message: () => tApi("api.dto.ownerAction.gecerliBirKapanisTarihiGirin") },
  )
  closesAt!: string;
}

export class ListingReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
