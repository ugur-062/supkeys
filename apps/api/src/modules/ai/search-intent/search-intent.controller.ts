import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { IsIn, IsString, MaxLength } from "class-validator";
import type { AiSearchPortal } from "@rothern/shared";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { SEARCH_INTENT_MAX_TEXT, SearchIntentService } from "./search-intent.service";

class SearchIntentDto {
  @IsString() @MaxLength(SEARCH_INTENT_MAX_TEXT) text!: string;
  @IsIn(["satinalma", "satis"]) portal!: AiSearchPortal;
}

/**
 * `POST company/ai/search-intent` — AI arama (Silver+; koltuk rolü şartı
 * `assertAiAccess`te). Yazma yok; bütçe/tavanlar `AiService.callAi` kapısından.
 */
@Controller("company/ai")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard)
export class SearchIntentController {
  constructor(private readonly service: SearchIntentService) {}

  @Post("search-intent")
  interpret(@CurrentCompanyUser() user: AuthenticatedCompanyUser, @Body() dto: SearchIntentDto) {
    return this.service.interpret(user, dto);
  }
}
