import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@rothern/db";
import type { AiActionResult, AiPendingAction } from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import type { CreateListingDto } from "../../company-listings/dto/create-listing.dto";
import { CompanyListingsService } from "../../company-listings/services/company-listings.service";
import { sanitizeAiDraft } from "../tender-extract/ai-draft-sanitizer";

/**
 * Faz AI-4 — asistan AKSİYON çerçevesi. İlkeler:
 *
 *  1. Model ASLA doğrudan yazamaz: propose() yalnız doğrulanmış bir
 *     `pendingAction` kaydı üretir (oturuma bağlı, tek seferlik, süreli).
 *     Yürütme YALNIZ kullanıcının confirm endpoint'ine (CSRF'li, ayrı HTTP
 *     isteği) basmasıyla olur — prompt-injection zinciri yapısal kırık.
 *  2. Yetki = kullanıcının yetkisi: execute, mevcut servisleri KULLANICI
 *     kimliğiyle çağırır; rol/tier/KYC/sahiplik kapıları aynen çalışır.
 *  3. Onay kartı içeriği (summary) modelin metni DEĞİL, backend'in burada
 *     ürettiği doğrulanmış özettir.
 */

const ACTION_TTL_MS = 10 * 60 * 1000; // onay kartı 10 dk geçerli

export type PendingActionType = "send_invites" | "publish_tender";

interface StoredPendingAction {
  id: string;
  type: PendingActionType;
  severity: "normal" | "critical";
  summary: string[];
  params: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
}

/** Propose çıktısı — hem modele (tool response) hem UI kartına gider. */
export interface ProposeOutcome {
  ok: boolean;
  pending?: AiPendingAction;
  /** ok=false: modelin kullanıcıya aktaracağı eksik/engel açıklaması. */
  problem?: string;
}

@Injectable()
export class AssistantActionsService {
  private readonly logger = new Logger(AssistantActionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly listings: CompanyListingsService,
    private readonly audit: AuditService,
  ) {}

  // ── PROPOSE ────────────────────────────────────────────────────────────

  /** Davet gönderme önerisi — dry-run doğrulama + özet. */
  async proposeSendInvites(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    args: Record<string, unknown>,
  ): Promise<ProposeOutcome> {
    const listingId = String(args.listingId ?? "").trim();
    const rothernIds = Array.isArray(args.rothernIds)
      ? args.rothernIds.filter((r): r is string => typeof r === "string").slice(0, 50)
      : [];
    if (!listingId || rothernIds.length === 0) {
      return { ok: false, problem: "İhale id ve en az bir firma kodu (Rothern ID) gerekli." };
    }
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: { id: true, title: true, number: true, status: true, type: true },
    });
    if (!listing) {
      return { ok: false, problem: "Bu id ile firmanıza ait bir ihale bulunamadı." };
    }
    if (listing.status !== "DRAFT" && listing.status !== "OPEN") {
      return { ok: false, problem: "Bu ihale artık davete kapalı (yalnız taslak/açık ihaleye davet eklenir)." };
    }
    // Kod → firma adı çözümü (özet için; bağlayıcı doğrulama execute'ta).
    const targets = await this.prisma.company.findMany({
      where: { rothernId: { in: rothernIds } },
      select: { name: true, rothernId: true },
    });
    if (targets.length === 0) {
      return { ok: false, problem: "Verilen kodlarla eşleşen firma bulunamadı." };
    }
    return this.storePending(user, sessionId, {
      type: "send_invites",
      severity: "normal",
      params: { listingId, rothernIds },
      summary: [
        `İhale: ${listing.title} (${listing.number ?? listing.id})`,
        `Davet edilecek: ${targets.map((t) => `${t.name} (${t.rothernId})`).join(", ")}`,
        "Yalnız bağlantılı firmalara davet gider; diğerleri atlanır.",
      ],
    });
  }

  /** Oturumdaki taslaktan ihale YAYINLAMA önerisi (kritik). */
  async proposePublishTender(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    args: Record<string, unknown>,
  ): Promise<ProposeOutcome> {
    const type = args.type === "SATIS" ? "SATIS" : "ALIM";
    // Davetli (kapalı) yayın en az 1 davetli firma ister (iş kuralı) —
    // yalnız BAĞLANTILI firmalar davet edilebilir; burada önden doğrula.
    const rawCodes = Array.isArray(args.rothernIds)
      ? args.rothernIds.filter((r): r is string => typeof r === "string").slice(0, 50)
      : [];
    if (rawCodes.length === 0) {
      return {
        ok: false,
        problem:
          "Davetli ihale en az bir firma davetiyle yayınlanır — davet edilecek bağlantılı firmaların Rothern kodlarını isteyin.",
      };
    }
    const invitees = await this.connectedCompaniesByCode(user.companyId, rawCodes);
    if (invitees.length === 0) {
      return {
        ok: false,
        problem:
          "Verilen kodlar bağlantılı bir firmaya çıkmadı — yalnız aktif bağlantılarınız davet edilebilir (bağlantı listesine bakabilirsiniz).",
      };
    }
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId: user.userId, companyId: user.companyId },
      select: { tenderDraft: true },
    });
    if (!session?.tenderDraft) {
      return { ok: false, problem: "Bu sohbette biriken bir ihale taslağı yok — önce taslağı birlikte hazırlayın." };
    }
    const s = sanitizeAiDraft(session.tenderDraft, "refine");
    if (s.missingRequired.length > 0) {
      return {
        ok: false,
        problem: `Taslakta eksik zorunlu alanlar var: ${s.missingRequired.join(", ")}. Önce bunları tamamlayın.`,
      };
    }
    if (s.draft.suggestedCategoryIds.length === 0) {
      return { ok: false, problem: "Kategori önerisi yok — kalemleri netleştirin, kategori otomatik önerilsin." };
    }
    const dto = await this.draftToCreateDto(user, type, s.draft);
    if (typeof dto === "string") return { ok: false, problem: dto };
    dto.invitations = invitees.map((c) => c.rothernId!);

    const cats = await this.prisma.category.findMany({
      where: { id: { in: dto.categoryIds ?? [] } },
      select: { nameTr: true },
    });
    return this.storePending(user, sessionId, {
      type: "publish_tender",
      severity: "critical",
      params: { type, dto: dto as unknown as Record<string, unknown> },
      summary: [
        `${type === "ALIM" ? "Alım ihalesi" : "Satış ilanı"} YAYINLANACAK: ${dto.title}`,
        `Kalemler: ${(dto.items ?? []).map((i) => i.name).filter(Boolean).slice(0, 5).join(", ")}${(dto.items ?? []).length > 5 ? "…" : ""} (${(dto.items ?? []).length} kalem)`,
        `Kategori: ${cats.map((c) => c.nameTr).join(", ") || "-"}`,
        `Davet edilecek: ${invitees.map((c) => c.name).join(", ")}`,
        `Kapanış: ${dto.closesAt ?? "-"} · Para birimi: ${dto.primaryCurrency ?? "-"} · Görünürlük: Davetli (kapalı)`,
        "Yayınlandığında teklif almaya açılır; kapanış ve kalemler teklif geldikten sonra değiştirilemez.",
      ],
    });
  }

  /** Kodları YALNIZ aktif-bağlantılı firmalara çözer (ad + kod, özet için). */
  private async connectedCompaniesByCode(companyId: string, codes: string[]) {
    const targets = await this.prisma.company.findMany({
      where: { rothernId: { in: codes }, id: { not: companyId } },
      select: { id: true, name: true, rothernId: true },
    });
    if (targets.length === 0) return [];
    const conns = await this.prisma.companyConnection.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { inviterCompanyId: companyId, inviteeCompanyId: { in: targets.map((t) => t.id) } },
          { inviteeCompanyId: companyId, inviterCompanyId: { in: targets.map((t) => t.id) } },
        ],
      },
      select: { inviterCompanyId: true, inviteeCompanyId: true },
    });
    const connected = new Set(
      conns.flatMap((c) => [c.inviterCompanyId, c.inviteeCompanyId]),
    );
    return targets.filter((t) => connected.has(t.id));
  }

  /** Taslak → CreateListingDto. Dönen string = kullanıcıya açıklanacak engel. */
  private async draftToCreateDto(
    user: AuthenticatedCompanyUser,
    type: "ALIM" | "SATIS",
    d: ReturnType<typeof sanitizeAiDraft>["draft"],
  ): Promise<CreateListingDto | string> {
    // Varsayılan teslimat adresi — ilan formunun zorunlu tuttuğu alan.
    const addr = await this.prisma.companyAddress.findFirst({
      where: { companyId: user.companyId, type: { in: ["TESLIMAT", "ILETISIM"] } },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!addr) {
      return "Firmanızda kayıtlı teslimat adresi yok — Ayarlar → Adresler'den ekleyin, sonra tekrar deneyin.";
    }
    if (!d.title || !d.bidsCloseAt) {
      return "Başlık ve kapanış tarihi zorunlu."; // sanitizer normalde yakalar
    }
    const dto: CreateListingDto = {
      type: type as CreateListingDto["type"],
      title: d.title,
      description: d.description ?? undefined,
      asDraft: false,
      format: "RFQ" as CreateListingDto["format"],
      visibility: "PRIVATE" as CreateListingDto["visibility"],
      closesAt: d.bidsCloseAt,
      isInternational: d.isInternational ?? false,
      primaryCurrency: (d.primaryCurrency ?? "TRY") as CreateListingDto["primaryCurrency"],
      allowedCurrencies: [
        (d.primaryCurrency ?? "TRY") as NonNullable<CreateListingDto["allowedCurrencies"]>[number],
      ],
      deliveryTerm: (d.deliveryTerm ?? undefined) as CreateListingDto["deliveryTerm"],
      deliveryAddressId: addr.id,
      paymentCategory: (d.paymentCategory ?? undefined) as CreateListingDto["paymentCategory"],
      paymentDays: d.paymentDays ?? undefined,
      advancePercent: d.advancePercent ?? undefined,
      categoryIds: d.suggestedCategoryIds.slice(0, 3),
      keywords: d.keywords.slice(0, 10),
      terms: d.termsAndConditions ?? undefined,
      items: d.items
        .filter((i) => i.name)
        .map((i) => ({
          name: i.name!,
          description: i.description ?? undefined,
          quantity: i.quantity ?? 1,
          unit: i.unit ?? "adet",
          materialCode: i.materialCode ?? undefined,
          requiredByDate: i.requiredByDate ?? undefined,
          targetUnitPrice: i.targetUnitPrice ?? undefined,
        })) as CreateListingDto["items"],
    };
    return dto;
  }

  // ── CONFIRM / REJECT ───────────────────────────────────────────────────

  async confirm(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    actionId: string,
  ): Promise<AiActionResult> {
    const { session, action } = await this.loadPending(user, sessionId, actionId);

    // Tek kullanım: yürütmeden ÖNCE atomik olarak düş (çifte tıklama/yarış →
    // ikinci istek pending bulamaz). Yürütme hata verirse aksiyon düşmüş kalır;
    // model yeni öneri üretebilir — yarım-yürütülmüş kayıt riski yok çünkü
    // servis çağrısı tek ve kendi transaction'ında.
    const cleared = await this.prisma.aiChatSession.updateMany({
      where: { id: session.id, pendingAction: { not: Prisma.DbNull } },
      data: { pendingAction: Prisma.DbNull },
    });
    if (cleared.count === 0) {
      throw new BadRequestException("Bu onay zaten kullanılmış.");
    }

    let message = "";
    let resourceId: string | undefined;
    try {
      switch (action.type) {
        case "send_invites": {
          const p = action.params as { listingId: string; rothernIds: string[] };
          await this.listings.addInvitations(user, p.listingId, p.rothernIds);
          message = "Davetler gönderildi (yalnız bağlantılı firmalara).";
          resourceId = p.listingId;
          break;
        }
        case "publish_tender": {
          const p = action.params as { dto: CreateListingDto };
          const created = (await this.listings.create(user, p.dto)) as { id?: string };
          resourceId = created?.id;
          message = "İhale yayınlandı — teklifler artık toplanıyor.";
          // Yayınlanan taslağı oturumdan temizle (tekrar yayınlanmasın).
          await this.prisma.aiChatSession.update({
            where: { id: session.id },
            data: { tenderDraft: Prisma.DbNull },
          });
          break;
        }
        default:
          throw new BadRequestException("Bilinmeyen aksiyon tipi.");
      }
    } catch (err) {
      // Servis kapıları (rol/KYC/durum) Türkçe ve kullanıcıya-güvenli mesaj
      // üretir — aynen yükselt; hiçbir şey yürütülmedi.
      this.logger.warn(
        `AI aksiyon yürütme hatası (${action.type}): ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    void this.audit.log({
      action: "ai.action_executed",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      metadata: {
        via: "ai_assistant",
        sessionId: session.id,
        actionId: action.id,
        actionType: action.type,
        resourceId,
      },
    });
    return { status: "executed", message, resourceId };
  }

  async reject(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    actionId: string,
  ): Promise<AiActionResult> {
    const { session } = await this.loadPending(user, sessionId, actionId);
    await this.prisma.aiChatSession.update({
      where: { id: session.id },
      data: { pendingAction: Prisma.DbNull },
    });
    return { status: "rejected", message: "İşlem iptal edildi — hiçbir şey yapılmadı." };
  }

  // ── HELPERS ────────────────────────────────────────────────────────────

  private async storePending(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    a: Omit<StoredPendingAction, "id" | "createdAt" | "expiresAt">,
  ): Promise<ProposeOutcome> {
    const now = Date.now();
    const record: StoredPendingAction = {
      ...a,
      id: randomUUID(),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + ACTION_TTL_MS).toISOString(),
    };
    await this.prisma.aiChatSession.updateMany({
      where: { id: sessionId, userId: user.userId, companyId: user.companyId },
      data: { pendingAction: record as unknown as Prisma.InputJsonValue },
    });
    return {
      ok: true,
      pending: {
        id: record.id,
        type: record.type,
        severity: record.severity,
        summary: record.summary,
        expiresAt: record.expiresAt,
      },
    };
  }

  private async loadPending(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    actionId: string,
  ) {
    const session = await this.prisma.aiChatSession.findFirst({
      where: { id: sessionId, userId: user.userId, companyId: user.companyId },
      select: { id: true, pendingAction: true },
    });
    if (!session) throw new NotFoundException("Sohbet bulunamadı");
    const action = session.pendingAction as unknown as StoredPendingAction | null;
    if (!action || action.id !== actionId) {
      throw new BadRequestException("Onay bekleyen işlem bulunamadı.");
    }
    if (Date.parse(action.expiresAt) < Date.now()) {
      await this.prisma.aiChatSession.update({
        where: { id: session.id },
        data: { pendingAction: Prisma.DbNull },
      });
      throw new ForbiddenException("Onay süresi doldu — asistandan işlemi yeniden isteyin.");
    }
    return { session, action };
  }
}
