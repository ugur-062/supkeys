import { Module } from "@nestjs/common";
import { PublicMarketplaceController } from "./public-marketplace.controller";
import { PublicMarketplaceService } from "./public-marketplace.service";
import { PublicSitemapController } from "./public-sitemap.controller";
import { PublicSitemapService } from "./public-sitemap.service";

@Module({
  controllers: [PublicMarketplaceController, PublicSitemapController],
  providers: [PublicMarketplaceService, PublicSitemapService],
})
export class PublicMarketplaceModule {}
