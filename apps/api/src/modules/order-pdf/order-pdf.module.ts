import { Module } from "@nestjs/common";
import { OrderPdfService } from "./order-pdf.service";

@Module({
  providers: [OrderPdfService],
  exports: [OrderPdfService],
})
export class OrderPdfModule {}
