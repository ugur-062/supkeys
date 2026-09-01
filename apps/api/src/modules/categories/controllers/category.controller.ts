import { Controller, Get, Header, Query } from "@nestjs/common";
import { parseCategoryCatalog } from "@rothern/shared";
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
   * Ağacın üst katmanı flat liste: L1 segment + L2 aile (~616 kayıt ≈ 90 KB).
   * L3/L4 `/children` ile açıldıkça inilir — bkz. `getAllActive` yorumu.
   * Cache-Control 60s — kategori güncellemesi max 1 dakikada tarayıcılarda
   * görünür.
   *
   * `catalog` parametresi YOK, bilinçli: iki katalog (tam / discovery) yalnız
   * L4 yaprakta ayrışıyor, L1-L2 kod ve ad olarak birebir aynı. Parametre
   * eklemek iki ayrı önbellek girdisi üretip aynı baytları iki kez indirtirdi.
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

  /**
   * Bir parent'ın direkt çocukları — L3 sınıf / L4 emtia lazy-load.
   *
   * `catalog=discovery` → talep/ilan kategori seçimi (Ariba Discovery alt
   * kümesi). Varsayılan `full` → firma kategori seçimi (tam katalog).
   * Önbellek ayrışması bedava: sorgu dizesi URL'in parçası, dolayısıyla iki
   * katalog zaten ayrı önbellek anahtarı.
   */
  @Get("children")
  @Header("Cache-Control", "public, max-age=60")
  children(
    @Query("parentId") parentId?: string,
    @Query("catalog") catalog?: string,
  ): Promise<unknown> {
    return this.service.childrenOf(
      parentId ?? "",
      parseCategoryCatalog(catalog),
    );
  }

  @Get("search-tree")
  @Header("Cache-Control", "no-cache")
  searchTree(
    @Query("q") query?: string,
    @Query("catalog") catalog?: string,
  ): Promise<unknown> {
    return this.service.searchHierarchical(
      query ?? "",
      parseCategoryCatalog(catalog),
    );
  }

  /**
   * Seçili kodların adı + breadcrumb'ı (chip etiketleri, ilan detayı).
   *
   * KATALOG SÜZGECİ YOK, bilinçli: burada iş KAYITLI bir kodu çözmek. Firma
   * discovery dışı bir yaprağı beyan edebiliyor; süzülseydi kendi seçtiği
   * kategori kendi ekranında "…" olarak görünürdü.
   */
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
