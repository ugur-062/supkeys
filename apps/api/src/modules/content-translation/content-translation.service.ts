import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { LOCALES, type Locale } from "@rothern/i18n";
import { labelAttributes, resolveCategoryAttributes } from "../../common/company/category-attributes";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { AI_CONFIG, AI_PROVIDER_TOKEN, type AiConfig } from "../ai/ai.config";
import { costFromUsage } from "../ai/ai-budget.service";
import type { AiTokenUsage, BaseAiProvider } from "../ai/providers/ai-provider.interface";
import {
  TRANSLATION_SYSTEM_PROMPT,
  buildPrompt,
  hasTranslatableText,
  localizeCompany,
  localizeListing,
  localizeProduct,
  parseModelOutput,
  sourceHash,
  type CompanyTranslation,
  type ListingTranslation,
  type ParsedTranslation,
  type ProductTranslation,
  type SourceFields,
  type TranslatableEntityType,
  type TranslationFields,
} from "./content-translation.logic";

/**
 * İÇERİK ÇEVİRİSİ — servis (i18n Faz 1e, 2026-09-23).
 *
 * Akış: yazma yolu `enqueue(type, id)` der (fail-open, await edilmez) →
 * üç dil için PENDING satır → `kick` aynı süreçte hemen çevirir → süpürücü
 * cron (5 dk) kalanı ve başarısızları (≤3 deneme) yeniden dener.
 * Okuma yolu `localize*` ile istek diline göre alanları üzerine yazar; DONE
 * satır yoksa özgün metin döner.
 *
 * MOTOR: Gemini PRO (`models.premium`, Flash DEĞİL — kullanıcı kararı, pilot
 * ölçüldü). Firma bütçesine YAZILMAZ: çeviri platformun SEO yatırımıdır,
 * maliyet satırda (`costUsd`) izlenir.
 */
const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 8192;

type Localized<T> = T & { translatedFrom?: string | null };

interface StoredRow {
  entityId: string;
  fields: Prisma.JsonValue;
  sourceLocale: string | null;
}

@Injectable()
export class ContentTranslationService {
  private readonly logger = new Logger(ContentTranslationService.name);
  private readonly inFlight = new Set<string>();
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaBypassService,
    @Optional() @Inject(AI_CONFIG) private readonly cfg?: AiConfig,
    @Optional() @Inject(AI_PROVIDER_TOKEN) private readonly provider?: BaseAiProvider | null,
  ) {}

  get enabled(): boolean {
    return !!this.provider && !!this.cfg?.enabled;
  }

  /* ---------------------------------------------------------------- */
  /* Kaynak                                                            */
  /* ---------------------------------------------------------------- */

  async loadSource(type: TranslatableEntityType, id: string): Promise<SourceFields | null> {
    if (type === "PRODUCT") {
      const row = await this.prisma.companyItem.findUnique({
        where: { id },
        select: { name: true, description: true, keywords: true, attributes: true, categoryId: true },
      });
      if (!row) return null;
      const defs = await resolveCategoryAttributes(this.prisma, row.categoryId);
      const labeled = labelAttributes(row.attributes, defs) as { label: string; value: unknown }[];
      return {
        name: row.name,
        description: row.description,
        keywords: row.keywords,
        attributes: labeled
          .map((a) => ({ label: a.label, value: Array.isArray(a.value) ? a.value.join(", ") : String(a.value ?? "") }))
          .filter((a) => a.value.trim() !== ""),
      };
    }
    if (type === "LISTING") {
      const row = await this.prisma.listing.findUnique({
        where: { id },
        select: {
          title: true,
          description: true,
          keywords: true,
          items: { select: { name: true }, orderBy: { lineNo: "asc" } },
        },
      });
      if (!row) return null;
      const items = [...new Set(row.items.map((i) => (i.name ?? "").trim()).filter(Boolean))];
      return { title: row.title, description: row.description, keywords: row.keywords, items };
    }
    const row = await this.prisma.company.findUnique({
      where: { id },
      select: { aboutText: true, services: true, industry: true },
    });
    if (!row) return null;
    return { aboutText: row.aboutText, services: row.services, industry: row.industry };
  }

  /* ---------------------------------------------------------------- */
  /* Kuyruk                                                            */
  /* ---------------------------------------------------------------- */

  /**
   * Kaynak değiştiyse (ya da hiç çevrilmediyse) üç dil için PENDING satır
   * açar ve aynı süreçte çeviriyi başlatır. Fail-open: hata yalnız günlüğe.
   */
  async enqueue(type: TranslatableEntityType, id: string): Promise<boolean> {
    try {
      const source = await this.loadSource(type, id);
      if (!source || !hasTranslatableText(source)) return false;
      const hash = sourceHash(type, source);
      const existing = await this.prisma.contentTranslation.findMany({
        where: { entityType: type, entityId: id },
        select: { locale: true, sourceHash: true, status: true },
      });
      const upToDate =
        existing.length === LOCALES.length &&
        existing.every((r) => r.sourceHash === hash && r.status === "DONE");
      if (upToDate) return false;
      for (const locale of LOCALES) {
        await this.prisma.contentTranslation.upsert({
          where: { entityType_entityId_locale: { entityType: type, entityId: id, locale } },
          create: { entityType: type, entityId: id, locale, sourceHash: hash, status: "PENDING" },
          // Eski `fields` KORUNUR: yeni çeviri gelene dek bayat çeviri boş metinden iyidir.
          update: { sourceHash: hash, status: "PENDING", attempts: 0, error: null },
        });
      }
      this.kick(type, id);
      return true;
    } catch (err) {
      this.logger.warn(`Çeviri kuyruğa alınamadı (${type} ${id}): ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /** Aynı süreçte, istek yanıtını bekletmeden çevir. */
  kick(type: TranslatableEntityType, id: string): void {
    if (!this.enabled) return;
    setImmediate(() => {
      void this.translateEntity(type, id).catch((err) =>
        this.logger.warn(`Çeviri başarısız (${type} ${id}): ${err instanceof Error ? err.message : String(err)}`),
      );
    });
  }

  /** Süpürücü: bekleyen/başarısız (≤3 deneme) kayıtları sırayla çevirir. */
  async processPending(limit = 25): Promise<{ processed: number; done: number; failed: number }> {
    const out = { processed: 0, done: 0, failed: 0 };
    if (this.sweeping || !this.enabled) return out;
    this.sweeping = true;
    try {
      const rows = await this.prisma.contentTranslation.findMany({
        where: { OR: [{ status: "PENDING" }, { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } }] },
        select: { entityType: true, entityId: true },
        distinct: ["entityType", "entityId"],
        orderBy: { updatedAt: "asc" },
        take: limit,
      });
      for (const r of rows) {
        out.processed += 1;
        try {
          const result = await this.translateEntity(r.entityType, r.entityId);
          if (result === "done") out.done += 1;
          else if (result === "failed") out.failed += 1;
        } catch (err) {
          // Tek varlığın hatası süpürmeyi DURDURMAZ; hata satıra yazılır ki
          // `status` ucunda görünsün (2026-09-23: ilk backfill sessizce durmuştu).
          out.failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Çeviri hatası (${r.entityType} ${r.entityId}): ${message}`);
          await this.markFailed(r.entityType, r.entityId, message).catch(() => undefined);
        }
      }
    } finally {
      this.sweeping = false;
    }
    return out;
  }

  /** Tek varlığı çevirir: model → doğrulama (bir düzeltme turu) → üç satır. */
  async translateEntity(type: TranslatableEntityType, id: string): Promise<"done" | "skipped" | "failed"> {
    const key = `${type}:${id}`;
    if (this.inFlight.has(key)) return "skipped";
    this.inFlight.add(key);
    try {
      const source = await this.loadSource(type, id);
      if (!source || !hasTranslatableText(source)) {
        await this.prisma.contentTranslation.deleteMany({ where: { entityType: type, entityId: id } });
        return "skipped";
      }
      const hash = sourceHash(type, source);
      const rows = await this.prisma.contentTranslation.findMany({
        where: { entityType: type, entityId: id },
        select: { locale: true, status: true, sourceHash: true },
      });
      if (rows.length === 0) return "skipped";
      if (rows.every((r) => r.status === "DONE" && r.sourceHash === hash)) return "skipped";
      if (!this.provider || !this.cfg) {
        await this.markFailed(type, id, "AI sağlayıcı yapılandırılmamış");
        return "failed";
      }
      const model = this.cfg.models.premium;
      const pricing = this.cfg.pricing[model];
      const usage: AiTokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      let cost = 0;
      let parsed: ParsedTranslation | null = null;
      let feedback: string | undefined;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        let result: Awaited<ReturnType<BaseAiProvider["complete"]>>;
        try {
          result = await this.provider.complete({
            model,
            system: TRANSLATION_SYSTEM_PROMPT,
            prompt: buildPrompt(type, source, feedback),
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            timeoutMs: TIMEOUT_MS,
          });
        } catch (err) {
          // Sağlayıcı hatası (model adı, kota, ağ): deneme sayılır, satıra yazılır, süpürücü sürer.
          const message = err instanceof Error ? err.message : String(err);
          await this.markFailed(type, id, `sağlayıcı: ${message}`, { model, usage, cost });
          return "failed";
        }
        usage.inputTokens += result.usage.inputTokens;
        usage.outputTokens += result.usage.outputTokens;
        usage.cacheReadTokens += result.usage.cacheReadTokens;
        if (pricing) cost += Number(costFromUsage(result.usage, pricing));
        const p = parseModelOutput(type, source, result.text);
        if ("error" in p) {
          feedback = p.error;
          continue;
        }
        parsed = p;
      }
      if (!parsed) {
        await this.markFailed(type, id, feedback ?? "çeviri doğrulanamadı", { model, usage, cost });
        return "failed";
      }
      const now = new Date();
      for (const locale of LOCALES) {
        const fields =
          parsed.sourceLocale === locale ? Prisma.DbNull : (parsed.perLocale[locale] as unknown as Prisma.InputJsonValue);
        const data = {
          status: "DONE" as const,
          fields,
          sourceLocale: parsed.sourceLocale,
          sourceHash: hash,
          error: null,
          model,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: new Prisma.Decimal(cost.toFixed(6)),
          updatedAt: now,
        };
        await this.prisma.contentTranslation.upsert({
          where: { entityType_entityId_locale: { entityType: type, entityId: id, locale } },
          create: { entityType: type, entityId: id, locale, ...data },
          update: data,
        });
      }
      return "done";
    } finally {
      this.inFlight.delete(key);
    }
  }

  private async markFailed(
    type: TranslatableEntityType,
    id: string,
    error: string,
    meta?: { model: string; usage: AiTokenUsage; cost: number },
  ): Promise<void> {
    await this.prisma.contentTranslation.updateMany({
      where: { entityType: type, entityId: id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        error: error.slice(0, 500),
        ...(meta
          ? {
              model: meta.model,
              inputTokens: { increment: meta.usage.inputTokens },
              outputTokens: { increment: meta.usage.outputTokens },
              costUsd: new Prisma.Decimal(meta.cost.toFixed(6)),
            }
          : {}),
      },
    });
  }

  /* ---------------------------------------------------------------- */
  /* Okuma                                                             */
  /* ---------------------------------------------------------------- */

  private async translationsFor<T extends TranslationFields>(
    type: TranslatableEntityType,
    ids: string[],
    locale: Locale,
  ): Promise<Map<string, T & { sourceLocale: string | null }>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return new Map();
    const rows: StoredRow[] = await this.prisma.contentTranslation.findMany({
      where: { entityType: type, entityId: { in: unique }, locale, fields: { not: Prisma.DbNull } },
      select: { entityId: true, fields: true, sourceLocale: true },
    });
    const out = new Map<string, T & { sourceLocale: string | null }>();
    for (const r of rows) {
      if (r.fields && typeof r.fields === "object" && !Array.isArray(r.fields)) {
        out.set(r.entityId, { ...(r.fields as unknown as T), sourceLocale: r.sourceLocale });
      }
    }
    return out;
  }

  /** `items[i]` ↔ `ids[i]`: çevirisi olan kart/detay üzerine yazılır, `translatedFrom` eklenir. */
  async localizeProducts<T extends { name: string }>(
    items: T[],
    ids: (string | null | undefined)[],
    locale: Locale,
  ): Promise<Localized<T>[]> {
    const map = await this.safeMap<ProductTranslation>("PRODUCT", ids, locale);
    return items.map((item, i) => {
      const t = ids[i] ? map.get(ids[i] as string) : undefined;
      return t ? { ...localizeProduct(item, t), translatedFrom: t.sourceLocale } : item;
    });
  }

  async localizeListings<T extends { title: string }>(
    items: T[],
    ids: (string | null | undefined)[],
    locale: Locale,
    excerptOf?: (d: string | null) => string | null,
  ): Promise<Localized<T>[]> {
    const map = await this.safeMap<ListingTranslation>("LISTING", ids, locale);
    return items.map((item, i) => {
      const t = ids[i] ? map.get(ids[i] as string) : undefined;
      return t ? { ...localizeListing(item, t, excerptOf), translatedFrom: t.sourceLocale } : item;
    });
  }

  async localizeCompanies<T extends object>(
    items: T[],
    ids: (string | null | undefined)[],
    locale: Locale,
  ): Promise<Localized<T>[]> {
    const map = await this.safeMap<CompanyTranslation>("COMPANY", ids, locale);
    return items.map((item, i) => {
      const t = ids[i] ? map.get(ids[i] as string) : undefined;
      return t ? { ...localizeCompany(item, t), translatedFrom: t.sourceLocale } : item;
    });
  }

  /** Okuma yolu FAIL-OPEN: çeviri tablosu okunamazsa özgün metin döner. */
  private async safeMap<T extends TranslationFields>(
    type: TranslatableEntityType,
    ids: (string | null | undefined)[],
    locale: Locale,
  ): Promise<Map<string, T & { sourceLocale: string | null }>> {
    try {
      return await this.translationsFor<T>(type, ids.filter((x): x is string => !!x), locale);
    } catch (err) {
      this.logger.warn(`Çeviri okunamadı (${type}): ${err instanceof Error ? err.message : String(err)}`);
      return new Map();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Yönetim                                                           */
  /* ---------------------------------------------------------------- */

  /** Herkese açık tüm ürün/talep/profilleri kuyruğa alır (geriye dönük doldurma). */
  async enqueueAllPublic(where: {
    products: Prisma.CompanyItemWhereInput;
    listings: Prisma.ListingWhereInput;
    companies: Prisma.CompanyWhereInput;
  }): Promise<{ products: number; listings: number; companies: number }> {
    const [products, listings, companies] = await Promise.all([
      this.prisma.companyItem.findMany({ where: where.products, select: { id: true } }),
      this.prisma.listing.findMany({ where: where.listings, select: { id: true } }),
      this.prisma.company.findMany({ where: where.companies, select: { id: true } }),
    ]);
    const counts = { products: 0, listings: 0, companies: 0 };
    // `kick` olmadan yalnız satır aç; süpürücü (ya da `sweepAll`) sırayla çevirir —
    // aynı anda yüzlerce model çağrısı açılmasın.
    for (const p of products) if (await this.enqueueQuiet("PRODUCT", p.id)) counts.products += 1;
    for (const l of listings) if (await this.enqueueQuiet("LISTING", l.id)) counts.listings += 1;
    for (const c of companies) if (await this.enqueueQuiet("COMPANY", c.id)) counts.companies += 1;
    return counts;
  }

  private async enqueueQuiet(type: TranslatableEntityType, id: string): Promise<boolean> {
    const kick = this.kick;
    this.kick = () => {};
    try {
      return await this.enqueue(type, id);
    } finally {
      this.kick = kick;
    }
  }

  /** Arka planda kuyruk boşalana dek süpür (yönetici tetikler). */
  sweepAll(): void {
    if (!this.enabled) return;
    setImmediate(() => {
      void (async () => {
        for (let i = 0; i < 200; i++) {
          const r = await this.processPending(25);
          if (r.processed === 0) break;
        }
      })().catch((err) => this.logger.warn(`Toplu çeviri durdu: ${err instanceof Error ? err.message : String(err)}`));
    });
  }

  async stats(): Promise<{
    enabled: boolean;
    model: string | null;
    byStatus: Record<string, number>;
    costUsd: number;
    lastErrors: { entityType: string; entityId: string; error: string | null; updatedAt: Date }[];
  }> {
    const [groups, cost, lastErrors] = await Promise.all([
      this.prisma.contentTranslation.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.contentTranslation.aggregate({ _sum: { costUsd: true } }),
      this.prisma.contentTranslation.findMany({
        where: { status: "FAILED" },
        select: { entityType: true, entityId: true, error: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
    ]);
    const byStatus: Record<string, number> = {};
    for (const g of groups) byStatus[g.status] = g._count._all;
    return {
      enabled: this.enabled,
      model: this.cfg?.models.premium ?? null,
      byStatus,
      costUsd: Number(cost._sum.costUsd ?? 0),
      lastErrors,
    };
  }
}
