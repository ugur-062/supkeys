import { Injectable, Logger } from "@nestjs/common";
import type { Locale } from "@rothern/i18n";
import { hiddenCategoryWhere } from "@rothern/shared";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import { ContentTranslationService } from "./content-translation.service";
import {
  buildCategoryPrompt,
  CATEGORY_BATCH_SIZE,
  CATEGORY_SYSTEM_PROMPT,
  parseCategoryBatch,
  type CategoryBatchRow,
} from "./category-translation.logic";

/**
 * Kategori adı EN/RU toplu çevirisi (i18n Faz 4) — TEK SEFERLİK iş: staging'de
 * koşar, sonuç `export-category-names-i18n` ile depoya (TSV) yazılır; canlı ve
 * yeniden seed TSV'den okur, model çağrısı yapmaz. Görünür segmentlerdeki
 * (gizli 29 segment hariç) tüm satırlar; `nameEn`/`nameRu` NULL olanlar.
 */
const CATEGORY_WORKERS = 4;

@Injectable()
export class CategoryTranslationService {
  private readonly logger = new Logger(CategoryTranslationService.name);
  private running = false;
  private progress = { done: 0, failed: 0, batches: 0, costUsd: 0, startedAt: null as string | null, finishedAt: null as string | null, lastError: null as string | null };

  constructor(
    private readonly prisma: PrismaBypassService,
    private readonly translations: ContentTranslationService,
  ) {}

  async status() {
    const visible = hiddenCategoryWhere();
    const [total, en, ru] = await Promise.all([
      this.prisma.category.count({ where: { ...visible } }),
      this.prisma.category.count({ where: { ...visible, nameEn: { not: null } } }),
      this.prisma.category.count({ where: { ...visible, nameRu: { not: null } } }),
    ]);
    return { visible: total, translated: { en, ru }, running: this.running, progress: this.progress, enabled: this.translations.enabled };
  }

  /** Arka planda başlatır (istek yanıtı beklemez). */
  start(locales: Locale[] = ["en", "ru"]): { started: boolean; reason?: string } {
    if (!this.translations.enabled) return { started: false, reason: "translation provider not configured" };
    if (this.running) return { started: false, reason: "already running" };
    this.running = true;
    this.progress = { done: 0, failed: 0, batches: 0, costUsd: 0, startedAt: new Date().toISOString(), finishedAt: null, lastError: null };
    setImmediate(() => {
      void this.run(locales)
        .catch((err) => { this.progress.lastError = err instanceof Error ? err.message : String(err); this.logger.error(`Category translation stopped: ${this.progress.lastError}`); })
        .finally(() => { this.running = false; this.progress.finishedAt = new Date().toISOString(); });
    });
    return { started: true };
  }

  private async run(locales: Locale[]): Promise<void> {
    const wantEn = locales.includes("en"), wantRu = locales.includes("ru");
    const rows = await this.prisma.category.findMany({
      where: {
        ...hiddenCategoryWhere(),
        OR: [...(wantEn ? [{ nameEn: null }] : []), ...(wantRu ? [{ nameRu: null }] : [])],
      },
      select: { code: true, level: true, nameTr: true, nameEn: true, nameRu: true, parentId: true },
      orderBy: [{ level: "asc" }, { code: "asc" }],
    });
    const parentIds = [...new Set(rows.map((r) => r.parentId).filter((x): x is string => !!x))];
    const parents = new Map<string, string>();
    for (let i = 0; i < parentIds.length; i += 5000) {
      const ps = await this.prisma.category.findMany({ where: { id: { in: parentIds.slice(i, i + 5000) } }, select: { id: true, nameTr: true } });
      for (const p of ps) parents.set(p.id, p.nameTr);
    }
    this.logger.log(`Category translation: ${rows.length} rows to translate (${locales.join(",")})`);
    const queue: CategoryBatchRow[][] = [];
    for (let i = 0; i < rows.length; i += CATEGORY_BATCH_SIZE) {
      queue.push(rows.slice(i, i + CATEGORY_BATCH_SIZE).map((r) => ({ code: r.code, level: r.level, tr: r.nameTr, parentTr: r.parentId ? parents.get(r.parentId) ?? null : null })));
    }
    // Sıralı koşum parti başına ~1 dk (120 ad) → 19 bin satır ~2,5 saat; dört
    // işçi aynı kuyruktan çeker (JS tek iş parçacıklı: kuyruk yarışı yok),
    // sağlayıcı kotası içinde kalır (~40 dk).
    const worker = async () => {
      while (queue.length) {
        const batch = queue.shift()!;
        const ok = await this.translateBatch(batch, locales);
        if (!ok) {
          if (batch.length > 10) { const mid = Math.ceil(batch.length / 2); queue.push(batch.slice(0, mid), batch.slice(mid)); }
          else this.progress.failed += batch.length;
        }
      }
    };
    await Promise.all(Array.from({ length: CATEGORY_WORKERS }, () => worker()));
    this.logger.log(`Category translation finished: ${this.progress.done} done, ${this.progress.failed} failed, ${this.progress.batches} batches, ${this.progress.costUsd.toFixed(2)} USD`);
  }

  private async translateBatch(batch: CategoryBatchRow[], locales: Locale[]): Promise<boolean> {
    this.progress.batches += 1;
    let feedback: string | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const prompt = buildCategoryPrompt(batch, locales) + (feedback ? `\n\nPrevious attempt was rejected: ${feedback}. Return the full corrected array.` : "");
      const res = await this.translations.completeWithFallback(CATEGORY_SYSTEM_PROMPT, prompt, { maxOutputTokens: 16384, timeoutMs: 180_000 });
      if ("error" in res) { this.progress.lastError = res.error; this.logger.warn(`Category batch provider error: ${res.error}`); return false; }
      this.progress.costUsd += res.cost;
      const parsed = parseCategoryBatch(batch, res.text);
      if ("error" in parsed) { feedback = parsed.error; this.progress.lastError = parsed.error; continue; }
      await this.prisma.$transaction(
        batch.map((r) => {
          const t = parsed.byCode.get(r.code)!;
          const data: { nameEn?: string; nameRu?: string } = {};
          if (locales.includes("en") && t.en) data.nameEn = t.en;
          if (locales.includes("ru") && t.ru) data.nameRu = t.ru;
          return this.prisma.category.update({ where: { code: r.code }, data });
        }),
      );
      this.progress.done += batch.length;
      return true;
    }
    return false;
  }
}
