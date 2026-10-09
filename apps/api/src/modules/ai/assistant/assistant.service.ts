import { entitlementForbidden } from "../../../common/company/entitlement-required";
import { currentLocale } from "../../../common/i18n/locale-context";
import { i18nMessage } from "../../../common/i18n/http-i18n";
import { tApi } from "../../../common/i18n/i18n.service";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, type AiChatSession } from "@rothern/db";
import type {
  AiAssistantReply,
  AiChatSessionDetailDto,
  AiChatSessionSummaryDto,
  AiTenderDraft,
  AiTenderExtractResult,
} from "@rothern/shared";
import { tierAtLeast } from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CompanyConnectionsService } from "../../company-connections/services/company-connections.service";
import { CompanyListingsService } from "../../company-listings/services/company-listings.service";
import { CompanyOrdersService } from "../../company-orders/services/company-orders.service";
import { AI_CONFIG, AI_PROVIDER_TOKEN, type AiConfig } from "../ai.config";
import { AiBudgetService, costFromUsage } from "../ai-budget.service";
import { AiService } from "../ai.service";
import {
  AiProviderError,
  BaseAiProvider,
  type AiHistoryTurn,
  type AiTokenUsage,
  type AiToolCall,
} from "../providers/ai-provider.interface";
import {
  assistantClockContext,
  assistantSystemPrompt,
  summarySystemPrompt,
  buildDraftContext,
  buildSummaryPrompt,
  missingFieldsForPrompt,
} from "./assistant.prompts";
import {
  TOOL_NAMES,
  allowedPortals,
  canListMyBids,
  canListMyTenders,
  canSearchOpen,
  localizeToolCodes,
  redactHiddenCategories,
  toolDefsForUser,
  trimList,
  type ToolStatusKind,
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
/** Thought token'ları da bu tavandan yer (Gemini) — 1024'te model bazı turlarda
 *  tüm bütçeyi düşünmeye harcayıp BOŞ metin dönüyordu (2026-07-27 üretim vakası,
 *  hatasız SETTLED + boş yanıt). 4096 + thinkingLevel "low" ile yapısal çözüm. */
const MAX_OUTPUT_TOKENS = 4096;
/** Asistan turlarında düşünme kısılır: gecikme + thought-token israfı azalır,
 *  thought signature akışı (Gemini 3 zorunluluğu) aynen korunur. */
const THINKING_LEVEL = "low" as const;
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
    const text = (dto.message ?? "").trim().slice(0, MAX_TURN_MESSAGE_LEN);
    if (!text && !(dto.fileKeys && dto.fileKeys.length > 0)) {
      // Boş mesaj yetki değil girdi hatasıdır (arayüz testi O-067: 403 dönüyordu).
      throw new BadRequestException(i18nMessage("api.ai.mesajBosOlamaz"));
    }

    // Belge eki kapıları oturum AÇILMADAN önce (derin denetim A4): reddedilen
    // istek geride boş "taslak" başlıklı öksüz oturum bırakmasın. Belge →
    // talep taslağı yalnız satın alma portalı + GOLD (extract kendi kapısını
    // da korur; burası erken ret).
    const hasFiles = !!(dto.fileKeys && dto.fileKeys.length > 0);
    if (hasFiles) {
      // Yalnız satın alma talebi çıkarılır (satış ilanı kaldırıldı 2026-09-04).
      if (!allowedPortals(user).has("satinalma")) {
        throw new ForbiddenException(i18nMessage("api.ai.belgedenTalepTaslagiYalnizSatinAlma"));
      }
      if (!tierAtLeast(user.tier, "GOLD")) {
        throw entitlementForbidden(user.companyVerificationStatus);
      }
    }

    const createdSession = !dto.sessionId;
    const session = dto.sessionId
      ? await this.loadOwnSession(user, dto.sessionId)
      : await this.prisma.aiChatSession.create({
          data: {
            companyId: user.companyId,
            userId: user.userId,
            // Belgeyle açılan sohbetin başlığı arayüz dilinde (sohbet listesinde görünür).
            title: (text || tApi("api.ai.assistant.draftSessionTitle")).slice(0, 60),
          },
        });

    try {
      return await this.runTurn(user, dto, session, text, hasFiles);
    } catch (err) {
      // Derin denetim LU-04: ilk mesajda açılan oturum, tur mesajları yazılmadan
      // düşerse (portal/belge/bütçe/sağlayıcı hatası) silinir — istemci hata
      // yanıtında sessionId almadığı için her yeniden deneme listede boş bir
      // "hayalet" oturum bırakıyordu. turnCount=0 koşulu: mesajları yazılmış
      // (tur tamamlanmış) oturuma asla dokunulmaz.
      if (createdSession) {
        await this.prisma.aiChatSession
          .deleteMany({ where: { id: session.id, turnCount: 0 } })
          .catch(() => undefined);
      }
      throw err;
    }
  }

  private async runTurn(
    user: AuthenticatedCompanyUser,
    dto: { sessionId?: string; message: string; fileKeys?: string[] },
    session: AiChatSession,
    text: string,
    hasFiles: boolean,
  ): Promise<AiAssistantReply> {
    const provider = this.provider!;
    // AI-3: oturumda biriken taslak (belge + konuşma birleşiminin kaynağı).
    let draft: AiTenderExtractResult | null = this.reviveDraft(session.tenderDraft);
    let draftTouched = false;

    // Belge yüklendiyse ihale çıkarımı yap, mevcut taslakla birleştir.
    if (hasFiles) {
      const extracted = await this.tenderExtract.extract(user, {
        fileKeys: dto.fileKeys!,
        listingType: "ALIM",
      });
      draft = draft ? this.mergeDrafts(draft, extracted) : extracted;
      draftTouched = true;
    }

    const stored = await this.loadMessages(session.id);
    const plan = planWindow(stored, session.summary, session.summarizedThroughSeq);

    const portals = allowedPortals(user);
    const toolDefs = toolDefsForUser(portals, user.tier);
    // Beyaz-liste kullanıcıya göre (arayüz testi O-054): bu kullanıcıya
    // SUNULMAYAN bir araç adı (taslak/yayın/eleme önerisi dahil) model
    // uydursa da yürütülmez — öneri fonksiyonu kendi rol/paket kapısını
    // taşımadığı için kapı burada.
    const offeredTools = new Set(toolDefs.map((d) => d.name));

    // i18n Faz 3: asistan İSTEK DİLİNDE yanıtlar (Accept-Language → ALS;
    // başlık yoksa JWT'deki kullanıcı dili). Dil adı prompt'a açıkça yazılır.
    const locale = currentLocale();
    // MU-07: bugunun tarihi + saat dilimi her turda (goreli/yilsiz kapanis tarihi).
    const basePrompt = `${assistantSystemPrompt(locale)}\n\n${assistantClockContext()}`;
    // AI-3: taslak varsa modele context ver (system prompt'a eklenir).
    const systemPrompt = draft
      ? `${basePrompt}\n\n${buildDraftContext(
          JSON.stringify(draft.draft),
          draft.missingRequired,
        )}`
      : basePrompt;

    // Bütçe rezervasyonu ÇAĞRIDAN ÖNCE (fail-closed worst-case tahmin: araç
    // döngüsü + çıktı). Gerçek maliyet settle'da düzeltilir.
    // Derin denetim LU-04: tur en fazla MAX_TOOL_ITERATIONS araç çağrısı + bir
    // araçsız kapanış çağrısı yapar ve HER çağrı sistem istemini (taslak
    // bağlamı dahil — basePrompt değil systemPrompt), araç tanımlarını ve
    // geçmişi yeniden gönderir; k. çağrı önceki k araç sonucunu da taşır.
    // Eski tahmin girdiyi tek çağrı sayıyor, taslağı hiç saymıyordu → settle
    // tavanları (istek/gün/kullanıcı) tahminin birkaç katı aşabiliyordu.
    const MAX_CALLS = MAX_TOOL_ITERATIONS + 1;
    const estInputCharsPerCall =
      systemPrompt.length +
      JSON.stringify(toolDefs).length +
      plan.history.reduce((n, t) => n + JSON.stringify(t).length, 0) +
      text.length;
    const toolResultTokens = MAX_TOOL_RESULT_CHARS / 4;
    const estUsage: AiTokenUsage = {
      inputTokens:
        MAX_CALLS * Math.ceil(estInputCharsPerCall / 4) +
        // Birikimli araç sonuçları: 0 + 1 + … + MAX_TOOL_ITERATIONS.
        toolResultTokens * ((MAX_TOOL_ITERATIONS * (MAX_TOOL_ITERATIONS + 1)) / 2),
      outputTokens: MAX_OUTPUT_TOKENS * MAX_CALLS,
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
      "Yüklediğim belgeden satın alma talebi taslağı hazırla; eksik zorunlu alanları sırayla sor.";
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
      let emptyRetried = false;
      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const result = await provider.complete({
          model: this.config.models.default,
          system: systemPrompt,
          prompt: "",
          history,
          tools: toolDefs,
          maxOutputTokens: MAX_OUTPUT_TOKENS,
          thinkingLevel: THINKING_LEVEL,
          timeoutMs: this.config.timeoutMs,
          deadlineAt,
        });
        accumulate(totalUsage, result.usage);

        if (!result.toolCalls || result.toolCalls.length === 0) {
          // Boş yanıt (metin yok, araç yok) hata DEĞİL ama kullanıcıya
          // "yanıt oluşturamadım" düşer — bir kez aynı bağlamla yeniden dene
          // (MALFORMED_FUNCTION_CALL / token starvation tipik geçici sebepler).
          if (!result.text.trim() && !emptyRetried && Date.now() < deadlineAt) {
            emptyRetried = true;
            this.logger.warn(
              `Asistan boş yanıt döndü (finishReason=${result.finishReason ?? "?"}) — yeniden deneniyor`,
            );
            continue;
          }
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
          if (!offeredTools.has(call.name)) {
            responseParts.push({
              functionResponse: { name: call.name, response: { ...NEUTRAL_ERROR } },
            });
            continue;
          }
          toolsUsed.push(call.name);
          // AI-3: taslak toplama aracı — yürütme YOK, argümanlar sanitize edilip
          // taslağa dönüşür (BAĞLAYICI DEĞİL; ihale açılmaz).
          if (call.name === TOOL_NAMES.proposeTenderDraft) {
            const s = sanitizeAiDraft(call.args, "refine");
            // Belge sayfa özetleri modelden istenmez (araç şemasında yok) —
            // önceki taslaktan taşınır: refine bağlamı ve onay kartındaki
            // "belgeden geldi" uyarısının kaynağı kaybolmasın.
            if (s.draft.pageSummaries.length === 0 && draft?.draft.pageSummaries.length) {
              s.draft.pageSummaries = draft.draft.pageSummaries;
            }
            // Kaynak işareti modelden alınmaz — önceki taslaktan taşınır.
            s.draft.fromDocument = draft?.draft.fromDocument === true;
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
                response: { status: "ok", missingRequired: missingFieldsForPrompt(s.missingRequired) },
              },
            });
            continue;
          }
          // AI-4: aksiyon önerisi — YÜRÜTMEZ; doğrulanmış onay kartı üretir.
          // Tembel eşleme: metod referansı ÇAĞRI ANINDA çözülür (map kurarken
          // .bind patlaması olmasın — test stub'ları kısmi olabilir).
          const proposeFn = this.resolveProposeFn(call.name);
          if (proposeFn) {
            // Bu turda toplanan taslak henüz oturuma yazılmadı (tur sonunda
            // yazılır) — yayın önerisine bellekteki güncel taslak verilir,
            // kategori önerisi de önden üretilir; yoksa "hazırla ve yayınla"
            // tek mesajı "taslak yok"/bayat taslakla takılırdı (derin denetim
            // canlı AI). Öneri yine YÜRÜTMEZ: yalnız onay kartı.
            let turnDraft: AiTenderExtractResult["draft"] | undefined;
            if (call.name === TOOL_NAMES.requestPublishTender && draftTouched && draft) {
              draft = await this.withSuggestedCategories(user, draft);
              turnDraft = draft.draft;
            }
            const outcome = await proposeFn(user, session.id, call.args, turnDraft).catch(
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
            thinkingLevel: THINKING_LEVEL,
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
        // Temizlenmiş sebep kullanım kaydına (metadata.providerReason).
        reason: err instanceof AiProviderError ? err.reason : undefined,
      });
      const raw = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Asistan sağlayıcı hatası: ${raw}`);
      // Gemini durum kodunu kullanıcıya-güvenli biçimde yansıt (anahtar/gövde
      // sızmaz — yalnız 3 haneli kod): log erişimi olmadan da teşhis edilebilsin.
      // 503/429 = yoğunluk (tekrar dene), 404/403/401 = model/yetki config sorunu.
      const code =
        raw.match(/"code"\s*:\s*(\d{3})/)?.[1] ??
        raw.match(/got status:?\s*(\d{3})/i)?.[1];
      // Sağlayıcının kendi mesajı (alan adı vb.) — anahtar/istek gövdesi içermez.
      const detail = raw.match(/"message"\s*:\s*"([^"]{1,160})/)?.[1];
      throw new ServiceUnavailableException(
        code
          ? i18nMessage("api.ai.asistanYanitVeremediSaglayiciHatasi", {
              code,
              detail: detail ? `: ${detail}` : "",
            })
          : i18nMessage("api.ai.asistanYanitVeremedi"),
      );
    }

    // Konuşmayla toplanan taslakta kalem var ama kategori önerisi yoksa üret
    // (belge yolu extract() içinde zaten önerir). suggest() hata yutar — turu
    // asla düşürmez.
    if (draftTouched && draft) {
      draft = await this.withSuggestedCategories(user, draft);
    }

    const settled = await this.budget.settle(reservation.id, totalUsage);
    if (!reply.trim()) {
      reply = tApi("api.ai.assistant.fallbackReply");
    }

    // Mesajları kaydet + pencere taşıyorsa özetle + tur sayacı + AI-3 taslak.
    const nextSeq = stored.length > 0 ? stored[stored.length - 1]!.seq : 0;
    const userContent =
      text || (dto.fileKeys && dto.fileKeys.length > 0 ? tApi("api.ai.assistant.documentUploaded") : "");
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

  /**
   * Taslakta kalem var ama kategori önerisi yoksa üret (belge yolu extract()
   * içinde zaten önerir). suggest() hata yutar — turu asla düşürmez.
   */
  private async withSuggestedCategories(
    user: AuthenticatedCompanyUser,
    draft: AiTenderExtractResult,
  ): Promise<AiTenderExtractResult> {
    if (draft.draft.suggestedCategoryIds.length > 0 || !draft.draft.items.some((i) => i.name)) {
      return draft;
    }
    const ids = await this.categorySuggest.suggest(user, draft.draft.items);
    if (ids.length === 0) return draft;
    return {
      ...draft,
      draft: { ...draft.draft, suggestedCategoryIds: ids },
      missingRequired: draft.missingRequired.filter((m) => m !== "category"),
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
        turnDraft?: AiTenderExtractResult["draft"],
      ) => ReturnType<AssistantActionsService["proposeSendInvites"]>)
    | null {
    switch (name) {
      case TOOL_NAMES.requestSendInvites:
        return (u, s, a) => this.actions.proposeSendInvites(u, s, a);
      case TOOL_NAMES.requestPublishTender:
        return (u, s, a, d) => this.actions.proposePublishTender(u, s, a, d);
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
      fromDocument: b.fromDocument === true || n.fromDocument === true,
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
    // D-357: durum/teslim/ödeme kodları istek dilinde etikete çevrilir —
    // model ham kodu ("OPEN") görüp kendi çevirisini uydurmasın.
    const locale = currentLocale();
    // Gizli segmentteki kategori modele gitmez (kod / ad / referans) — boyut
    // tavanından (`capObject` metne çevirir) ÖNCE.
    const shown = <T>(rows: T) => redactHiddenCategories(rows) as T;
    const labeled = <T>(rows: T, kind: ToolStatusKind) =>
      localizeToolCodes(shown(rows), kind, locale) as T;
    try {
      switch (call.name) {
        case TOOL_NAMES.listMyTenders: {
          const type = "ALIM" as const;
          if (!canListMyTenders(portals, type)) return { ...NEUTRAL_ERROR };
          return trimList(labeled(await this.listings.listTenders(user.companyId, type), "listing"));
        }
        case TOOL_NAMES.searchOpenTenders: {
          const type = "ALIM" as const;
          if (!canSearchOpen(portals, type)) return { ...NEUTRAL_ERROR };
          const res = (await this.listings.sellerTenders(user, type)) as unknown;
          return this.capObject(labeled(res, "listing"));
        }
        case TOOL_NAMES.listMyBids: {
          if (!canListMyBids(portals)) return { ...NEUTRAL_ERROR };
          // Uç sayfalı (arayüz testi O-005): en yeni 30 teklif + GERÇEK toplam.
          const res = await this.listings.listMyBids(user.companyId, { pageSize: 30 });
          return {
            items: labeled(res.items, "bid"),
            total: res.total,
            truncated: res.total > res.items.length,
          };
        }
        case TOOL_NAMES.getTenderDetail: {
          const id = String(call.args.id ?? "");
          if (!id) return { ...NEUTRAL_ERROR };
          return this.capObject(labeled(await this.listings.getOne(user, id), "listing"));
        }
        case TOOL_NAMES.listMyOrders:
          return trimList(labeled(await this.orders.list(user), "order"));
        case TOOL_NAMES.getOrderDetail: {
          const id = String(call.args.id ?? "");
          if (!id) return { ...NEUTRAL_ERROR };
          return this.capObject(labeled(await this.orders.getOne(user, id), "order"));
        }
        case TOOL_NAMES.listMyConnections:
          return trimList(shown(await this.connections.list(user.companyId)));
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
    // Özet sonraki turlarda modele geri beslenir → sohbetin dilinde yazılır.
    const summarySystem = summarySystemPrompt(currentLocale());

    const est: AiTokenUsage = {
      inputTokens: Math.ceil((summarySystem.length + prompt.length) / 4),
      outputTokens: 2048,
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
        system: summarySystem,
        prompt,
        // Thought token'ları da tavandan yer — 512'de özet boş kalabiliyordu.
        maxOutputTokens: 2048,
        thinkingLevel: THINKING_LEVEL,
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
    if (!session) throw new NotFoundException(i18nMessage("api.ai.sohbetBulunamadi"));
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
