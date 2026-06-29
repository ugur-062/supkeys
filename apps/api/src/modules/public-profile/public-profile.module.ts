import { Module } from "@nestjs/common";
import { PublicProfileController } from "./public-profile.controller";
import { PublicProfileService } from "./public-profile.service";

@Module({
  controllers: [PublicProfileController],
  providers: [PublicProfileService],
})
export class PublicProfileModule {}
