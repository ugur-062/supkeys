import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from "@nestjs/common";
import {
  CurrentUser,
  type AuthenticatedUser,
} from "../../../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { UpsertSupplierReviewDto } from "../dto/upsert-supplier-review.dto";
import { SupplierReviewsService } from "../services/supplier-reviews.service";

/**
 * V2-REVIEWS — Tenant (buyer) tarafı sipariş değerlendirme endpoint'leri.
 * Path: /api/tenants/me/orders/:orderId/review
 */
@UseGuards(JwtAuthGuard)
@Controller("tenants/me/orders/:orderId/review")
export class SupplierReviewsController {
  constructor(private readonly service: SupplierReviewsService) {}

  @Get()
  getOwnReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
  ) {
    return this.service.getOwnReview(user.tenantId, orderId);
  }

  @Put()
  upsertReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
    @Body() dto: UpsertSupplierReviewDto,
  ) {
    return this.service.upsertReview(user.tenantId, user.id, orderId, dto);
  }

  @Delete()
  deleteReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("orderId") orderId: string,
  ) {
    return this.service.deleteReview(user.tenantId, orderId);
  }
}
