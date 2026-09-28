import { Inject, Injectable, Logger, Optional } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@rothern/i18n";
import { foldSearchText } from "@rothern/shared";
import { labelAttributes, resolveCategoryAttributes } from "../../common/company/category-attributes";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { AI_CONFIG, AI_PROVIDER_TOKEN, type AiConfig } from "../ai/ai.config";
import { costFromUsage } from "../ai/ai-budget.service";
import { SeoIndexService } from "../seo-index/seo-index.service";
import type { AiTokenUsage, BaseAiProvider } from "../ai/providers/ai-provider.interface";
import {
  TRANSLATION_SYSTEM_PROMPT,
  buildPrompt,
  buildSearchTextI18n,
  hasTranslatableText,
  localizeCompany,
  localizeListing,
  localizeProduct,
  parseModelOutput,
  localeStateOf,
  readyLocales,
  SOURCE_HASH_PREFIX,
  sourceHash,
  translatedAtOf,
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
/**
 * Toplam deneme tavanı (ilk 3 + 6 saatte bir yeniden). Kalıcı reddedilen
 * kayıt eskiden her 6 saatte sıfırlanıp SONSUZA DEK Pro çağrısı yakıyordu
 * (günde ~24 çağrı/kayıt, 2026-09-27 denetimi); tavan dolunca kayıt ancak
 * kaynağı değişince (enqueue sayacı sıfırlar) yeniden denenir.
 */
const MAX_TOTAL_ATTEMPTS = 9;
/** Kalıcı FAILED kayıt bu süreden sonra yeniden denenir (kapsam denetimi). */
const FAILED_RETRY_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 120_000;
const MAX_OUTPUT_TOKENS = 8192;

/*
 * MALİYET FRENLERİ (yayın denetimi 2026-09-28 Bölüm 5). Çeviri platformun
 * anahtarıyla koşar ve firma bütçesine yazılmaz; frensiz hâliyle ücretsiz bir
 * hesap ürün yayınla/geri çek döngüsüyle ya da sınırsız nitelik değeriyle
 * sınırsız Pro çağrısı yaktırabiliyordu.
 */
/**
 * İstemdeki kaynak JSON'u bu uzunluğu aşarsa model ÇAĞRILMAZ: çıktı tavanı
 * (8.192 token, iki hedef dil) böyle bir kaynakta zaten kesik JSON üretir ve
 * her deneme boşa iki Pro çağrısı olurdu. Kayıt özgün dilinde kalır.
 */
export const MAX_SOURCE_CHARS = 24_000;
/** Aynı anda en fazla bu kadar çeviri işi modelde (sağlayıcı kotası paylaşılır). */
const MAX_CONCURRENT_JOBS = 4;
/** Platform geneli günlük çeviri harcaması tavanı (USD) — `CONTENT_TRANSLATION_DAILY_USD`. */
const DEFAULT_DAILY_USD = 20;
/** Firma başına günlük çeviri işi tavanı — `CONTENT_TRANSLATION_COMPANY_DAILY_JOBS`. */
const DEFAULT_COMPANY_DAILY_JOBS = 150;

/** Sayısal env: tanımsız/boş → varsayılan; 0 geçerli (freni tümüyle kapatır). */
function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/**
 * MODEL ADAYLARI — sırayla denenir, "model bulunamadı" (404) alan aday
 * atlanır ve çalışan ad süreç ömrünce hatırlanır. Neden: Vertex AI
 * `gemini-pro-latest` alias'ını TANIMAZ (2026-09-23 staging: 504 satır 404
 * ile düştü); Generative Language API tanır. `CONTENT_TRANSLATION_MODEL`
 * env'i listenin başına geçer; sonra `AI_MODEL_PREMIUM`, sonra bilinen Pro
 * sürümleri (fiyat tablosunda olanlar).
 */
const PRO_FALLBACKS = ["gemini-3.1-pro", "gemini-3.1-pro-preview", "gemini-2.5-pro"];

function isModelNotFound(err: unknown): boolean {
  const m = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return /"code"\s*:\s*404/.test(m) || m.includes("not_found") || m.includes("was not found");
}

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
  /** Çeviri sürerken kaynağı yeniden değişen varlıklar: bitince bir tur daha. */
  private readonly dirty = new Set<string>();
  private sweeping = false;
  /** 404 ile elenen adaylar ve çalıştığı görülen model (süreç ömrünce). */
  private readonly deadModels = new Set<string>();
  private resolvedModel: string | null = null;
  /**
   * Günlük fren sayaçları (UTC günü, SÜREÇ İÇİ): tek API örneği koşar; yeniden
   * başlatma sayacı sıfırlar — fren muhasebe değil, kaçak harcama kesicisidir.
   */
  private budgetDay = "";
  private spentTodayUsd = 0;
  private readonly jobsToday = new Map<string, number>();
  private running = 0;
  private readonly waiting: Array<() => void> = [];

  /** Deneme sırası: env → premium → bilinen Pro sürümleri (elenenler hariç). */
  modelCandidates(): string[] {
    const env = process.env.CONTENT_TRANSLATION_MODEL?.trim();
    const list = [
      ...(this.resolvedModel ? [this.resolvedModel] : []),
      ...(env ? [env] : []),
      ...(this.cfg ? [this.cfg.models.premium] : []),
      ...PRO_FALLBACKS,
    ];
    return [...new Set(list)].filter((m) => !this.deadModels.has(m));
  }

  constructor(
    private readonly prisma: PrismaBypassService,
    @Optional() @Inject(AI_CONFIG) private readonly cfg?: AiConfig,
    @Optional() @Inject(AI_PROVIDER_TOKEN) private readonly provider?: BaseAiProvider | null,
    // SONDA ve @Optional (rig stub kuralı): elle kurulan test düzenekleri kırılmasın.
    @Optional() private readonly seoIndex?: SeoIndexService,
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
        select: {
          name: true,
          description: true,
          specification: true,
          keywords: true,
          attributes: true,
          categoryId: true,
          unit: true,
          unitCode: true,
        },
      });
      if (!row) return null;
      const defs = await resolveCategoryAttributes(this.prisma, row.categoryId);
      const labeled = labelAttributes(row.attributes, defs) as { label: string; value: unknown }[];
      return {
        name: row.name,
        // Serbest birim (kod yok) çevrilir; kodlu birim katalogdan → hash'e girmez.
        ...(!row.unitCode && row.unit?.trim() ? { unit: row.unit.trim() } : {}),
        description: row.description,
        keywords: row.keywords,
        attributes: labeled
          .map((a) => ({ label: a.label, value: Array.isArray(a.value) ? a.value.join(", ") : String(a.value ?? "") }))
          .filter((a) => a.value.trim() !== ""),
        // Yalnız doluyken (eski kayıtların kaynak özeti değişmesin).
        ...(row.specification?.trim() ? { specification: row.specification.trim() } : {}),
      };
    }
    if (type === "LISTING") {
      const row = await this.prisma.listing.findUnique({
        where: { id },
        select: {
          title: true,
          description: true,
          keywords: true,
          terms: true,
          paymentNote: true,
          items: {
            select: { name: true, description: true, specification: true, questions: { select: { text: true } } },
            orderBy: { lineNo: "asc" },
          },
        },
      });
      if (!row) return null;
      const uniq = (xs: (string | null | undefined)[]) => [...new Set(xs.map((x) => (x ?? "").trim()).filter(Boolean))];
      const items = uniq(row.items.map((i) => i.name));
      const details = uniq(row.items.flatMap((i) => [i.description, i.specification]));
      const questions = uniq(row.items.flatMap((i) => i.questions.map((q) => q.text)));
      // Teklif verenin gördüğü serbest metinler — YALNIZ doluyken anahtar
      // (boş anahtar eski taleplerin kaynak özetini değiştirirdi).
      return {
        title: row.title,
        description: row.description,
        keywords: row.keywords,
        items,
        ...(row.terms?.trim() ? { terms: row.terms.trim() } : {}),
        ...(row.paymentNote?.trim() ? { paymentNote: row.paymentNote.trim() } : {}),
        ...(details.length ? { details } : {}),
        ...(questions.length ? { questions } : {}),
      };
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
      if (!source || !hasTranslatableText(source)) {
        // Metni boşalmış kayıt: eski satırlar kalırsa kapsam denetimi onu her
        // turda yeniden seçer ve kuyruğun başını tıkardı.
        if (source) await this.prisma.contentTranslation.deleteMany({ where: { entityType: type, entityId: id } });
        return false;
      }
      const hash = sourceHash(type, source);
      // Kaynak değişti: arama metni YENİ kaynakla hemen tazelenir (eski
      // çeviriler yeni çeviri gelene dek içinde kalır — bayat çeviri boştan iyi).
      await this.refreshSearchText(type, id, source);
      const existing = await this.prisma.contentTranslation.findMany({
        where: { entityType: type, entityId: id },
        select: { locale: true, sourceHash: true, status: true },
      });
      const upToDate =
        existing.length === LOCALES.length &&
        existing.every((r) => r.sourceHash === hash && r.status === "DONE");
      if (upToDate) {
        // "Denetlendi" damgası: kaynak aynı ama varlık başka sebeple güncellendi
        // (durum, paket…) → kapsam denetimi onu bir daha bayat saymasın.
        await this.prisma.contentTranslation.updateMany({
          where: { entityType: type, entityId: id },
          data: { updatedAt: new Date() },
        });
        return false;
      }
      // Kaynak AYNI ve çeviri başarısız: sayaç SIFIRLANMAZ, yeniden denemeyi
      // süpürücü kendi temposunda yapar. Eskiden her kayıt/yayın satırı
      // attempts=0'la yeniden kuyruğa alıp hemen iki Pro çağrısı yakıyordu.
      // Damga, kapsam denetiminin varlığı her turda yeniden seçmesini önler.
      const sameSourceFailed =
        existing.length === LOCALES.length &&
        existing.every((r) => r.sourceHash === hash) &&
        existing.some((r) => r.status === "FAILED");
      if (sameSourceFailed) {
        await this.prisma.contentTranslation.updateMany({
          where: { entityType: type, entityId: id },
          data: { updatedAt: new Date() },
        });
        return false;
      }
      const guess = await this.guessSourceLocale(type, id);
      for (const locale of LOCALES) {
        await this.prisma.contentTranslation.upsert({
          where: { entityType_entityId_locale: { entityType: type, entityId: id, locale } },
          create: { entityType: type, entityId: id, locale, sourceHash: hash, status: "PENDING", sourceLocale: guess },
          // Eski `fields` KORUNUR: yeni çeviri gelene dek bayat çeviri boş metinden iyidir.
          update: { sourceHash: hash, status: "PENDING", attempts: 0, error: null },
        });
      }
      this.kick(type, id);
      // Talep sahibinin firması: sektörü herkese açık talep sayfasında görünür → o firma
      // herkese açık profilli olmasa da çevrilir (2026-09-23 tarama: "Makine İmalatı").
      if (type === "LISTING") {
        const owner = await this.prisma.listing.findUnique({ where: { id }, select: { companyId: true } });
        if (owner?.companyId) void this.enqueue("COMPANY", owner.companyId).catch(() => undefined);
      }
      return true;
    } catch (err) {
      this.logger.warn(`Translation enqueue failed (${type} ${id}): ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Kaynak dil TAHMİNİ (çeviri gelmeden): sahibi Türkiye/KKTC firmasıysa
   * "tr", değilse "und" (belirsiz). `readyLocales` belirsiz kaynakta yalnız
   * çevirisi gelmiş dilleri hazır sayar → Alman firmanın Almanca metni
   * Türkçe adreste `lang="tr"` ile indekslenmez (2026-09-27 denetimi).
   * Model kaynağı saptayınca satırlara gerçek dil yazılır.
   */
  private async guessSourceLocale(type: TranslatableEntityType, id: string): Promise<string> {
    try {
      return await this.guessSourceLocaleOrThrow(type, id);
    } catch {
      return "tr";
    }
  }

  /** Varlığın sahibi firma (COMPANY için kendisi). */
  private async ownerCompanyId(type: TranslatableEntityType, id: string): Promise<string | null> {
    if (type === "COMPANY") return id;
    const row =
      type === "PRODUCT"
        ? await this.prisma.companyItem.findUnique({ where: { id }, select: { companyId: true } })
        : await this.prisma.listing.findUnique({ where: { id }, select: { companyId: true } });
    return row?.companyId ?? null;
  }

  private async guessSourceLocaleOrThrow(type: TranslatableEntityType, id: string): Promise<string> {
    const companyId = await this.ownerCompanyId(type, id);
    if (!companyId) return "tr";
    const company = await this.prisma.company.findUnique({ where: { id: companyId }, select: { country: true } });
    const country = (company?.country ?? "TR").toUpperCase();
    return country === "TR" || country === "XN" ? "tr" : "und";
  }

  /** Aynı süreçte, istek yanıtını bekletmeden çevir. */
  kick(type: TranslatableEntityType, id: string): void {
    if (!this.enabled) return;
    setImmediate(() => {
      void this.translateEntity(type, id).catch((err) =>
        this.logger.warn(`Translation failed (${type} ${id}): ${err instanceof Error ? err.message : String(err)}`),
      );
    });
  }

  /**
   * ÇEVİRİYİ BEKLE (2026-09-27, dış talep daveti): istenen dillerin çevirisi
   * hazır değilse en fazla `timeoutMs` bekler. Kayıtsız alıcıya giden davet
   * e-postası alıcının dilinde olmalı; talep az önce yayınlandıysa çevirisi
   * henüz sürüyordur. Döner: `true` = istenen her dil hazır (ya da kaynak
   * dilin kendisi / çevrilecek metin yok), `false` = süre doldu, çeviri
   * başarısız ya da AI kapalı → çağıran ÖZGÜN metinle devam eder.
   *
   * Çift çeviri yok: kaynak özeti güncel satırlar varsa `enqueue` ÇAĞRILMAZ
   * (enqueue deneme sayacını sıfırlayıp yeniden kuyruğa alırdı); sürmekte
   * olan çeviri (`inFlight`) yalnız beklenir, bekleyen ama sahipsiz satır için
   * bir kez `kick` edilir. Başarısız satır BEKLENMEZ (süpürücü kendi yeniden
   * dener; burada model çağrısı yakılmaz).
   */
  async ensureTranslated(
    type: TranslatableEntityType,
    id: string,
    locales: readonly Locale[],
    timeoutMs = 60_000,
    pollMs = 1_500,
  ): Promise<boolean> {
    const wanted = [...new Set(locales)];
    if (wanted.length === 0) return true;
    try {
      const source = await this.loadSource(type, id);
      if (!source || !hasTranslatableText(source)) return true;
      if (!this.enabled) return false;
      const hash = sourceHash(type, source);
      const key = `${type}:${id}`;
      const deadline = Date.now() + timeoutMs;
      let started = false;
      for (;;) {
        const rows = await this.prisma.contentTranslation.findMany({
          where: { entityType: type, entityId: id },
          select: { locale: true, status: true, sourceHash: true, sourceLocale: true },
        });
        const current = rows.length > 0 && rows.every((r) => r.sourceHash === hash);
        // Kaynak dili (model saptadıysa gerçek, değilse sahibin ülkesinden
        // tahmin): o dile çeviri gerekmez — Türk alıcı Türk tedarikçiyi davet
        // edince 60 sn beklenmez.
        const src = rows.find((r) => r.sourceLocale)?.sourceLocale ?? null;
        const pending = wanted.filter(
          (l) => l !== src && !rows.some((r) => r.locale === l && r.status === "DONE" && r.sourceHash === hash),
        );
        if (current && pending.length === 0) return true;
        if (current && rows.some((r) => r.status === "FAILED") && !this.inFlight.has(key)) return false;
        if (!started) {
          started = true;
          // Hiç kuyruğa girmemiş kayıt (taslak talep): istenen dil zaten
          // kaynağın tahmini diliyse model çağrılmaz.
          if (rows.length === 0) {
            const guess = await this.guessSourceLocale(type, id);
            if (wanted.every((l) => l === guess)) return true;
          }
          if (!current) await this.enqueue(type, id);
          else if (!this.inFlight.has(key)) this.kick(type, id);
        }
        const left = deadline - Date.now();
        if (left <= 0) return false;
        await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, left)));
      }
    } catch (err) {
      this.logger.warn(`Translation wait failed (${type} ${id}): ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Ortak sağlayıcı çağrısı — model aday zinciri ve 404 düşüşü ile (kategori
   * toplu çevirisi gibi ürün/talep dışı işler için). Başarısızlıkta `error`.
   */
  async completeWithFallback(
    system: string,
    prompt: string,
    opts: { maxOutputTokens?: number; timeoutMs?: number } = {},
  ): Promise<{ text: string; model: string; cost: number } | { error: string }> {
    if (!this.provider || !this.cfg) return { error: "translation provider not configured" };
    for (const candidate of this.modelCandidates()) {
      try {
        const result = await this.provider.complete({
          model: candidate,
          system,
          prompt,
          maxOutputTokens: opts.maxOutputTokens ?? MAX_OUTPUT_TOKENS,
          timeoutMs: opts.timeoutMs ?? TIMEOUT_MS,
          thinkingLevel: "low",
        });
        if (this.resolvedModel !== candidate) {
          this.resolvedModel = candidate;
          this.logger.log(`Content translation model: ${candidate}`);
        }
        const pricing = this.cfg.pricing[candidate];
        const cost = pricing ? Number(costFromUsage(result.usage, pricing)) : 0;
        return { text: result.text, model: candidate, cost };
      } catch (err) {
        if (isModelNotFound(err)) {
          this.deadModels.add(candidate);
          this.logger.warn(`Translation model not available on this provider, trying next: ${candidate}`);
          continue;
        }
        return { error: `provider: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    return { error: "translation model not found (CONTENT_TRANSLATION_MODEL / AI_MODEL_PREMIUM unknown to the provider)" };
  }

  /** Süpürücü: bekleyen/başarısız (≤3 deneme) kayıtları sırayla çevirir. */
  async processPending(limit = 25): Promise<{ processed: number; done: number; failed: number }> {
    const out = { processed: 0, done: 0, failed: 0 };
    if (this.sweeping || !this.enabled) return out;
    this.sweeping = true;
    try {
      const rows = await this.prisma.contentTranslation.findMany({
        where: {
          OR: [
            { status: "PENDING" },
            { status: "FAILED", attempts: { lt: MAX_ATTEMPTS } },
            // Kalıcı FAILED: 6 saatte bir, toplam tavana dek.
            { status: "FAILED", attempts: { lt: MAX_TOTAL_ATTEMPTS }, updatedAt: { lt: new Date(Date.now() - FAILED_RETRY_MS) } },
          ],
        },
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
          this.logger.warn(`Translation error (${r.entityType} ${r.entityId}): ${message}`);
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
    if (this.inFlight.has(key)) {
      // Sürmekte olan çeviri ESKİ kaynağı yazacak → bitince yeniden çevrilsin.
      this.dirty.add(key);
      return "skipped";
    }
    this.inFlight.add(key);
    let slotHeld = false;
    try {
      const source = await this.loadSource(type, id);
      if (!source || !hasTranslatableText(source)) {
        await this.prisma.contentTranslation.deleteMany({ where: { entityType: type, entityId: id } });
        await this.writeSearchText(type, id, "");
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
        await this.markFailed(type, id, "AI provider not configured");
        return "failed";
      }
      if (JSON.stringify(source).length > MAX_SOURCE_CHARS) {
        // Kalıcı: kaynak değişene dek yeniden denenmez (enqueue sayacı ancak
        // yeni kaynakta sıfırlar).
        await this.markDeferred(type, id, `source too large (> ${MAX_SOURCE_CHARS} chars)`, MAX_TOTAL_ATTEMPTS);
        return "failed";
      }
      const owner = await this.ownerCompanyId(type, id);
      const denial = this.quotaDenial(owner);
      if (denial) {
        // Süpürücü 6 saat sonra yeniden dener (FAILED_RETRY_MS); kuyruğun başını tıkamaz.
        await this.markDeferred(type, id, denial, MAX_ATTEMPTS);
        return "failed";
      }
      if (owner) this.jobsToday.set(owner, (this.jobsToday.get(owner) ?? 0) + 1);
      await this.acquireSlot();
      slotHeld = true;
      const usage: AiTokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
      let cost = 0;
      let parsed: ParsedTranslation | null = null;
      let feedback: string | undefined;
      let model = this.modelCandidates()[0] ?? this.cfg.models.premium;
      for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
        let result: Awaited<ReturnType<BaseAiProvider["complete"]>> | null = null;
        // Model adayları: 404 "bulunamadı" alan aday elenir, sıradaki denenir.
        for (const candidate of this.modelCandidates()) {
          model = candidate;
          try {
            result = await this.provider.complete({
              model,
              system: TRANSLATION_SYSTEM_PROMPT,
              prompt: buildPrompt(type, source, feedback),
              maxOutputTokens: MAX_OUTPUT_TOKENS,
              timeoutMs: TIMEOUT_MS,
              // Çeviri muhakeme işi değil: düşük thinking kalite kaybetmeden
              // maliyeti/gecikmeyi kısar (ilk staging backfill'de thinking
              // token'ları çıktının ~3 katıydı; 3.1 Pro'da kayıt başına ~8 sent).
              thinkingLevel: "low",
            });
            if (this.resolvedModel !== model) {
              this.resolvedModel = model;
              this.logger.log(`Content translation model: ${model}`);
            }
            break;
          } catch (err) {
            if (isModelNotFound(err)) {
              this.deadModels.add(candidate);
              this.logger.warn(`Translation model not available on this provider, trying next: ${candidate}`);
              continue;
            }
            // Sağlayıcı hatası (kota, ağ): deneme sayılır, satıra yazılır, süpürücü sürer.
            const message = err instanceof Error ? err.message : String(err);
            await this.markFailed(type, id, `provider: ${message}`, { model, usage, cost });
            return "failed";
          }
        }
        if (!result) {
          await this.markFailed(type, id, "translation model not found (CONTENT_TRANSLATION_MODEL / AI_MODEL_PREMIUM unknown to the provider)", { model, usage, cost });
          return "failed";
        }
        const pricing = this.cfg.pricing[model];
        usage.inputTokens += result.usage.inputTokens;
        usage.outputTokens += result.usage.outputTokens;
        usage.cacheReadTokens += result.usage.cacheReadTokens;
        if (pricing) {
          const callCost = Number(costFromUsage(result.usage, pricing));
          cost += callCost;
          this.rollBudgetDay();
          this.spentTodayUsd += callCost;
        }
        const p = parseModelOutput(type, source, result.text);
        if ("error" in p) {
          feedback = p.error;
          continue;
        }
        parsed = p;
      }
      if (!parsed) {
        await this.markFailed(type, id, feedback ?? "translation could not be validated", { model, usage, cost });
        return "failed";
      }
      // Model çalışırken kaynak değiştiyse (enqueue satırlara yeni özeti yazdı)
      // eski kaynağın çevirisi DONE diye yazılmaz — yoksa yeni metin kapsam
      // denetiminden de kaçıp bir sonraki düzenlemeye dek eski çeviri kalırdı.
      const current = await this.prisma.contentTranslation.findMany({
        where: { entityType: type, entityId: id },
        select: { sourceHash: true },
      });
      if (current.some((r) => r.sourceHash !== hash)) {
        this.dirty.add(key);
        return "skipped";
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
      await this.writeSearchText(
        type,
        id,
        buildSearchTextI18n(type, source, Object.values(parsed.perLocale), foldSearchText),
      );
      // EN/RU sayfalar ŞİMDİ çevrilmiş içerikle tazelenir ve motorlara üç dilde
      // bildirilir (yayın anındaki bildirim çeviri gelmeden gitmişti).
      this.notifySeo(type, id);
      return "done";
    } finally {
      if (slotHeld) this.releaseSlot();
      this.inFlight.delete(key);
      if (this.dirty.delete(key)) this.kick(type, id);
    }
  }

  /* ---------------------------------------------------------------- */
  /* Maliyet frenleri                                                  */
  /* ---------------------------------------------------------------- */

  private rollBudgetDay(): void {
    const day = new Date().toISOString().slice(0, 10);
    if (day === this.budgetDay) return;
    this.budgetDay = day;
    this.spentTodayUsd = 0;
    this.jobsToday.clear();
  }

  /** null = model çağrılabilir; aksi hâlde satıra yazılacak neden. */
  private quotaDenial(companyId: string | null): string | null {
    this.rollBudgetDay();
    if (this.spentTodayUsd >= envNumber("CONTENT_TRANSLATION_DAILY_USD", DEFAULT_DAILY_USD)) {
      return "quota: platform daily translation budget reached";
    }
    const jobs = companyId ? (this.jobsToday.get(companyId) ?? 0) : 0;
    if (jobs >= envNumber("CONTENT_TRANSLATION_COMPANY_DAILY_JOBS", DEFAULT_COMPANY_DAILY_JOBS)) {
      return "quota: company daily translation limit reached";
    }
    return null;
  }

  private async acquireSlot(): Promise<void> {
    if (this.running < MAX_CONCURRENT_JOBS) {
      this.running += 1;
      return;
    }
    // Boşalan yuva doğrudan sıradakine devredilir (`running` azalmaz).
    await new Promise<void>((resolve) => this.waiting.push(resolve));
  }

  private releaseSlot(): void {
    const next = this.waiting.shift();
    if (next) next();
    else this.running -= 1;
  }

  /* ---------------------------------------------------------------- */
  /* Çok dilli arama metni                                             */
  /* ---------------------------------------------------------------- */

  /**
   * `searchTextI18n` = katlanmış kaynak + kayıtlı çeviriler. Çeviri yoksa
   * yalnız kaynak (talep aramasında TR katlama yine kazanılır). Fail-open.
   */
  async refreshSearchText(type: TranslatableEntityType, id: string, source?: SourceFields | null): Promise<void> {
    try {
      const src = source === undefined ? await this.loadSource(type, id) : source;
      if (!src) return;
      const rows = await this.prisma.contentTranslation.findMany({
        where: { entityType: type, entityId: id, fields: { not: Prisma.DbNull } },
        select: { fields: true },
      });
      const translations = rows
        .map((r) => r.fields)
        .filter((f): f is Prisma.JsonObject => !!f && typeof f === "object" && !Array.isArray(f))
        .map((f) => f as unknown as TranslationFields);
      await this.writeSearchText(type, id, buildSearchTextI18n(type, src, translations, foldSearchText));
    } catch (err) {
      this.logger.warn(`Search text refresh failed (${type} ${id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Çeviri satırı olan tüm varlıkların arama metnini yeniden kurar — model
   * çağrısı YOK. Açılışta bir kez (süpürücü) ve yönetici ucundan.
   */
  async rebuildAllSearchTexts(): Promise<{ entities: number }> {
    const rows = await this.prisma.contentTranslation.findMany({
      select: { entityType: true, entityId: true },
      distinct: ["entityType", "entityId"],
    });
    for (const r of rows) await this.refreshSearchText(r.entityType, r.entityId);
    return { entities: rows.length };
  }

  private notifySeo(type: TranslatableEntityType, id: string): void {
    if (!this.seoIndex) return;
    if (type === "PRODUCT") this.seoIndex.productChanged(id);
    else if (type === "LISTING") this.seoIndex.listingChanged(id);
    else this.seoIndex.companyChanged(id);
  }

  /**
   * Fail-open: arama metni yazılamazsa çeviri DONE kalır (sonraki açılış kurar).
   * HAM SQL, bilinçli: Prisma `updateMany` `@updatedAt`i ilerletirdi → sitemap
   * `lastmod` sahte değişir ve kapsam denetimi kaydı sonsuza dek "bayat" görürdü.
   */
  private async writeSearchText(type: TranslatableEntityType, id: string, text: string): Promise<void> {
    try {
      if (type === "PRODUCT") {
        await this.prisma.$executeRaw`UPDATE "company_items" SET "searchTextI18n" = ${text} WHERE "id" = ${id}`;
      } else if (type === "LISTING") {
        await this.prisma.$executeRaw`UPDATE "listings" SET "searchTextI18n" = ${text} WHERE "id" = ${id}`;
      } else {
        await this.prisma.$executeRaw`UPDATE "companies" SET "searchTextI18n" = ${text} WHERE "id" = ${id}`;
      }
    } catch (err) {
      this.logger.warn(`Search text write failed (${type} ${id}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Model çağrılmadan ertelenen kayıt: deneme sayacı `attempts`e ÇEKİLİR (artmaz). */
  private async markDeferred(type: TranslatableEntityType, id: string, error: string, attempts: number): Promise<void> {
    await this.prisma.contentTranslation.updateMany({
      where: { entityType: type, entityId: id },
      data: { status: "FAILED", attempts, error: error.slice(0, 500) },
    });
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

  /**
   * Başka firmanın SEKTÖRÜ (`industry`, serbest metin) okuyucunun dilinde —
   * yalnız o alan değişir, yanıt şekli aynı kalır (`translatedFrom` eklenmez).
   * Ürün sayfasının satıcı kartı, bağlantı listesi/önerileri ve sipariş karşı
   * taraf profili kullanır (yayın denetimi 2026-09-28 Bölüm 9: EN sayfada
   * sektör Türkçe kalıyordu, firmanın EN çevirisi hazır olduğu hâlde).
   */
  async localizeIndustry<T extends { industry?: string | null }>(
    items: T[],
    companyIds: (string | null | undefined)[],
    locale: Locale,
  ): Promise<T[]> {
    const map = await this.safeMap<CompanyTranslation>("COMPANY", companyIds, locale);
    return items.map((item, i) => {
      const id = companyIds[i];
      const t = id ? map.get(id) : undefined;
      return t?.industry && item.industry ? { ...item, industry: t.industry } : item;
    });
  }

  /**
   * Talep kartı/detayındaki alıcı firma SEKTÖRÜ (`company.industry`, serbest metin)
   * o firmanın kendi çevirisinden (COMPANY → `industry`) okunur; firma kimliği
   * yanıta girmez, yalnız arama anahtarıdır. Çeviri yoksa özgün kalır.
   */
  async localizeListingCompanies<T extends { company?: { industry?: string | null } | null }>(
    items: T[],
    companyIds: (string | null | undefined)[],
    locale: Locale,
  ): Promise<T[]> {
    const map = await this.safeMap<CompanyTranslation>("COMPANY", companyIds, locale);
    return items.map((item, i) => {
      const id = companyIds[i];
      const t = id ? map.get(id) : undefined;
      if (!t?.industry || !item.company?.industry) return item;
      return { ...item, company: { ...item.company, industry: t.industry } };
    });
  }

  /**
   * Bu dilde çeviri BEKLENİYOR mu? (i18n SEO, 2026-09-25) — sayfa o dilde
   * kaynak metni gösteriyorsa (çeviri henüz gelmedi) arama motoruna `noindex`
   * verilir: EN adreste Türkçe içerik indekslenmez. Kural `readyLocales`te
   * (sitemap ile ortak). Hata → false (DB aksaklığı sayfayı indeksten düşürmesin).
   */
  async translationPending(type: TranslatableEntityType, id: string, locale: Locale): Promise<boolean> {
    return !(await this.localeState(type, id)).readyLocales.includes(locale);
  }

  /**
   * Kaydın dil durumu (i18n SEO, 2026-09-27) — herkese açık detay yanıtına
   * girer: `readyLocales` (hreflang yalnız bunlar; `translationPending` de
   * buradan) ve `sourceLocale` (kaynak metni gösterilen dilde `lang`). Kural
   * `localeStateOf`ta. Hata → tüm diller hazır + Türkçe (DB aksaklığı sayfayı
   * indeksten düşürmesin — `translationPending`in eski fail-open davranışı).
   */
  async localeState(type: TranslatableEntityType, id: string): Promise<{ readyLocales: Locale[]; sourceLocale: string }> {
    try {
      const rows = await this.prisma.contentTranslation.findMany({
        where: { entityType: type, entityId: id },
        select: { locale: true, fields: true, sourceLocale: true },
      });
      return localeStateOf(rows);
    } catch {
      return { readyLocales: [...LOCALES], sourceLocale: DEFAULT_LOCALE };
    }
  }

  /**
   * Toplu `readyLocales` — sitemap her kaydı yalnız HAZIR dillerinde listeler
   * (sayfanın `noindex`iyle aynı kural). Hata → null: çağıran tüm dilleri
   * varsayar (tablo aksaklığı sitemap'i boşaltmasın).
   */
  async readyLocalesFor(type: TranslatableEntityType, ids: string[]): Promise<Map<string, Locale[]> | null> {
    const map = await this.sitemapLocalesFor(type, ids);
    return map ? new Map([...map].map(([id, v]) => [id, v.locales])) : null;
  }

  /**
   * Sitemap girdisi (2026-09-27): hazır diller + her ÇEVRİLMİŞ dilin satır
   * zamanı (`translatedAt`) — EN/RU `lastmod`u çeviri güncellemesini de
   * yansıtsın (eskiden yalnız varlığın `updatedAt`i; yeniden çeviri EN
   * sayfasını değiştirse de sitemap "değişmedi" diyordu). Hata → null.
   */
  async sitemapLocalesFor(
    type: TranslatableEntityType,
    ids: string[],
  ): Promise<Map<string, { locales: Locale[]; translatedAt: Partial<Record<Locale, Date>> }> | null> {
    try {
      const unique = [...new Set(ids.filter(Boolean))];
      const rows = unique.length
        ? await this.prisma.contentTranslation.findMany({
            where: { entityType: type, entityId: { in: unique } },
            select: { entityId: true, locale: true, fields: true, sourceLocale: true, updatedAt: true },
          })
        : [];
      const byId = new Map<string, typeof rows>();
      for (const r of rows) byId.set(r.entityId, [...(byId.get(r.entityId) ?? []), r]);
      return new Map(
        unique.map((id) => {
          const own = byId.get(id) ?? [];
          return [id, { locales: readyLocales(own), translatedAt: translatedAtOf(own) }];
        }),
      );
    } catch (err) {
      this.logger.warn(`Ready-locale lookup failed (${type}): ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
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
      this.logger.warn(`Translation lookup failed (${type}): ${err instanceof Error ? err.message : String(err)}`);
      return new Map();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Yönetim                                                           */
  /* ---------------------------------------------------------------- */

  /** Herkese açık tüm ürün/talep/profilleri kuyruğa alır (geriye dönük doldurma). */
  /**
   * KAPSAM DENETİMİ — başkasının görebildiği her kayıt çevrili olmalı
   * (kullanıcı kararı 2026-09-25: "çevirisi olmayan kayıt söz konusu değil").
   * Yazma yolları `enqueue` çağırır ama her yol değil (admin düzenlemesi,
   * seed/e2e betikleri, özellikten önce yayınlanmış kayıtlar). Süpürücü her
   * turda şunları kuyruğa alır: çeviri satırı OLMAYAN ya da kaynağı son
   * çeviriden/denetimden YENİ olan görünür kayıtlar —
   *   · ürün: vitrinde ya da onay bekliyor (onay anında EN/RU hazır olsun) · talep: yayınlanmış (her durum; teklifçi
   *     ve vitrin kapanmış talebi de görür) · firma: kayıt tamamlanmış, aktif,
   *     metni var (`hasTranslatableText` ile aynı ≥2 karakter kuralı).
   * Taslak ürün/talep çevrilmez: yalnız sahibi görür, sahibi kendi metnini
   * HAM okur; yayın/onay anında zaten kuyruğa girer.
   * Kalıcı FAILED (ilk 3 deneme bitti) 6 saatte bir, toplam 9 denemeye dek yeniden denenir.
   * İSTEM SÜRÜMÜ: satırın özeti güncel önekle (`SOURCE_HASH_PREFIX`) başlamıyorsa
   * kayıt bayattır — `TRANSLATION_PROMPT_VERSION` artınca her şey yeniden çevrilir.
   */
  async ensureCoverage(limit = 50): Promise<{ products: number; listings: number; companies: number; retried: number }> {
    // Kalıcı FAILED sıfırlanmaz: süpürücü onu 6 saatte bir, toplam tavana dek
    // yeniden seçer (sayaç birikir). Burada yalnız sayılır.
    const retried = await this.prisma.contentTranslation.count({
      where: {
        status: "FAILED",
        attempts: { gte: MAX_ATTEMPTS, lt: MAX_TOTAL_ATTEMPTS },
        updatedAt: { lt: new Date(Date.now() - FAILED_RETRY_MS) },
      },
    });
    const current = `${SOURCE_HASH_PREFIX}%`;
    const products = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT e."id" FROM "company_items" e
       WHERE (e."isPublic" = true OR e."reviewStatus"::text = 'PENDING')
         AND NOT EXISTS (SELECT 1 FROM "content_translations" t
                          WHERE t."entityType"::text = 'PRODUCT' AND t."entityId" = e."id" AND t."updatedAt" >= e."updatedAt"
                            AND t."sourceHash" LIKE ${current})
       ORDER BY e."updatedAt" ASC LIMIT ${limit}`;
    const listings = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT e."id" FROM "listings" e
       WHERE e."publishedAt" IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM "content_translations" t
                          WHERE t."entityType"::text = 'LISTING' AND t."entityId" = e."id" AND t."updatedAt" >= e."updatedAt"
                            AND t."sourceHash" LIKE ${current})
       ORDER BY e."updatedAt" ASC LIMIT ${limit}`;
    const companies = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT e."id" FROM "companies" e
       WHERE e."onboardingCompletedAt" IS NOT NULL AND e."isActive" = true
         AND (length(btrim(coalesce(e."aboutText", ''))) >= 2
              OR length(btrim(coalesce(e."industry", ''))) >= 2
              OR EXISTS (SELECT 1 FROM unnest(e."services") s WHERE length(btrim(s)) >= 2))
         AND NOT EXISTS (SELECT 1 FROM "content_translations" t
                          WHERE t."entityType"::text = 'COMPANY' AND t."entityId" = e."id" AND t."updatedAt" >= e."updatedAt"
                            AND t."sourceHash" LIKE ${current})
       ORDER BY e."updatedAt" ASC LIMIT ${limit}`;
    const out = { products: 0, listings: 0, companies: 0, retried };
    for (const r of products) if (await this.enqueueQuiet("PRODUCT", r.id)) out.products += 1;
    for (const r of listings) if (await this.enqueueQuiet("LISTING", r.id)) out.listings += 1;
    for (const r of companies) if (await this.enqueueQuiet("COMPANY", r.id)) out.companies += 1;
    return out;
  }

  async enqueueAllPublic(where: {
    products: Prisma.CompanyItemWhereInput;
    listings: Prisma.ListingWhereInput;
    companies: Prisma.CompanyWhereInput;
  }): Promise<{ products: number; listings: number; companies: number }> {
    const [products, listings, companies] = await Promise.all([
      this.prisma.companyItem.findMany({ where: where.products, select: { id: true } }),
      this.prisma.listing.findMany({ where: where.listings, select: { id: true, companyId: true } }),
      this.prisma.company.findMany({ where: where.companies, select: { id: true } }),
    ]);
    const counts = { products: 0, listings: 0, companies: 0 };
    // `kick` olmadan yalnız satır aç; süpürücü (ya da `sweepAll`) sırayla çevirir —
    // aynı anda yüzlerce model çağrısı açılmasın.
    for (const p of products) if (await this.enqueueQuiet("PRODUCT", p.id)) counts.products += 1;
    for (const l of listings) if (await this.enqueueQuiet("LISTING", l.id)) counts.listings += 1;
    for (const c of companies) if (await this.enqueueQuiet("COMPANY", c.id)) counts.companies += 1;
    // Talep sahipleri (herkese açık profili olmayanlar dahil): sektör talep sayfasında görünür.
    const ownerIds = [...new Set(listings.map((l) => l.companyId))].filter((cid) => !companies.some((c) => c.id === cid));
    for (const cid of ownerIds) if (await this.enqueueQuiet("COMPANY", cid)) counts.companies += 1;
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
      })().catch((err) => this.logger.warn(`Bulk translation stopped: ${err instanceof Error ? err.message : String(err)}`));
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
      model: this.resolvedModel ?? this.modelCandidates()[0] ?? null,
      byStatus,
      costUsd: Number(cost._sum.costUsd ?? 0),
      lastErrors,
    };
  }
}
