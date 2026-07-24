import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@rothern/db";
import type {
  AiAssistantReply,
  AiChatSessionDetailDto,
  AiChatSessionSummaryDto,
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
import { SUGGEST_NEW_CHAT_AFTER, planWindow, type StoredMessage } from "./window";

const MAX_TOOL_ITERATIONS = 4;
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
  ) {}

  async message(
    user: AuthenticatedCompanyUser,
    dto: { sessionId?: string; message: string },
  ): Promise<AiAssistantReply> {
    this.ai.assertAiAccess(user); // AI-0 kapısı: SA/ST + Silver+
    const provider = this.provider!;
    const text = (dto.message ?? "").trim().slice(0, MAX_TURN_MESSAGE_LEN);
    if (!text) throw new ForbiddenException("Mesaj boş olamaz");

    const session = dto.sessionId
      ? await this.loadOwnSession(user, dto.sessionId)
      : await this.prisma.aiChatSession.create({
          data: {
            companyId: user.companyId,
            userId: user.userId,
            title: text.slice(0, 60),
          },
        });

    const stored = await this.loadMessages(session.id);
    const plan = planWindow(stored, session.summary, session.summarizedThroughSeq);

    const portals = allowedPortals(user.roles);
    const toolDefs = toolDefsForUser(portals);

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
    const history: AiHistoryTurn[] = [
      ...plan.history,
      { role: "user", parts: [{ text }] },
    ];
    const totalUsage: AiTokenUsage = {
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0,
    };
    const toolsUsed: string[] = [];
    let reply = "";

    try {
      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const result = await provider.complete({
          model: this.config.models.default,
          system: ASSISTANT_SYSTEM_PROMPT,
          prompt: "",
          history,
          tools: toolDefs,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          timeoutMs: this.config.timeoutMs,
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
            system: ASSISTANT_SYSTEM_PROMPT,
            prompt: "",
            history,
            maxOutputTokens: MAX_OUTPUT_TOKENS,
            timeoutMs: this.config.timeoutMs,
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
      this.logger.warn(
        `Asistan sağlayıcı hatası: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new ForbiddenException(
        "Asistan şu anda yanıt veremedi — lütfen tekrar deneyin.",
      );
    }

    const settled = await this.budget.settle(reservation.id, totalUsage);
    if (!reply.trim()) {
      reply = "Şu an bu isteğe yanıt oluşturamadım. Farklı bir şekilde sorabilir misiniz?";
    }

    // Mesajları kaydet + pencere taşıyorsa özetle + tur sayacı.
    const nextSeq = stored.length > 0 ? stored[stored.length - 1]!.seq : 0;
    await this.prisma.$transaction([
      this.prisma.aiChatMessage.create({
        data: { sessionId: session.id, seq: nextSeq + 1, role: "USER", content: text },
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
        data: { turnCount: { increment: 1 }, lastMessageAt: new Date() },
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
