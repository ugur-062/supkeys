import { Injectable, Logger } from "@nestjs/common";
import type { AiTenderDraftItem } from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { AiService } from "../ai.service";

/**
 * Kalemlerden UNSPSC kategori önerisi — İKİ AŞAMALI, sonuç CLASS (level=3):
 *   1) 452 family (L2) listesinden en uygun ≤3 family daraltılır (ucuz, geniş liste)
 *   2) yalnız o family'lerin Class (L3) çocukları listelenir, ≤3 Class seçilir
 * İhale oluşturma doğrulaması kategoride EN AZ level 3 istediğinden (company-
 * listings.service `level: { gte: 3 }`) öneri de L3 döner — L2 önerisi yayında
 * reddedilirdi. Model platform listesindeki 8-haneli KODLARDAN seçer (id
 * uyduramaz); dönen kodlar DB listesine karşı doğrulanıp id'ye çevrilir.
 * Öneri BAĞLAYICI DEĞİL: formda ön-seçim, son karar kullanıcının.
 * Hata/parse sorunu taslağı düşürmez — boş öneriyle devam edilir.
 */

const MAX_SUGGESTIONS = 3;
const MAX_ITEMS_IN_PROMPT = 40;
/** Kategori listesi nadiren değişir (admin seed) — bellekte tutulur. */
const FAMILY_CACHE_TTL_MS = 60 * 60 * 1000;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    codes: {
      type: "array",
      items: { type: "string" },
      maxItems: MAX_SUGGESTIONS,
    },
  },
  required: ["codes"],
} as const;

const SYSTEM_PROMPT = [
  "Bir B2B satınalma platformu için kategori eşleştirme yaparsın.",
  "Sana ihale kalemleri ve platformun UNSPSC kategori listesi verilir.",
  "Kalemlerin TAMAMINI en iyi kapsayan en fazla 3 kategori KODU seç.",
  "YALNIZ verilen listedeki kodları kullan; emin olmadığın kodu yazma.",
  "Hiçbiri uymuyorsa boş dizi döndür.",
].join(" ");

/** Aşama prompt gövdesi — kalemler + kod listesi (iki aşamada da aynı kalıp). */
function buildPrompt(
  itemLines: string,
  categoryLines: string,
  ask: string,
): string {
  return [
    "<kalemler>",
    itemLines,
    "</kalemler>",
    "",
    "<kategoriler>",
    categoryLines,
    "</kategoriler>",
    "",
    ask,
  ].join("\n");
}

interface FamilyRow {
  id: string;
  code: string;
  nameTr: string;
}

@Injectable()
export class CategorySuggestService {
  private readonly logger = new Logger(CategorySuggestService.name);
  private familyCache: { rows: FamilyRow[]; loadedAt: number } | null = null;

  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Kalem adlarından en fazla 3 doğrulanmış CLASS (level=3) id'si önerir.
   * Boş dizi = öneri yok (hata dahil) — çağıran akış aynen devam eder.
   */
  async suggest(
    user: AuthenticatedCompanyUser,
    items: AiTenderDraftItem[],
  ): Promise<string[]> {
    const named = items.filter((i) => i.name).slice(0, MAX_ITEMS_IN_PROMPT);
    if (named.length === 0) return [];

    try {
      const families = await this.loadFamilies();
      if (families.length === 0) return [];

      const itemLines = named
        .map((i) => `- ${i.name}${i.description ? ` (${i.description.slice(0, 120)})` : ""}`)
        .join("\n");

      // Aşama 1 — family daralt (452 satırlık geniş liste, ucuz tek çağrı).
      const familyCodes = await this.pickCodes(user, {
        itemLines,
        rows: families,
        ask: `Bu kalemler için en uygun en fazla ${MAX_SUGGESTIONS} ÜST kategori kodunu seç.`,
        stage: "family",
      });
      if (familyCodes.length === 0) return [];

      // Aşama 2 — yalnız seçilen family'lerin Class (L3) çocuklarından seç.
      const classes = await this.prisma.category.findMany({
        where: {
          level: 3,
          isActive: true,
          parentId: { in: familyCodes },
        },
        orderBy: { sortOrder: "asc" },
        select: { id: true, code: true, nameTr: true },
      });
      if (classes.length === 0) return [];
      const classCodes = await this.pickCodes(user, {
        itemLines,
        rows: classes,
        ask: `Bu kalemler için en uygun en fazla ${MAX_SUGGESTIONS} DETAY kategori kodunu seç.`,
        stage: "class",
      });
      return classCodes;
    } catch (err) {
      // Öneri "nice-to-have" — başarısızlık çıkarımı/asistan turunu düşürmez.
      this.logger.warn(
        `Kategori önerisi başarısız: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /** Tek aşama: verilen kod listesinden modele seçim yaptır, DB'ye karşı doğrula. */
  private async pickCodes(
    user: AuthenticatedCompanyUser,
    opts: {
      itemLines: string;
      rows: FamilyRow[];
      ask: string;
      stage: "family" | "class";
    },
  ): Promise<string[]> {
    const categoryLines = opts.rows
      .map((r) => `${r.code} ${r.nameTr}`)
      .join("\n");
    const result = await this.ai.callAi(user, {
      feature: "tender_extract",
      prompt: buildPrompt(opts.itemLines, categoryLines, opts.ask),
      system: SYSTEM_PROMPT,
      responseSchema: RESPONSE_SCHEMA as unknown as object,
      metadata: { route: "category_suggest", stage: opts.stage },
    });
    const parsed: unknown = JSON.parse(result.text);
    const codes = Array.isArray((parsed as { codes?: unknown })?.codes)
      ? ((parsed as { codes: unknown[] }).codes as unknown[])
      : [];
    const byCode = new Map(opts.rows.map((r) => [r.code, r.id]));
    const ids: string[] = [];
    for (const c of codes) {
      const id = typeof c === "string" ? byCode.get(c.trim()) : undefined;
      if (id && !ids.includes(id)) ids.push(id);
      if (ids.length >= MAX_SUGGESTIONS) break;
    }
    return ids;
  }

  private async loadFamilies(): Promise<FamilyRow[]> {
    const now = Date.now();
    if (this.familyCache && now - this.familyCache.loadedAt < FAMILY_CACHE_TTL_MS) {
      return this.familyCache.rows;
    }
    const rows = await this.prisma.category.findMany({
      where: { level: 2, isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, code: true, nameTr: true },
    });
    this.familyCache = { rows, loadedAt: now };
    return rows;
  }
}
