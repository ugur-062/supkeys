import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import {
  CurrentCompanyUser,
  type AuthenticatedCompanyUser,
} from "../../company-auth/decorators/current-company-user.decorator";
import { CompanyJwtAuthGuard } from "../../company-auth/guards/company-jwt-auth.guard";
import { CompanyPaidTierGuard } from "../../company-auth/guards/company-paid-tier.guard";
import { AssistantActionsService } from "./assistant-actions.service";
import { AssistantService } from "./assistant.service";

class AssistantMessageDto {
  @IsOptional() @IsString() sessionId?: string;
  @IsOptional() @IsString() @MaxLength(4000) message?: string;
  /** AI-3 — ihale belgesi anahtarları (asistan içinden belge yükleme). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  fileKeys?: string[];
}

/**
 * Faz AI-2 — asistan sohbeti. Guard zinciri AI-0 ile aynı (JWT + Silver+); SA/ST
 * koltuk kapısı serviste (assertAiAccess). Asistan sistemin OKUMA servislerini
 * kullanıcı kimliğiyle çağırır — yetki katmanı bedava çalışır; bağlayıcı yazma YOK.
 */
@Controller("company/ai/assistant")
@UseGuards(CompanyJwtAuthGuard, CompanyPaidTierGuard)
export class AssistantController {
  constructor(
    private readonly service: AssistantService,
    private readonly actions: AssistantActionsService,
  ) {}

  /**
   * AI-4 — onay bekleyen aksiyonu YÜRÜT. Model bu endpoint'i çağıramaz;
   * yalnız kullanıcı jesti (CSRF'li mutasyon) tetikler. Tek kullanımlık.
   */
  @Post("sessions/:id/actions/:actionId/confirm")
  confirmAction(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("actionId") actionId: string,
  ) {
    return this.actions.confirm(user, id, actionId);
  }

  @Post("sessions/:id/actions/:actionId/reject")
  rejectAction(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Param("id") id: string,
    @Param("actionId") actionId: string,
  ) {
    return this.actions.reject(user, id, actionId);
  }

  @Post("message")
  message(
    @CurrentCompanyUser() user: AuthenticatedCompanyUser,
    @Body() dto: AssistantMessageDto,
  ) {
    return this.service.message(user, { ...dto, message: dto.message ?? "" });
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
