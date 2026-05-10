import { Global, Module } from "@nestjs/common";
import { CategoryController } from "./controllers/category.controller";
import { CategoryService } from "./services/category.service";

/**
 * V2-6 — `@Global` çünkü tedarikçi register, supplier profile, tender
 * create gibi birçok modül kategori validation/lookup için bu servisi
 * inject ediyor. Cycle önlemek için global.
 */
@Global()
@Module({
  providers: [CategoryService],
  controllers: [CategoryController],
  exports: [CategoryService],
})
export class CategoriesModule {}
