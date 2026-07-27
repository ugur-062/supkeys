import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@rothern/db";
import type {
  AiAssistantReply,
  AiChatSessionDetailDto,
  AiChatSessionSummaryDto,
  AiTenderDraft,
  AiTenderExtractResult,
} from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CompanyConnectionsService } from "../../company-connections/services/company-connections.service";
import { CompanyListingsService } from "../../company-listings/services/company-listings.service";
import { CompanyOrdersService } from "../../company-orders/services/company-orders.service";
import { AI_CONFIG, AI_PROVIDER_TOKEN, type AiConfig } from "../ai.config";
import { AiBudgetService, costFromUsage } from "../ai-budget.service";
import { AiService } from "../ai.service";
import {
  BaseAiProvider,
  type AiHistoryTurn,
  type AiTokenUsage,
  type AiToolCall,
} from "../providers/ai-provider.interface";
import {
  ASSISTANT_SYSTEM_PROMPT,
  SUMMARY_SYSTEM_PROMPT,
  buildDraftContext,
  buildSummaryPrompt,
} from "./assistant.prompts";
import {
  TOOL_NAMES,
  allowedPortals,
  canListMyBids,
  canListMyTenders,
  canSearchOpen,
  toolDefsForUser,
  trimList,
  type Portal,
} from "./assistant-tools";
import { sanitizeAiDraft } from "../tender-extract/ai-draft-sanitizer";
import { CategorySuggestService } from "../tender-extract/category-suggest.service";
import { TenderExtractService } from "../tender-extract/tender-extract.service";
import { AssistantActionsService } from "./assistant-actions.service";
import { SUGGEST_NEW_CHAT_AFTER, planWindow, type StoredMessage } from "./window";

const MAX_TOOL_ITERATIONS = 4;
/** Tur-geneli süre bütçesi — araç döngüsündeki TÜM Gemini çağrılarının toplamı.
 *  Frontend'in asistan timeout'undan (180sn) belirgin küçük olmalı ki hata
 *  durumunda kullanıcı backend'in Türkçe mesajını görsün, axios düşmesin. */
const TURN_DEADLINE_MS = 90_000;
const MAX_TURN_MESSAGE_LEN = 4000;
const MAX_TOOL_RESULT_CHARS = 8000;
const MAX_OUTPUT_TOKENS = 1024;
/** Araç hatası (403/404/timeout/beklenmeyen) → hep bu nötr sonuç (bilgi sızmaz). */
const NEUTRAL_ERROR = { error: "unavailable" } as const;

@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(
    @Inject(AI_CONFIG) private readonly config: AiConfig,
    @Inject(AI_PROVIDER_TOKEN) private readonly provider: BaseAiProvider | null,
    private readonly ai: AiService,
    private readonly budget: AiBudgetService,
    private readonly prisma: PrismaService,
    private readonly listings: CompanyListingsService,
    private readonly orders: CompanyOrdersService,
    private readonly connections: CompanyConnectionsService,
    private readonly tenderExtract: TenderExtractService,
    private readonly categorySuggest: CategorySuggestService,
    private readonly actions: AssistantActionsService,
  ) {}

  async message(
    user: AuthenticatedCompanyUser,
    dto: { sessionId?: string; message: string; fileKeys?: string[] },
  ): Promise<AiAssistantReply> {
    this.ai.assertAiAccess(user); // AI-0 kapısı: SA/ST + Silver+
    const provider = this.provider!;
    const text = (dto.message ?? "").trim().slice(0, MAX_TURN_MESSAGE_LEN);
    if (!text && !(dto.fileKeys && dto.fileKeys.length > 0)) {
      throw new ForbiddenException("Mesaj boş olamaz");
    }

    const session = dto.sessionId
      ? await this.loadOwnSession(user, dto.sessionId)
      : await this.prisma.aiChatSession.create({
          data: {
            companyId: user.companyId,
            userId: user.userId,
            title: (text || "İhale taslağı").slice(0, 60),
          },
        });

    // AI-3: oturumda biriken taslak (belge + konuşma birleşiminin kaynağı).
    let draft: AiTenderExtractResult | null = this.reviveDraft(session.tenderDraft);
    let draftTouched = false;

    // Belge yüklendiyse ihale çıkarımı yap, mevcut taslakla birleştir.
    if (dto.fileKeys && dto.fileKeys.length > 0) {
      const listingType: "ALIM" | "SATIS" = allowedPortals(user.roles).has("satinalma")
        ? "ALIM"
        : "SATIS";
      const extracted = await this.tenderExtract.extract(user, {
        fileKeys: dto.fileKeys,
        listingType,
      });
      draft = draft ? this.mergeDrafts(draft, extracted) : extracted;
      draftTouched = true;
    }

    const stored = await this.loadMessages(session.id);
    const plan = planWindow(stored, session.summary, session.summarizedThroughSeq);

    const portals = allowedPortals(user.roles);
    const toolDefs = toolDefsForUser(portals);

    // AI-3: taslak varsa modele context ver (system prompt'a eklenir).
    const systemPrompt = draft
      ? `${ASSISTANT_SYSTEM_PROMPT}\n\n${buildDraftContext(
          JSON.stringify(draft.draft),
          draft.missingRequired,
        )}`
      : ASSISTANT_SYSTEM_PROMPT;

    // Bütçe rezervasyonu ÇAĞRIDAN ÖNCE (fail-closed worst-case tahmin: araç
    // döngüsü + çıktı). Gerçek maliyet settle'da düzeltilir.
    const estInputChars =
      ASSISTANT_SYSTEM_PROMPT.length +
      JSON.stringify(toolDefs).length +
      plan.history.reduce((n, t) => n + JSON.stringify(t).length, 0) +
      text.length;
    const estUsage: AiTokenUsage = {
      inputTokens:
        Math.ceil(estInputChars / 4) +
        MAX_TOOL_ITERATIONS * (MAX_TOOL_RESULT_CHARS / 4),
      outputTokens: MAX_OUTPUT_TOKENS * MAX_TOOL_ITERATIONS,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const reservation = await this.budget.reserve({
      companyId: user.companyId,
      userId: user.userId,
      userEmail: user.email,
      feature: "assistant",
      metadata: { kind: "chat", sessionId: session.id },
      candidates: [
        {
          model: this.config.models.default,
          estimatedCostUsd: costFromUsage(
            estUsage,
            this.config.pricing[this.config.models.default]!,
          ),
          isPremium: false,
        },
      ],
    });

    // Araç döngüsü — usage'ları topla, tek settle. Kullanıcı mesajı history'nin
    // SONUNA user turu olarak eklenir (prompt boş) → contents daima user turuyla
    // başlar ve fnResponse sonrası model devam eder (Gemini tur-sıra kuralı).
    const effectiveText =
      text ||
      "Yüklediğim belgeden ihale taslağı hazırla; eksik zorunlu alanları sırayla sor.";
    const history: AiHistoryTurn[] = [
      ...plan.history,
      { role: "user", parts: [{ text: effectiveText }] },
    ];
    const totalUsage: AiTokenUsage = {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    };
    const toolsUsed: string[] = [];
    let reply = "";
    // AI-4: bu turda üretilen onay kartı (en fazla 1 — sonuncusu kazanır).
    let pendingAction: AiAssistantReply["pendingAction"];
    const deadlineAt = Date.now() + TURN_DEADLINE_MS;

    try {
      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const result = await provider.complete({
          model: this.config.models.default,
          system: systemPrompt,
          prompt: "",
          history,
          tools: toolDefs,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          timeoutMs: this.config.timeoutMs,
          deadlineAt,
        });
        accumulate(totalUsage, result.usage);

        if (!result.toolCalls || result.toolCalls.length === 0) {
          reply = result.text;
          break;
        }

        // Model turu (araç çağrıları) + kullanıcı turu (araç sonuçları) history'e.
        // Gemini thought signature'ı functionCall part'ıyla birlikte KORUNUR.
        history.push({
          role: "model",
          parts: result.toolCalls.map((tc) => ({
            functionCall: { name: tc.name, args: tc.args },
            ...(tc.signature ? { signature: tc.signature } : {}),
          })),
        });
        const responseParts = [];
        for (const call of result.toolCalls) {
          toolsUsed.push(call.name);
          // AI-3: taslak toplama aracı — yürütme YOK, argümanlar sanitize edilip
          // taslağa dönüşür (BAĞLAYICI DEĞİL; ihale açılmaz).
          if (call.name === TOOL_NAMES.proposeTenderDraft) {
            const s = sanitizeAiDraft(call.args, "refine");
            draft = {
              ...s,
              route: "text",
              downgraded: false,
              warned: false,
            };
            draftTouched = true;
            responseParts.push({
              functionResponse: {
                name: call.name,
                response: { status: "ok", missingRequired: s.missingRequired },
              },
            });
            continue;
          }
          // AI-4: aksiyon önerisi — YÜRÜTMEZ; doğrulanmış onay kartı üretir.
          // Tembel eşleme: metod referansı ÇAĞRI ANINDA çözülür (map kurarken
          // .bind patlaması olmasın — test stub'ları kısmi olabilir).
          const proposeFn = this.resolveProposeFn(call.name);
          if (proposeFn) {
            const outcome = await proposeFn(user, session.id, call.args).catch(
              () => ({ ok: false as const, problem: "İşlem önerisi hazırlanamadı." }),
            );
            if (outcome.ok && outcome.pending) pendingAction = outcome.pending;
            responseParts.push({
              functionResponse: {
                name: call.name,
                response: outcome.ok
                  ? { status: "pending_confirmation", note: "Onay kartı kullanıcıya gösterildi; onayı KULLANICI verir." }
                  : { status: "blocked", problem: outcome.problem },
              },
            });
            continue;
          }
          const toolResult = await this.runTool(user, portals, call);
          responseParts.push({
            functionResponse: { name: call.name, response: toolResult },
          });
        }
        history.push({ role: "user", parts: responseParts });
        // Sonraki tur prompt="" — history functionResponse ile biter, model
        // araç sonuçlarıyla devam eder.
        if (iter === MAX_TOOL_ITERATIONS - 1) {
          // Son tur: araçsız bir kapanış çağrısı (aksi halde reply boş kalır).
          const closing = await provider.complete({
            model: this.config.models.default,
            system: systemPrompt,
            prompt: "",
            history,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            timeoutMs: this.config.timeoutMs,
            deadlineAt,
          });
          accumulate(totalUsage, closing.usage);
          reply = closing.text;
        }
      }
    } catch (err) {
      await this.budget.fail(reservation.id, {
        errorCode: "provider_error",
        usage: sumHasTokens(totalUsage) ? totalUsage : undefined,
      });
      const raw = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Asistan sağlayıcı hatası: ${raw}`);
      // Gemini durum kodunu kullanıcıya-güvenli biçimde yansıt (anahtar/gövde
      // sızmaz): 503/429 = yoğunluk (tekrar dene), diğer = model/config sorunu.
      throw new ServiceUnavailableException(
        "Asistan şu an yanıt veremedi — birkaç saniye sonra tekrar deneyin.",
      );
    }

    // Konuşmayla toplanan taslakta kalem var ama kategori önerisi yoksa üret
    // (belge yolu extract() içinde zaten önerir). suggest() hata yutar — turu
    // asla düşürmez.
    if (
      draftTouched &&
      draft &&
      draft.draft.suggestedCategoryIds.length === 0 &&
      draft.draft.items.some((i) => i.name)
    ) {
      const ids = await this.categorySuggest.suggest(user, draft.draft.items);
      if (ids.length > 0) {
        draft = {
          ...draft,
          draft: { ...draft.draft, suggestedCategoryIds: ids },
          missingRequired: draft.missingRequired.filter(
            (m) => !m.startsWith("Kategori"),
          ),
        };
      }
    }

    const settled = await this.budget.settle(reservation.id, totalUsage);
    if (!reply.trim()) {
      reply = "Şu an bu isteğe yanıt oluşturamadım. Farklı bir şekilde sorabilir misiniz?";
    }

    // Mesajları kaydet + pencere taşıyorsa özetle + tur sayacı + AI-3 taslak.
    const nextSeq = stored.length > 0 ? stored[stored.length - 1]!.seq : 0;
    const userContent =
      text || (dto.fileKeys && dto.fileKeys.length > 0 ? "[belge yüklendi]" : "");
    await this.prisma.$transaction([
      this.prisma.aiChatMessage.create({
        data: { sessionId: session.id, seq: nextSeq + 1, role: "USER", content: userContent },
      }),
      this.prisma.aiChatMessage.create({
        data: {
          sessionId: session.id,
          seq: nextSeq + 2,
          role: "ASSISTANT",
          content: reply,
          toolTrace:
            toolsUsed.length > 0
              ? ({ tools: [...new Set(toolsUsed)] } as Prisma.InputJsonValue)
              : undefined,
        },
      }),
      this.prisma.aiChatSession.update({
        where: { id: session.id },
        data: {
          turnCount: { increment: 1 },
          lastMessageAt: new Date(),
          // AI-3: taslak bu turda değiştiyse oturuma yaz (belge/konuşma birleşimi).
          ...(draftTouched && draft
            ? { tenderDraft: draft.draft as unknown as Prisma.InputJsonValue }
            : {}),
        },
      }),
    ]);

    // Kayan pencere: taşan turlar varsa BİR KEZ özetle (ayrı, aynı bütçeden).
    await this.maybeSummarize(user, session.id).catch((err: unknown) =>
      this.logger.warn(
        `Özetleme başarısız (${session.id}): ${err instanceof Error ? err.message : String(err)}`,
      ),
    );

    const turnCount = session.turnCount + 1;
    return {
      sessionId: session.id,
      reply,
      suggestNewChat: turnCount >= SUGGEST_NEW_CHAT_AFTER,
      warned: settled.warned,
      toolsUsed: [...new Set(toolsUsed)],
      // AI-3: taslak toplandıysa yanıta koy (frontend kart + "formu aç" için).
      ...(draft ? { tenderDraft: draft } : {}),
      // AI-4: onay bekleyen aksiyon — frontend onay kartı çizer.
      ...(pendingAction ? { pendingAction } : {}),
    };
  }

  /** AI-4: araç adı → aksiyon önerici (yoksa null → normal araç akışı). */
  private resolveProposeFn(
    name: string,
  ):
    | ((
        u: AuthenticatedCompanyUser,
        sessionId: string,
        args: Record<string, unknown>,
      ) => ReturnType<AssistantActionsService["proposeSendInvites"]>)
    | null {
    switch (name) {
      case TOOL_NAMES.requestSendInvites:
        return (u, s, a) => this.actions.proposeSendInvites(u, s, a);
      case TOOL_NAMES.requestPublishTender:
        return (u, s, a) => this.actions.proposePublishTender(u, s, a);
      case TOOL_NAMES.requestEliminateBid:
        return (u, s, a) => this.actions.proposeEliminateBid(u, s, a);
      case TOOL_NAMES.requestAwardTender:
        return (u, s, a) => this.actions.proposeAwardTender(u, s, a);
      case TOOL_NAMES.requestPlaceBid:
        return (u, s, a) => this.actions.proposePlaceBid(u, s, a);
      case TOOL_NAMES.requestMarkOrderReceived:
        return (u, s, a) => this.actions.proposeMarkOrderReceived(u, s, a);
      default:
        return null;
    }
  }

  /** Oturumdaki ham taslak JSON'unu AiTenderExtractResult'a diriltir. */
  private reviveDraft(raw: unknown): AiTenderExtractResult | null {
    if (raw == null || typeof raw !== "object") return null;
    // Saklanan sanitize edilmiş AiTenderDraft — flags/missingRequired yeniden türetilir.
    const s = sanitizeAiDraft(raw, "refine");
    return { ...s, route: "text", downgraded: false, warned: false };
  }

  /** Belge taslağını mevcut taslakla birleştir — yeni dolu alanlar öncelik. */
  private mergeDrafts(
    base: AiTenderExtractResult,
    incoming: AiTenderExtractResult,
  ): AiTenderExtractResult {
    const b = base.draft;
    const n = incoming.draft;
    const pick = <K extends keyof AiTenderDraft>(k: K): AiTenderDraft[K] =>
      (n[k] ?? b[k]) as AiTenderDraft[K];
    const merged: AiTenderDraft = {
      title: pick("title"),
      description: pick("description"),
      primaryCurrency: pick("primaryCurrency"),
      deliveryTerm: pick("deliveryTerm"),
      paymentCategory: pick("paymentCategory"),
      paymentDays: pick("paymentDays"),
      advancePercent: pick("advancePercent"),
      bidsCloseAt: pick("bidsCloseAt"),
      keywords: n.keywords.length > 0 ? n.keywords : b.keywords,
      isInternational: pick("isInternational"),
      termsAndConditions: pick("termsAndConditions"),
      items: n.items.length > 0 ? n.items : b.items,
      pricesIncludeVat: pick("pricesIncludeVat"),
      pageSummaries: n.pageSummaries.length > 0 ? n.pageSummaries : b.pageSummaries,
      suggestedCategoryIds:
        n.suggestedCategoryIds.length > 0
          ? n.suggestedCategoryIds
          : b.suggestedCategoryIds,
    };
    // missingRequired'ı birleşik taslaktan yeniden hesapla (sanitize üzerinden).
    const re = sanitizeAiDraft(merged, "refine");
    return {
      draft: merged,
      flags: re.flags,
      missingRequired: re.missingRequired,
      route: incoming.route,
      downgraded: incoming.downgraded,
      warned: incoming.warned,
    };
  }

  /** Araç yürütücü — beyaz-liste + portal-kısıt + nötr hata (bilgi sızmaz). */
  private async runTool(
    user: AuthenticatedCompanyUser,
    portals: Set<Portal>,
    call: AiToolCall,
  ): Promise<Record<string, unknown>> {
    try {
      switch (call.name) {
        case TOOL_NAMES.listMyTenders: {
          const type = call.args.type === "SATIS" ? "SATIS" : "ALIM";
          if (!canListMyTenders(portals, type)) return { ...NEUTRAL_ERROR };
          return trimList(await this.listings.listTenders(user.companyId, type));
        }
        case TOOL_NAMES.searchOpenTenders: {
          const type = call.args.type === "SATIS" ? "SATIS" : "ALIM";
          if (!canSearchOpen(portals, type)) return { ...NEUTRAL_ERROR };
          const res = (await this.listings.sellerTenders(user, type)) as unknown;
          return this.capObject(res);
        }
        case TOOL_NAMES.listMyBids: {
          if (!canListMyBids(portals)) return { ...NEUTRAL_ERROR };
          return trimList(await this.listings.listMyBids(user.companyId));
        }
        case TOOL_NAMES.getTenderDetail: {
          const id = String(call.args.id ?? "");
          if (!id) return { ...NEUTRAL_ERROR };
          return this.capObject(await this.listings.getOne(user, id));
        }
        case TOOL_NAMES.listMyOrders:
          return trimList(await this.orders.list(user.companyId));
        case TOOL_NAMES.getOrderDetail: {
          const id = String(call.args.id ?? "");
          if (!id) return { ...NEUTRAL_ERROR };
          return this.capObject(await this.orders.getOne(user, id));
        }
        case TOOL_NAMES.listMyConnections:
          return trimList(await this.connections.list(user.companyId));
        default:
          return { ...NEUTRAL_ERROR };
      }
    } catch (err) {
      // 403/404/timeout/beklenmeyen — AYRIM YAPMA (varlık/yetki bilgisi sızmasın).
      if (
        !(err instanceof ForbiddenException) &&
        !(err instanceof NotFoundException)
      ) {
        this.logger.warn(
          `Araç hatası (${call.name}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return { ...NEUTRAL_ERROR };
    }
  }

  /** JSON boyut tavanı — büyük detay yanıtı modelin bağlamını şişirmesin. */
  private capObject(obj: unknown): Record<string, unknown> {
    const json = JSON.stringify(obj ?? {});
    if (json.length <= MAX_TOOL_RESULT_CHARS) {
      return { data: obj };
    }
    return { data: json.slice(0, MAX_TOOL_RESULT_CHARS), truncated: true };
  }

  private async maybeSummarize(
    user: AuthenticatedCompanyUser,
    sessionId: string,
  ): Promise<void> {
    const session = await this.prisma.aiChatSession.findUnique({
      where: { id: sessionId },
      select: { summary: true, summarizedThroughSeq: true },
    });
    if (!session || !this.provider) return;
    const stored = await this.loadMessages(sessionId);
    const plan = planWindow(stored, session.summary, session.summarizedThroughSeq);
    if (plan.toSummarize.length === 0) return;

    const overflowText = plan.toSummarize
      .map((m) => `${m.role === "USER" ? "Kullanıcı" : "Asistan"}: ${m.content}`)
      .join("\n");
    const prompt = buildSummaryPrompt(session.summary, overflowText);

    const est: AiTokenUsage = {
      inputTokens: Math.ceil((SUMMARY_SYSTEM_PROMPT.length + prompt.length) / 4),
      outputTokens: 512,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    };
    const reservation = await this.budget.reserve({
      companyId: user.companyId,
      userId: user.userId,
      userEmail: user.email,
      feature: "assistant",
      metadata: { kind: "summary", sessionId },
      candidates: [
        {
          model: this.config.models.default,
          estimatedCostUsd: costFromUsage(est, this.config.pricing[this.config.models.default]!),
          isPremium: false,
        },
      ],
    });
    try {
      const result = await this.provider.complete({
        model: this.config.models.default,
        system: SUMMARY_SYSTEM_PROMPT,
        prompt,
        maxOutputTokens: 512,
        timeoutMs: this.config.timeoutMs,
      });
      await this.budget.settle(reservation.id, result.usage);
      await this.prisma.aiChatSession.update({
        where: { id: sessionId },
        data: {
          summary: result.text.trim().slice(0, 4000),
          summarizedThroughSeq: plan.newSummarizedThroughSeq,
        },
      });
    } catch (err) {
      await this.budget.fail(reservation.id, { errorCode: "summary_failed" });
      throw err;
    }
  }

  // ── Oturum yönetimi (kullanıcıya scope'lu) ──────────────────────────────

  async listSessions(user: AuthenticatedCompanyUser): Promise<AiChatSessionSummaryDto[]> {
    this.ai.assertAiAccess(user);
    const rows = await this.prisma.aiChatSession.findMany({
      where: { companyId: user.companyId, userId: user.userId, archivedAt: null },
      orderBy: { lastMessageAt: "desc" },
      take: 50,
      select: { id: true, title: true, lastMessageAt: true, turnCount: true },
    });
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      lastMessageAt: r.lastMessageAt.toISOString(),
      turnCount: r.turnCount,
    }));
  }

  async getSession(
    user: AuthenticatedCompanyUser,
    sessionId: string,
  ): Promise<AiChatSessionDetailDto> {
    const session = await this.loadOwnSession(user, sessionId);
    const messages = await this.prisma.aiChatMessage.findMany({
      where: { sessionId },
      orderBy: { seq: "asc" },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    return {
      id: session.id,
      title: session.title,
      lastMessageAt: session.lastMessageAt.toISOString(),
      turnCount: session.turnCount,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    };
  }

  async deleteSession(user: AuthenticatedCompanyUser, sessionId: string): Promise<void> {
    await this.loadOwnSession(user, sessionId);
    await this.prisma.aiChatSession.delete({ where: { id: sessionId } });
  }

  /** Oturumu YALNIZ sahibi kullanıcıya çözer (userId+companyId scope). */
  private async loadOwnSession(user: AuthenticatedCompanyUser, sessionId: string) {
    this.ai.assertAiAccess(user);
    const session = await this.prisma.aiChatSession.findFirst({
      where: {
        id: sessionId,
        companyId: user.companyId,
        userId: user.userId,
        archivedAt: null,
      },
    });
    if (!session) throw new NotFoundException("Sohbet bulunamadı");
    return session;
  }

  private async loadMessages(sessionId: string): Promise<StoredMessage[]> {
    const rows = await this.prisma.aiChatMessage.findMany({
      where: { sessionId },
      orderBy: { seq: "asc" },
      select: { seq: true, role: true, content: true },
    });
    return rows.map((r) => ({ seq: r.seq, role: r.role, content: r.content }));
  }
}

function accumulate(total: AiTokenUsage, add: AiTokenUsage): void {
  total.inputTokens += add.inputTokens;
  total.outputTokens += add.outputTokens;
  total.cacheReadTokens += add.cacheReadTokens;
  total.cacheWriteTokens += add.cacheWriteTokens;
}
function sumHasTokens(u: AiTokenUsage): boolean {
  return u.inputTokens + u.outputTokens + u.cacheReadTokens > 0;
}
