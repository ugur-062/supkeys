import { Controller, Get, Header, Query } from "@nestjs/common";
import { CategoryService } from "../services/category.service";

/**
 * V2-6 — Public kategori endpoint'leri (auth gerekmez).
 * Frontend kategori seçici accordion + autocomplete'i bunları çağırır.
 */
@Controller("categories")
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  @Get()
  @Header("Cache-Control", "public, max-age=3600")
  getTree(): Promise<unknown> {
    return this.service.getTree();
  }

  @Get("search")
  search(@Query("q") query: string): Promise<unknown> {
    return this.service.search(query ?? "");
  }
}
