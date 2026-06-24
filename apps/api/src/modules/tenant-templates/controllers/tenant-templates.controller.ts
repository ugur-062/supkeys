import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import {
  PermissionsGuard,
  RequirePermissions,
} from "../../auth/permissions/permissions.guard";
import {
  CreateQuestionTemplateDto,
  UpdateQuestionTemplateDto,
} from "../dto/question-template.dto";
import {
  CreateSupplierTemplateDto,
  UpdateSupplierTemplateDto,
} from "../dto/supplier-template.dto";
import { CreateTenderTemplateDto } from "../dto/tender-template.dto";
import { QuestionTemplatesService } from "../services/question-templates.service";
import { SupplierTemplatesService } from "../services/supplier-templates.service";
import { TenderTemplatesService } from "../services/tender-templates.service";

@Controller("tenants/me/templates")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TenantTemplatesController {
  constructor(
    private readonly questions: QuestionTemplatesService,
    private readonly suppliers: SupplierTemplatesService,
    private readonly tenders: TenderTemplatesService,
  ) {}

  // -------------------- KALEM SORUSU ŞABLONLARI --------------------

  @Get("item-questions")
  @RequirePermissions("templates:view")
  listQuestions(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.questions.list(user.tenantId, user.id);
  }

  @Get("item-questions/:id")
  @RequirePermissions("templates:view")
  getQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.questions.findOne(user.tenantId, user.id, id);
  }

  @Post("item-questions")
  @RequirePermissions("templates:edit")
  createQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateQuestionTemplateDto,
  ): Promise<unknown> {
    return this.questions.create(user.tenantId, user.id, dto);
  }

  @Patch("item-questions/:id")
  @RequirePermissions("templates:edit")
  updateQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateQuestionTemplateDto,
  ): Promise<unknown> {
    return this.questions.update(user.tenantId, user.id, id, dto);
  }

  @Delete("item-questions/:id")
  @RequirePermissions("templates:edit")
  deleteQuestion(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.questions.delete(user.tenantId, user.id, id);
  }

  // -------------------- TEDARİKÇİ ŞABLONLARI --------------------

  @Get("suppliers")
  @RequirePermissions("templates:view")
  listSuppliers(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.suppliers.list(user.tenantId, user.id);
  }

  @Get("suppliers/:id")
  @RequirePermissions("templates:view")
  getSupplier(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.suppliers.findOne(user.tenantId, user.id, id);
  }

  @Post("suppliers")
  @RequirePermissions("templates:edit")
  createSupplier(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSupplierTemplateDto,
  ): Promise<unknown> {
    return this.suppliers.create(user.tenantId, user.id, dto);
  }

  @Patch("suppliers/:id")
  @RequirePermissions("templates:edit")
  updateSupplier(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateSupplierTemplateDto,
  ): Promise<unknown> {
    return this.suppliers.update(user.tenantId, user.id, id, dto);
  }

  @Delete("suppliers/:id")
  @RequirePermissions("templates:edit")
  deleteSupplier(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.suppliers.delete(user.tenantId, user.id, id);
  }

  // -------------------- İHALE ŞABLONLARI (madde 34) --------------------

  @Get("tenders")
  @RequirePermissions("templates:view")
  listTenders(@CurrentUser() user: AuthenticatedUser): Promise<unknown> {
    return this.tenders.list(user.tenantId, user.id);
  }

  @Get("tenders/:id")
  @RequirePermissions("templates:view")
  getTender(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.tenders.findOne(user.tenantId, user.id, id);
  }

  @Post("tenders")
  @RequirePermissions("templates:edit")
  createTender(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTenderTemplateDto,
  ): Promise<unknown> {
    return this.tenders.create(user.tenantId, user.id, dto);
  }

  @Delete("tenders/:id")
  @RequirePermissions("templates:edit")
  deleteTender(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<unknown> {
    return this.tenders.delete(user.tenantId, user.id, id);
  }
}
