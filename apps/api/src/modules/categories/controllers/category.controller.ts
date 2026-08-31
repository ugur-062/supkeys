import { Controller, Get, Header, Query } from "@nestjs/common";
import { CategoryService } from "../services/category.service";

/**
 * V2-6 — Public kategori endpoint'leri (auth gerekmez).
 *
 * V2-6.5 değişikliği: lazy /roots + /children mimarisi /all'a taşındı.
 * Frontend tek fetch ile tüm tree'yi alır, in-memory traverse yapar.
 * Eski /roots ve /children endpoint'leri kaldırıldı (kullanıcı yok).
 */
@Controller("categories")
export class CategoryController {
  constructor(private readonly service: CategoryService) {}

  /**
   * Tüm aktif kategoriler flat liste. ~2284 kayıt × ~80 byte ≈ ~180KB JSON.
   * Cache-Control 60s — kategori ekleme/güncelleme sonrası max 1 dakikada
   * tarayıcılarda görünür.
   */
  @Get("all")
  @Header("Cache-Control", "public, max-age=60")
  getAll(): Promise<unknown> {
    return this.service.getAllActive();
  }

  /**
   * Yalnız segmentler (L1) — `/all`'ın ~180 KB'lık ağacına ihtiyaç duymayan
   * ekranlar için (onboarding, profil kategori seçimi). Perf turu, P10.
   */
  @Get("segments")
  @Header("Cache-Control", "public, max-age=300")
  getSegments(): Promise<unknown> {
    return this.service.getSegments();
  }

  /** Bir parent'ın direkt çocukları — L4 commodity lazy-load. */
  @Get("children")
  @Header("Cache-Control", "public, max-age=60")
  children(@Query("parentId") parentId?: string): Promise<unknown> {
    return this.service.childrenOf(parentId ?? "");
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
