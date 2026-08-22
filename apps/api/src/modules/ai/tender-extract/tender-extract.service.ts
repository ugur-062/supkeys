import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { AiTenderExtractResult } from "@rothern/shared";
import {
  assertReportedSize,
  assertSafeFileName,
} from "../../../common/helpers/upload-validation";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { StorageService } from "../../storage/storage.service";
import { AiService, type AiCallResult } from "../ai.service";
import { AI_CONFIG, type AiConfig } from "../ai.config";
import { buildAiExtractKey, isOwnAiExtractKey } from "./ai-extract-keys";
import { routeExtractInput, type RoutedInput } from "./ai-extract-router";
import { sanitizeAiDraft, type SanitizedDraft } from "./ai-draft-sanitizer";
import { CategorySuggestService } from "./category-suggest.service";
import {
  EXTRACT_RESPONSE_SCHEMA,
  EXTRACT_SYSTEM_PROMPT,
  REFINE_SYSTEM_PROMPT,
  buildExtractPrompt,
  buildRefinePrompt,
} from "./tender-extract.prompts";

/**
 * Faz AI-1 — belge/fotoğraf → ihale formu doldurma. AI FORM DOLDURUR, İHALE
 * AÇMAZ — oluşturma kullanıcının "Oluştur"uyla mevcut POST /company/listings
 * kapılarından (Silver+, SA/ST, KYC, onay) geçer; hiçbiri baypas edilmez.
 *
 * BİR KEZ OKU, JSON'LA KONUŞ: belge tek kez okunur (extract). refine() yalnız
 * taslak JSON + pageSummaries üstünden çalışır — belge modele bir daha
 * GÖNDERİLMEZ (naif yaklaşım 3-5 kat pahalı olurdu).
 */

const ALLOWED_UPLOAD_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  // 2026-08-22: serbest Excel/CSV tablo da AI ile okunur (şablon Excel AI'sız yoldan).
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

@Injectable()
export class TenderExtractService {
  private readonly logger = new Logger(TenderExtractService.name);

  constructor(
    private readonly ai: AiService,
    private readonly storage: StorageService,
    private readonly categorySuggest: CategorySuggestService,
    @Inject(AI_CONFIG) private readonly config: AiConfig,
  ) {}

  /** Kalemlerden kategori önerisi ekle — öneri geldiyse "Kategori" artık eksik
   *  zorunlu değil (formda ön-dolu gelir, kullanıcı kontrol eder). */
  private async withCategorySuggestions(
    user: AuthenticatedCompanyUser,
    sanitized: SanitizedDraft,
  ): Promise<SanitizedDraft> {
    if (sanitized.draft.suggestedCategoryIds.length > 0) return sanitized;
    const ids = await this.categorySuggest.suggest(user, sanitized.draft.items);
    if (ids.length === 0) return sanitized;
    return {
      ...sanitized,
      draft: { ...sanitized.draft, suggestedCategoryIds: ids },
      missingRequired: sanitized.missingRequired.filter(
        (m) => !m.startsWith("Kategori"),
      ),
    };
  }

  /** Presigned PUT — geçici AI belge alanına (24h TTL, private bucket). */
  async uploadUrl(
    user: AuthenticatedCompanyUser,
    dto: { fileName: string; mimeType: string; fileSize?: number },
  ) {
    this.ai.assertAiAccess(user);
    if (!ALLOWED_UPLOAD_MIMES.includes(dto.mimeType)) {
      throw new BadRequestException(
        "Sadece PDF veya fotoğraf (JPG/PNG/WebP/HEIC) yüklenebilir",
      );
    }
    assertSafeFileName(dto.fileName);
    assertReportedSize(dto.fileSize);
    const key = buildAiExtractKey(user.companyId, dto.fileName);
    const url = await this.storage.generatePresignedPut("private", key, dto.mimeType);
    return { url, key };
  }

  async extract(
    user: AuthenticatedCompanyUser,
    dto: { fileKeys: string[]; listingType: "ALIM" | "SATIS" },
  ): Promise<AiTenderExtractResult> {
    // Erişim kapısı EN BAŞTA — yetkisiz istek için dosya işlemeyiz bile.
    this.ai.assertAiAccess(user);

    // IDOR: anahtarlar yalnız BU firmanın ai-extract klasöründen olabilir.
    for (const key of dto.fileKeys) {
      if (!isOwnAiExtractKey(key, user.companyId)) {
        throw new BadRequestException("Geçersiz dosya anahtarı");
      }
    }
    if (dto.fileKeys.length === 0) {
      throw new BadRequestException("En az bir dosya seçin");
    }
    if (dto.fileKeys.length > this.config.maxPages) {
      throw new BadRequestException(
        `Belge çok uzun (en fazla ${this.config.maxPages} dosya) — ilgili bölümü seçin`,
      );
    }

    const files = await Promise.all(
      dto.fileKeys.map(async (key) => {
        try {
          return { key, buffer: await this.storage.getObject("private", key) };
        } catch {
          throw new BadRequestException(
            "Dosya yüklenmemiş görünüyor — lütfen tekrar deneyin",
          );
        }
      }),
    );

    // Girdi yönlendirici: metinli PDF → TEXT; taranmış PDF → PDF vision;
    // fotoğraf → küçültülmüş görüntü vision. Seçilen yol metadata'ya loglanır.
    const routed: RoutedInput = await routeExtractInput(files, this.config.maxPages);

    const prompt = buildExtractPrompt({
      listingType: dto.listingType,
      documentText: routed.documentText,
    });
    const callOptions = {
      feature: "tender_extract",
      prompt,
      system: EXTRACT_SYSTEM_PROMPT,
      vision: routed.route !== "text",
      parts: routed.parts,
      responseSchema: EXTRACT_RESPONSE_SCHEMA as unknown as object,
      // Gecikme/boş-yanıt: belge çıkarımı için "low" (bkz. AiCallOptions.thinkingLevel).
      thinkingLevel: "low" as const,
      extraInputTokenEstimate: routed.extraInputTokenEstimate,
      metadata: {
        route: routed.route,
        pages: routed.pages,
        textPages: routed.textPages,
        scanPages: routed.scanPages,
      },
    };

    let result: AiCallResult = await this.ai.callAi(user, callOptions);
    let parsed = this.tryParse(result.text);

    // Kısmi başarısızlık: JSON bozuk/boş → 1 otomatik premium retry (AI-0
    // yükseltme kuralı 2: "Flash düşük güvenle döndü").
    if (parsed == null) {
      this.logger.warn(
        `tender_extract: JSON parse edilemedi — premium retry (finish=${result.finishReason ?? "?"} outTok=${result.outputTokens ?? "?"} len=${result.text.length} head="${result.text.slice(0, 120).replace(/\s+/g, " ")}")`,
      );
      result = await this.ai.callAi(user, {
        ...callOptions,
        premiumRetry: true,
        metadata: { ...callOptions.metadata, retry: true },
      });
      parsed = this.tryParse(result.text);
    }

    if (parsed == null) {
      // Boş taslak + uyarı — wizard yine açılır, kullanıcı elle doldurur.
      const empty = sanitizeAiDraft({}, routed.route);
      return {
        ...empty,
        route: routed.route,
        downgraded: result.downgraded,
        warned: result.warned,
      };
    }

    const sanitized = await this.withCategorySuggestions(
      user,
      sanitizeAiDraft(parsed, routed.route),
    );
    return {
      ...sanitized,
      route: routed.route,
      downgraded: result.downgraded,
      warned: result.warned,
    };
  }

  /**
   * Eksik alan tamamlama / soru-yanıt — YALNIZ JSON üstünden (belge yeniden
   * okunmaz). Ucuz metin yolu; premium yalnız AI-0 kuralları tetiklerse.
   */
  async refine(
    user: AuthenticatedCompanyUser,
    dto: { draft: unknown; message: string },
  ): Promise<AiTenderExtractResult> {
    this.ai.assertAiAccess(user);
    const message = (dto.message ?? "").trim();
    if (!message) throw new BadRequestException("Mesaj boş olamaz");

    // Girdi taslak da sanitize edilir — istemciden gelen JSON'a güvenilmez.
    const incoming = sanitizeAiDraft(dto.draft, "refine");
    const result = await this.ai.callAi(user, {
      feature: "tender_extract",
      prompt: buildRefinePrompt(JSON.stringify(incoming.draft), message.slice(0, 2000)),
      system: REFINE_SYSTEM_PROMPT,
      responseSchema: EXTRACT_RESPONSE_SCHEMA as unknown as object,
      metadata: { route: "refine" },
    });

    const parsed = this.tryParse(result.text);
    let sanitized = sanitizeAiDraft(parsed ?? incoming.draft, "refine");
    // Refine modeli suggestedCategoryIds üretmez — gelen taslaktaki öneri
    // korunur; hiç yoksa (eski taslak) kalemlerden yeniden önerilir.
    if (
      sanitized.draft.suggestedCategoryIds.length === 0 &&
      incoming.draft.suggestedCategoryIds.length > 0
    ) {
      sanitized = {
        ...sanitized,
        draft: {
          ...sanitized.draft,
          suggestedCategoryIds: incoming.draft.suggestedCategoryIds,
        },
        missingRequired: sanitized.missingRequired.filter(
          (m) => !m.startsWith("Kategori"),
        ),
      };
    }
    sanitized = await this.withCategorySuggestions(user, sanitized);
    return {
      ...sanitized,
      route: "text",
      downgraded: result.downgraded,
      warned: result.warned,
    };
  }

  private tryParse(text: string): Record<string, unknown> | null {
    try {
      const parsed: unknown = JSON.parse(text);
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return null;
      }
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
