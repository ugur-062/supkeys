import { Global, Module } from "@nestjs/common";
import { GeoController } from "./geo.controller";
import { GeoCityService } from "./geo-city.service";

/** GLOBAL: yazma yolları (kayıt, profil, adres, admin) `GeoCityService` enjekte eder. */
@Global()
@Module({
  controllers: [GeoController],
  providers: [GeoCityService],
  exports: [GeoCityService],
})
export class GeoModule {}
