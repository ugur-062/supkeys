import { Injectable, Logger } from "@nestjs/common";
import type { AiTenderDraftItem } from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { AiService } from "../ai.service";

/**
 * Kalemlerden UNSPSC kategori önerisi (family, level=2). Model platform
 * listesindeki 8-haneli KODLARDAN seçer (id uyduramaz); dönen kodlar DB
 * listesine karşı doğrulanıp id'ye çevrilir — geçmeyen sessizce elenir.
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
   * Kalem adlarından en fazla 3 doğrulanmış kategori id'si önerir.
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
      const categoryLines = families
        .map((f) => `${f.code} ${f.nameTr}`)
        .join("\n");
      const prompt = [
        "<kalemler>",
        itemLines,
        "</kalemler>",
        "",
        "<kategoriler>",
        categoryLines,
        "</kategoriler>",
        "",
        `Bu kalemler için en uygun en fazla ${MAX_SUGGESTIONS} kategori kodunu seç.`,
      ].join("\n");

      const result = await this.ai.callAi(user, {
        feature: "tender_extract",
        prompt,
        system: SYSTEM_PROMPT,
        responseSchema: RESPONSE_SCHEMA as unknown as object,
        metadata: { route: "category_suggest", itemCount: named.length },
      });

      const parsed: unknown = JSON.parse(result.text);
      const codes = Array.isArray((parsed as { codes?: unknown })?.codes)
        ? ((parsed as { codes: unknown[] }).codes as unknown[])
        : [];
      const byCode = new Map(families.map((f) => [f.code, f.id]));
      const ids: string[] = [];
      for (const c of codes) {
        const id = typeof c === "string" ? byCode.get(c.trim()) : undefined;
        if (id && !ids.includes(id)) ids.push(id);
        if (ids.length >= MAX_SUGGESTIONS) break;
      }
      return ids;
    } catch (err) {
      // Öneri "nice-to-have" — başarısızlık çıkarımı/asistan turunu düşürmez.
      this.logger.warn(
        `Kategori önerisi başarısız: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
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
