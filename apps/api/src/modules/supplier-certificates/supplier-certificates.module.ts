import { Module } from "@nestjs/common";
import { SupplierAuthModule } from "../supplier-auth/supplier-auth.module";
import { SupplierCertificatesController } from "./controllers/supplier-certificates.controller";
import { SupplierCertificatesService } from "./services/supplier-certificates.service";

// G9 madde 26 — Tedarikçi sertifika/belgeleri.
@Module({
  imports: [SupplierAuthModule],
  controllers: [SupplierCertificatesController],
  providers: [SupplierCertificatesService],
})
export class SupplierCertificatesModule {}
