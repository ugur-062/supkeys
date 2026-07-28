import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { tierAtLeast } from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { AI_CONFIG, AI_PROVIDER_TOKEN, type AiConfig } from "../ai.config";
import { BaseAiProvider } from "../providers/ai-provider.interface";

/**
 * "Rothern profilini web sitenden AI ile oluştur" — BRONZ+ özelliği (Bronz
 * satış paketi profilden en çok yararlanan kesim; PaidTierGuard SILVER olduğu
 * için kapı burada). Firma AI bütçesine DOKUNMAZ (kayıt/kurulum yardımı —
 * ai_usage'a yazılmaz); kötüye kullanım günlük denemede sınırlanır (audit
 * log sayımı). Sonuç TASLAKTIR: kaydetmez, kullanıcı önizleyip düzenler ve
 * mevcut profil formundan kaydeder.
 */

const DAILY_LIMIT = 3;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 15_000;

export interface ProfileDraft {
  aboutText: string;
  services: string[];
  city: string | null;
  foundedYear: number | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  /** Sitede tespit edilen logo/og-görsel adresi — kullanıcı indirip yükler. */
  logoCandidateUrl: string | null;
}

const DRAFT_SCHEMA = {
  type: "object",
  properties: {
    aboutText: { type: "string" },
    services: { type: "array", items: { type: "string" }, maxItems: 12 },
    city: { type: "string", nullable: true },
    foundedYear: { type: "number", nullable: true },
    linkedinUrl: { type: "string", nullable: true },
    instagramUrl: { type: "string", nullable: true },
  },
  required: ["aboutText", "services"],
} as const;

@Injectable()
export class ProfileEnrichService {
  private readonly logger = new Logger(ProfileEnrichService.name);

  constructor(
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    @Inject(AI_PROVIDER_TOKEN) private readonly provider: BaseAiProvider | null,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async enrich(
    user: AuthenticatedCompanyUser,
    input: { website?: string },
  ): Promise<ProfileDraft> {
    if (!tierAtLeast(user.tier, "BRONZ")) {
      throw new ForbiddenException(
        "Profili AI ile oluşturmak için bir paket (Bronz+) gerekir.",
      );
    }
    if (!this.config.enabled || !this.provider) {
      throw new ServiceUnavailableException(
        "AI özelliği şu anda kullanılamıyor.",
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: user.companyId },
      select: { name: true, website: true, city: true },
    });
    const website = this.normalizeUrl(input.website || company?.website || "");
    if (!website) {
      throw new BadRequestException(
        "Önce firma web sitenizi ekleyin (Profilim → Düzenle).",
      );
    }

    // Günlük deneme sınırı — audit log sayımından (firma AI bütçesi kirlenmez).
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const attempts = await this.prisma.auditLog.count({
      where: {
        tenantId: user.companyId,
        action: "company.profile_enriched",
        createdAt: { gte: dayStart },
      },
    });
    if (attempts >= DAILY_LIMIT) {
      throw new BadRequestException(
        `Günlük AI profil oluşturma limitine ulaşıldı (${DAILY_LIMIT}) — yarın tekrar deneyin.`,
      );
    }

    // Siteyi çek; başarısızsa Google Search grounding'e düş.
    const fetched = await this.fetchSite(website);
    const usingSearch = !fetched;

    const system =
      "Bir B2B tedarik platformu için firma profil metni yazarsın. YALNIZ sana verilen içerikten/aramadan yararlan; bilgi UYDURMA — emin olmadığın alanı null bırak. Türkçe, profesyonel ve pazarlama abartısı olmayan bir dil kullan.";
    const ask = [
      `Firma: ${company?.name ?? "-"}`,
      `Web sitesi: ${website}`,
      "",
      usingSearch
        ? "Bu firmanın web sitesini ve hakkındaki bilgileri web'de ara."
        : `<site_icerigi>\n${fetched!.text}\n</site_icerigi>`,
      "",
      "Şunları üret: aboutText (firmanın ne yaptığını anlatan 2-4 paragraf, 400-1200 karakter); services (sunduğu ürün/hizmet başlıkları, en fazla 12, kısa); city (merkez şehir); foundedYear (kuruluş yılı, sitede açıkça yazıyorsa); linkedinUrl/instagramUrl (sitede link varsa).",
    ].join("\n");

    const result = await this.provider
      .complete({
        model: this.config.models.default,
        system,
        prompt: ask,
        ...(usingSearch ? { webSearch: true } : { responseSchema: DRAFT_SCHEMA as unknown as object }),
        maxOutputTokens: 2048,
        timeoutMs: this.config.timeoutMs,
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Profil zenginleştirme sağlayıcı hatası: ${err instanceof Error ? err.message : String(err)}`,
        );
        throw new ServiceUnavailableException(
          "AI şu an yanıt veremedi — birkaç saniye sonra tekrar deneyin.",
        );
      });

    // Grounding yolu serbest metin döner → ikinci ucuz çağrıyla şemaya çevir.
    let jsonText = result.text;
    if (usingSearch) {
      const parsed = await this.provider.complete({
        model: this.config.models.default,
        system: "Verilen metni şemaya uygun JSON'a dönüştür; metinde olmayanı null bırak, EKLEME.",
        prompt: `<metin>\n${result.text.slice(0, 10_000)}\n</metin>`,
        responseSchema: DRAFT_SCHEMA as unknown as object,
        maxOutputTokens: 2048,
        timeoutMs: this.config.timeoutMs,
      });
      jsonText = parsed.text;
    }

    let draft: ProfileDraft;
    try {
      const j = JSON.parse(jsonText) as Record<string, unknown>;
      draft = {
        aboutText: String(j.aboutText ?? "").slice(0, 2000).trim(),
        services: Array.isArray(j.services)
          ? j.services
              .filter((x): x is string => typeof x === "string" && !!x.trim())
              .map((x) => x.trim().slice(0, 80))
              .slice(0, 12)
          : [],
        city:
          typeof j.city === "string" && j.city.trim()
            ? j.city.trim().slice(0, 60)
            : null,
        foundedYear:
          typeof j.foundedYear === "number" &&
          j.foundedYear > 1800 &&
          j.foundedYear <= new Date().getFullYear()
            ? Math.floor(j.foundedYear)
            : null,
        linkedinUrl: this.normalizeUrl(String(j.linkedinUrl ?? "")),
        instagramUrl: this.normalizeUrl(String(j.instagramUrl ?? "")),
        logoCandidateUrl: fetched?.ogImage ?? null,
      };
    } catch {
      throw new ServiceUnavailableException(
        "AI çıktısı işlenemedi — lütfen tekrar deneyin.",
      );
    }
    if (!draft.aboutText) {
      throw new BadRequestException(
        "Siteden yeterli bilgi çıkarılamadı — profili elle doldurabilirsiniz.",
      );
    }

    void this.audit.log({
      action: "company.profile_enriched",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      metadata: { website, usingSearch },
    });
    return draft;
  }

  /** Siteyi indir + kaba metin/og-image çıkar. Başarısızlıkta null (grounding'e düşülür). */
  private async fetchSite(
    url: string,
  ): Promise<{ text: string; ogImage: string | null } | null> {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      const res = await fetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "User-Agent": "RothernBot/1.0 (+https://www.rothern.com)" },
      });
      clearTimeout(t);
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      const html = buf.subarray(0, MAX_HTML_BYTES).toString("utf8");
      const ogImage =
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(
          html,
        )?.[1] ?? null;
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_TEXT_CHARS);
      if (text.length < 200) return null; // JS-render site — grounding daha iyi
      return { text, ogImage };
    } catch {
      return null;
    }
  }

  private normalizeUrl(raw: string): string | null {
    const w = (raw ?? "").trim();
    if (!w || w === "null") return null;
    const url = /^https?:\/\//i.test(w) ? w : `https://${w}`;
    try {
      // eslint-disable-next-line no-new
      new URL(url);
      return url.slice(0, 300);
    } catch {
      return null;
    }
  }
}
