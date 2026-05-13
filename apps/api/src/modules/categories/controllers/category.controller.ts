import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Query,
} from "@nestjs/common";
import { CategoryService } from "../services/category.service";

/**
 * V2-6 — Public kategori endpoint'leri (auth gerekmez).
 * Lazy loading: roots → children → search.
 */
@Controller("categories")
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  @Get("roots")
  @Header("Cache-Control", "public, max-age=3600")
  getRoots(): Promise<unknown> {
    return this.service.getRoots();
  }

  @Get("children")
  @Header("Cache-Control", "public, max-age=3600")
  getChildren(@Query("parentId") parentId?: string): Promise<unknown> {
    if (!parentId || !parentId.trim()) {
      throw new BadRequestException("parentId zorunlu");
    }
    return this.service.getChildren(parentId.trim());
  }

  @Get("search")
  search(@Query("q") query?: string): Promise<unknown> {
    return this.service.search(query ?? "");
  }

  @Get("search-tree")
  @Header("Cache-Control", "no-cache")
  searchTree(@Query("q") query?: string): Promise<unknown> {
    return this.service.searchHierarchical(query ?? "");
  }

  @Get("by-ids")
  getByIds(@Query("ids") idsParam?: string): Promise<unknown> {
    const ids = idsParam
      ? idsParam
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    return this.service.getByIds(ids);
  }
}
