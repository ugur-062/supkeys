import { Module } from "@nestjs/common";
import { PublicMarketplaceController } from "./public-marketplace.controller";
import { PublicMarketplaceService } from "./public-marketplace.service";

@Module({
  controllers: [PublicMarketplaceController],
  providers: [PublicMarketplaceService],
})
export class PublicMarketplaceModule {}
