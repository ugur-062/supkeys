import { Injectable, Logger } from "@nestjs/common";
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

/**
 * Öneri yalnız ad+açıklama okur — hem tam AiTenderDraftItem (belge/asistan
 * akışı) hem wizard'ın küçük DTO'su yapısal olarak uyar.
 */
export type SuggestItem = {
  name: string | null;
  description?: string | null;
};

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

/** Son aşama (class) — kategori kodlarına ek arama anahtar kelimeleri. */
const MAX_KEYWORDS = 8;
const RESPONSE_SCHEMA_WITH_KEYWORDS = {
  type: "object",
  properties: {
    codes: {
      type: "array",
      items: { type: "string" },
      maxItems: MAX_SUGGESTIONS,
    },
    keywords: {
      type: "array",
      items: { type: "string" },
      maxItems: MAX_KEYWORDS,
    },
  },
  required: ["codes", "keywords"],
} as const;

const SYSTEM_PROMPT = [
  "Bir B2B satınalma platformu için kategori eşleştirme yaparsın.",
  "Sana ihale kalemleri ve platformun UNSPSC kategori listesi verilir.",
  "Kalemlerin TAMAMINI kapsayan EN AZ SAYIDA kategori KODU seç —",
  "tek kategori yeterliyse YALNIZ onu döndür (en fazla 3).",
  "Fazladan 'ilgili olabilir' kategorisi EKLEME; her kategori en az bir",
  "kalemi doğrudan kapsamalı.",
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
   * Wizard'ın "kalemlerden otomatik kategori" ucu — suggest()'ten farkı:
   * erişim kapısı (Silver+ ∧ SA/ST koltuk, AI yapılandırılmış) AÇIKÇA burada
   * fırlatılır (403/503). suggest() tüm hataları [] olarak yuttuğundan,
   * yetkisiz çağrı sessiz 200 yerine net hata alsın diye kapı try dışında.
   * Kapıdan geçen kullanıcıda model/bütçe hataları yine boş öneriye düşer.
   */
  async suggestForItems(
    user: AuthenticatedCompanyUser,
    items: SuggestItem[],
  ): Promise<{ categoryIds: string[]; keywords: string[] }> {
    this.ai.assertAiAccess(user);
    return this.suggestFull(user, items);
  }

  /**
   * Kalem adlarından en fazla 3 doğrulanmış CLASS (level=3) id'si önerir.
   * Boş dizi = öneri yok (hata dahil) — çağıran akış aynen devam eder.
   * (Belge/asistan akışı yalnız kategori ister; keywords wizard ucuna özel.)
   */
  async suggest(
    user: AuthenticatedCompanyUser,
    items: SuggestItem[],
  ): Promise<string[]> {
    return (await this.suggestFull(user, items)).categoryIds;
  }

  private async suggestFull(
    user: AuthenticatedCompanyUser,
    items: SuggestItem[],
  ): Promise<{ categoryIds: string[]; keywords: string[] }> {
    const empty = { categoryIds: [], keywords: [] };
    const named = items.filter((i) => i.name).slice(0, MAX_ITEMS_IN_PROMPT);
    if (named.length === 0) return empty;

    try {
      const families = await this.loadFamilies();
      if (families.length === 0) return empty;

      const itemLines = named
        .map((i) => `- ${i.name}${i.description ? ` (${i.description.slice(0, 120)})` : ""}`)
        .join("\n");

      // Aşama 1 — family daralt (452 satırlık geniş liste, ucuz tek çağrı).
      // Sabit tavan YOK (yalnız MAX_SUGGESTIONS): "en az sayıda" kararı
      // modelde — tek kategori kalemleri kapsıyorsa fazladan eklememesi
      // system prompt'ta açıkça istenir.
      const { ids: familyCodes } = await this.pickCodes(user, {
        itemLines,
        rows: families,
        ask: `Bu kalemler için kalemlerin tamamını kapsayan EN AZ SAYIDA (tek kategori yeterliyse yalnız 1, en fazla ${MAX_SUGGESTIONS}) ÜST kategori kodunu seç.`,
        stage: "family",
      });
      if (familyCodes.length === 0) return empty;

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
      if (classes.length === 0) return empty;
      const { ids: classCodes, keywords } = await this.pickCodes(user, {
        itemLines,
        rows: classes,
        ask: [
          `Bu kalemler için kalemlerin tamamını kapsayan EN AZ SAYIDA (tek kategori yeterliyse yalnız 1, en fazla ${MAX_SUGGESTIONS}) DETAY kategori kodunu seç.`,
          `Ayrıca kalemlerden, ihale aramasında kullanılacak ${MAX_KEYWORDS} adede kadar kısa Türkçe anahtar kelime üret (ürün/hizmet adları; marka ve genel sözcük yazma).`,
        ].join(" "),
        stage: "class",
        collectKeywords: true,
      });
      return { categoryIds: classCodes, keywords };
    } catch (err) {
      // Öneri "nice-to-have" — başarısızlık çıkarımı/asistan turunu düşürmez.
      this.logger.warn(
        `Kategori önerisi başarısız: ${err instanceof Error ? err.message : String(err)}`,
      );
      return empty;
    }
  }

  /**
   * Tek aşama: verilen kod listesinden modele seçim yaptır, DB'ye karşı
   * doğrula. collectKeywords ile son aşamada arama anahtar kelimeleri de
   * aynı çağrıda toplanır (ekstra AI çağrısı yok).
   */
  private async pickCodes(
    user: AuthenticatedCompanyUser,
    opts: {
      itemLines: string;
      rows: FamilyRow[];
      ask: string;
      stage: "family" | "class";
      collectKeywords?: boolean;
    },
  ): Promise<{ ids: string[]; keywords: string[] }> {
    const categoryLines = opts.rows
      .map((r) => `${r.code} ${r.nameTr}`)
      .join("\n");
    const result = await this.ai.callAi(user, {
      feature: "tender_extract",
      prompt: buildPrompt(opts.itemLines, categoryLines, opts.ask),
      system: SYSTEM_PROMPT,
      responseSchema: (opts.collectKeywords
        ? RESPONSE_SCHEMA_WITH_KEYWORDS
        : RESPONSE_SCHEMA) as unknown as object,
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

    // Anahtar kelimeler: string olmayanlar/boşlar elenir, 50 karaktere
    // kırpılır, tekilleştirilir (ihale keywords alanının kuralları).
    const rawKw = opts.collectKeywords
      ? (parsed as { keywords?: unknown })?.keywords
      : undefined;
    const keywords: string[] = [];
    if (Array.isArray(rawKw)) {
      for (const k of rawKw) {
        if (typeof k !== "string") continue;
        const t = k.trim().slice(0, 50);
        if (t && !keywords.includes(t)) keywords.push(t);
        if (keywords.length >= MAX_KEYWORDS) break;
      }
    }
    return { ids, keywords };
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
