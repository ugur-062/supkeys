import { Module } from "@nestjs/common";
import { MemberProductDocumentsController } from "./member-product-documents.controller";
import { PanelRelatedProductsController } from "./panel-related-products.controller";
import { PublicProfileController } from "./public-profile.controller";
import { PublicProfileService } from "./public-profile.service";

@Module({
  controllers: [PublicProfileController, PanelRelatedProductsController, MemberProductDocumentsController],
  providers: [PublicProfileService],
})
export class PublicProfileModule {}
