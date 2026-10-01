import { Module } from "@nestjs/common";
import { PanelRelatedProductsController } from "./panel-related-products.controller";
import { PublicProfileController } from "./public-profile.controller";
import { PublicProfileService } from "./public-profile.service";

@Module({
  controllers: [PublicProfileController, PanelRelatedProductsController],
  providers: [PublicProfileService],
})
export class PublicProfileModule {}
