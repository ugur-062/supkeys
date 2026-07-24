import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString, MaxLength } from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { AssistantService } from "./assistant.service";

class AssistantMessageDto {
  @IsOptional() @IsString() sessionId?: string;
  @IsString() @MaxLength(4000) message!: string;
}

/**
 * Faz AI-2 — asistan sohbeti. Guard zinciri AI-0 ile aynı (JWT + Silver+); SA/ST
 * koltuk kapısı serviste (assertAiAccess). Asistan sistemin OKUMA servislerini
 * kullanıcı kimliğiyle çağırır — yetki katmanı bedava çalışır; bağlayıcı yazma YOK.
 */
@Controller("company/ai/assistant")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard)
export class AssistantController {
  constructor(private readonly service: AssistantService) {}

  @Post("message")
  message(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: AssistantMessageDto,
  ) {
    return this.service.message(user, dto);
  }

  @Get("sessions")
  listSessions(@CurrentCompanyUser() user: AuthenticatedCompanyUser) {
    return this.service.listSessions(user);
  }

  @Get("sessions/:id")
  getSession(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.getSession(user, id);
  }

  @Delete("sessions/:id")
  deleteSession(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
  ) {
    return this.service.deleteSession(user, id);
  }
}
