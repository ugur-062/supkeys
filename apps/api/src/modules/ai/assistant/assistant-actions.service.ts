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
import type { PlaceBidDto } from "../../company-listings/dto/place-bid.dto";
import { CompanyListingsService } from "../../company-listings/services/company-listings.service";
import { CompanyOrdersService } from "../../company-orders/services/company-orders.service";
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

export type PendingActionType =
  | "send_invites"
  | "publish_tender"
  | "eliminate_bid"
  | "award_tender"
  | "place_bid"
  | "mark_order_received";

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
    private readonly orders: CompanyOrdersService,
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

  /**
   * Teklif ELEME önerisi (Faz 2). Eleme kalıcı-yıkıcı değildir: elenen
   * tedarikçi yeniden teklif verebilir — severity normal; yine de dışa dönük
   * (bildirim gider), o yüzden onay kartından geçer.
   */
  async proposeEliminateBid(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    args: Record<string, unknown>,
  ): Promise<ProposeOutcome> {
    const ref = await this.loadOwnedBid(user, args);
    if (typeof ref === "string") return { ok: false, problem: ref };
    const reason = typeof args.reason === "string" ? args.reason.slice(0, 500) : undefined;
    if (ref.bid.status !== "SUBMITTED") {
      return { ok: false, problem: "Yalnız gönderilmiş (aktif) teklif elenebilir." };
    }
    return this.storePending(user, sessionId, {
      type: "eliminate_bid",
      severity: "normal",
      params: { listingId: ref.listing.id, bidId: ref.bid.id, reason },
      summary: [
        `İhale: ${ref.listing.title} (${ref.listing.number ?? ref.listing.id})`,
        `Elenecek teklif: ${ref.supplierName} — ${ref.bid.amount} ${ref.bid.currency}`,
        ...(reason ? [`Gerekçe: ${reason}`] : []),
        "Tedarikçiye eleme bildirimi gider; dilerse yeniden teklif verebilir.",
      ],
    });
  }

  /**
   * TOPLU kazandırma önerisi (Faz 2 — kritik, GERİ ALINAMAZ). Kalem-bazlı
   * kazandırma kapsam dışı (sayfaya yönlendirilir). Onay akışı devredeyse
   * kullanıcı onayından SONRA şirket onay zinciri de aynen çalışır.
   */
  async proposeAwardTender(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    args: Record<string, unknown>,
  ): Promise<ProposeOutcome> {
    const ref = await this.loadOwnedBid(user, args);
    if (typeof ref === "string") return { ok: false, problem: ref };
    if (!["OPEN", "IN_AWARD", "CLOSED"].includes(ref.listing.status)) {
      return { ok: false, problem: "Bu ihale kazandırmaya uygun durumda değil." };
    }
    if (!["SUBMITTED"].includes(ref.bid.status)) {
      return { ok: false, problem: "Yalnız gönderilmiş (aktif) bir teklif kazandırılabilir." };
    }
    const note = typeof args.note === "string" ? args.note.slice(0, 1000) : undefined;
    return this.storePending(user, sessionId, {
      type: "award_tender",
      severity: "critical",
      params: { listingId: ref.listing.id, bidId: ref.bid.id, note },
      summary: [
        `İhale KAZANDIRILACAK: ${ref.listing.title} (${ref.listing.number ?? ref.listing.id})`,
        `Kazanan: ${ref.supplierName} — ${ref.bid.amount} ${ref.bid.currency} (tüm kalemler)`,
        "Bu işlem GERİ ALINAMAZ: diğer teklifler kaybeder, sipariş oluşturulur.",
        "Firmanızda onay akışı tanımlıysa işlem önce şirket onayına düşer.",
      ],
    });
  }

  /**
   * TEKLİF VERME önerisi (Faz 3 — kritik: SUBMITTED teklif geri çekilemez).
   * Görünürlük listings.getOne üzerinden doğrulanır (gizli ihale sızmaz).
   * Belge/zorunlu-soru gerektiren ihaleler sayfaya yönlendirilir (kapsam dışı).
   */
  async proposePlaceBid(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    args: Record<string, unknown>,
  ): Promise<ProposeOutcome> {
    const listingId = String(args.listingId ?? "").trim();
    if (!listingId) return { ok: false, problem: "İhale id gerekli." };
    let detail: Record<string, unknown>;
    try {
      detail = (await this.listings.getOne(user, listingId)) as Record<string, unknown>;
    } catch {
      return { ok: false, problem: "İhale bulunamadı veya erişiminiz yok." };
    }
    if (detail.isOwner === true) {
      return { ok: false, problem: "Kendi ihalenize teklif veremezsiniz." };
    }
    if (detail.status !== "OPEN") {
      return { ok: false, problem: "Bu ihale teklife açık değil." };
    }
    if (detail.requireBidDocument === true) {
      return {
        ok: false,
        problem: "Bu ihale teklif belgesi istiyor — teklifi ihale sayfasından belge yükleyerek verin.",
      };
    }
    const items = (detail.items ?? []) as Array<{
      id: string;
      name: string;
      quantity: unknown;
      unit: string;
      questions?: Array<{ required?: boolean }>;
    }>;
    if (items.length === 0) {
      return { ok: false, problem: "İhale kalemleri okunamadı — sayfadan teklif verin." };
    }
    if (items.some((i) => (i.questions ?? []).some((q) => q.required))) {
      return {
        ok: false,
        problem: "Bu ihalede cevaplanması zorunlu teknik sorular var — teklifi ihale sayfasından verin.",
      };
    }
    const myBid = detail.myBid as { status?: string } | null | undefined;
    if (myBid?.status === "SUBMITTED") {
      return { ok: false, problem: "Bu ihalede zaten gönderilmiş aktif bir teklifiniz var (geri çekilemez)." };
    }

    // Kalem fiyatları: TÜM kalemler fiyatlanmalı (kısmi teklif sayfaya).
    const argItems = Array.isArray(args.items)
      ? (args.items as Array<{ itemId?: unknown; unitPrice?: unknown }>)
      : [];
    const priceById = new Map<string, number>();
    for (const it of argItems) {
      const id = String(it.itemId ?? "");
      const p = Number(it.unitPrice);
      if (id && Number.isFinite(p) && p > 0) priceById.set(id, p);
    }
    const missing = items.filter((i) => !priceById.has(i.id));
    if (missing.length > 0) {
      return {
        ok: false,
        problem: `Şu kalemler için birim fiyat eksik: ${missing.map((m) => m.name).join(", ")}. Her kalem için birim fiyat isteyin (kısmi teklif için sayfayı kullanın).`,
      };
    }

    const currency = String(args.currency ?? detail.primaryCurrency ?? "TRY");
    const allowed = (detail.allowedCurrencies ?? []) as string[];
    if (allowed.length > 0 && !allowed.includes(currency)) {
      return { ok: false, problem: `Bu ihalede geçerli para birimleri: ${allowed.join(", ")}.` };
    }

    // amount = Σ(birim × miktar) — award nöbetçisiyle (bid.amount ≡ Σ) uyumlu.
    let amount = new Prisma.Decimal(0);
    const lines: string[] = [];
    for (const i of items) {
      const price = priceById.get(i.id)!;
      const qty = new Prisma.Decimal(String(i.quantity ?? 1));
      const sub = qty.mul(new Prisma.Decimal(String(price)));
      amount = amount.add(sub);
      lines.push(`${i.name}: ${String(i.quantity)} ${i.unit} × ${price} = ${sub.toString()} ${currency}`);
    }
    const note = typeof args.note === "string" ? args.note.slice(0, 1000) : undefined;
    const validityDays =
      Number.isFinite(Number(args.validityDays)) && Number(args.validityDays) > 0
        ? Math.min(365, Math.floor(Number(args.validityDays)))
        : undefined;
    // Teslim tarihi zorunlu (placeBid kuralı) — kullanıcıdan istenir.
    const deliveryDate = String(args.deliveryDate ?? "").trim();
    if (!deliveryDate || Number.isNaN(Date.parse(deliveryDate))) {
      return { ok: false, problem: "Taahhüt edilen teslim tarihi gerekli (örn. 2026-08-15) — kullanıcıya sorun." };
    }
    if (Date.parse(deliveryDate) < Date.now()) {
      return { ok: false, problem: "Teslim tarihi geçmişte olamaz." };
    }

    const dto: PlaceBidDto = {
      amount: Number(amount.toString()),
      currency: currency as PlaceBidDto["currency"],
      items: items.map((i) => ({ itemId: i.id, unitPrice: priceById.get(i.id)! })),
      deliveryDate,
      ...(note ? { note } : {}),
      ...(validityDays ? { validityDays } : {}),
    } as PlaceBidDto;

    return this.storePending(user, sessionId, {
      type: "place_bid",
      severity: "critical",
      params: { listingId, dto: dto as unknown as Record<string, unknown> },
      summary: [
        `TEKLİF VERİLECEK: ${String(detail.title)} (${String(detail.number ?? listingId)})`,
        ...lines.slice(0, 6),
        ...(lines.length > 6 ? [`… ve ${lines.length - 6} kalem daha`] : []),
        `TOPLAM: ${amount.toString()} ${currency} · Teslim: ${deliveryDate.slice(0, 10)}${validityDays ? ` · Geçerlilik: ${validityDays} gün` : ""}`,
        "Gönderilen teklif GERİ ÇEKİLEMEZ ve değiştirilemez (kapalı zarf).",
      ],
    });
  }

  /**
   * Sipariş TESLİM ALINDI önerisi (Faz 3 — alıcı tarafı; IN_DELIVERY→DELIVERED,
   * adım geri alınamaz; kusur bildirimi ayrı mekanizmadır).
   */
  async proposeMarkOrderReceived(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    args: Record<string, unknown>,
  ): Promise<ProposeOutcome> {
    const orderId = String(args.orderId ?? "").trim();
    if (!orderId) return { ok: false, problem: "Sipariş id gerekli." };
    const order = await this.prisma.companyOrder.findFirst({
      where: { id: orderId, buyerCompanyId: user.companyId },
      select: {
        id: true,
        number: true,
        status: true,
        amount: true,
        currency: true,
        seller: { select: { name: true } },
      },
    });
    if (!order) {
      return { ok: false, problem: "Bu id ile firmanızın alıcı olduğu bir sipariş bulunamadı." };
    }
    if (order.status !== "IN_DELIVERY") {
      return { ok: false, problem: "Yalnız yoldaki (gönderilmiş) sipariş teslim alındı olarak işaretlenebilir." };
    }
    const note = typeof args.note === "string" ? args.note.slice(0, 500) : undefined;
    return this.storePending(user, sessionId, {
      type: "mark_order_received",
      severity: "normal",
      params: { orderId, note },
      summary: [
        `Sipariş TESLİM ALINDI işaretlenecek: ${order.number ?? order.id}`,
        `Satıcı: ${order.seller?.name ?? "-"} · Tutar: ${order.amount} ${order.currency ?? ""}`,
        "Satıcıya bildirim gider; sorun varsa teslim sonrası kusur bildirimi ayrıca yapılabilir.",
      ],
    });
  }

  /** İhale + teklif referansını SAHİPLİK doğrulamasıyla yükler (özet verisiyle). */
  private async loadOwnedBid(
    user: AuthenticatedCompanyUser,
    args: Record<string, unknown>,
  ): Promise<
    | {
        listing: { id: string; title: string; number: string | null; status: string };
        bid: { id: string; amount: unknown; currency: string; status: string };
        supplierName: string;
      }
    | string
  > {
    const listingId = String(args.listingId ?? "").trim();
    const bidId = String(args.bidId ?? "").trim();
    if (!listingId || !bidId) return "İhale id ve teklif id gerekli.";
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: { id: true, title: true, number: true, status: true },
    });
    if (!listing) return "Bu id ile firmanıza ait bir ihale bulunamadı.";
    const bid = await this.prisma.listingBid.findFirst({
      where: { id: bidId, listingId },
      select: {
        id: true,
        amount: true,
        currency: true,
        status: true,
        bidderCompany: { select: { name: true } },
      },
    });
    if (!bid) return "Bu ihalede böyle bir teklif bulunamadı.";
    return {
      listing,
      bid: { id: bid.id, amount: bid.amount, currency: bid.currency, status: bid.status },
      supplierName: bid.bidderCompany?.name ?? "-",
    };
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
        case "eliminate_bid": {
          const p = action.params as { listingId: string; bidId: string; reason?: string };
          await this.listings.eliminate(user, p.listingId, p.bidId, p.reason);
          message = "Teklif elendi — tedarikçiye bildirim gönderildi.";
          resourceId = p.listingId;
          break;
        }
        case "award_tender": {
          const p = action.params as { listingId: string; bidId: string; note?: string };
          const r = (await this.listings.award(user, p.listingId, p.bidId, p.note)) as {
            orderId?: string;
            approvalPending?: boolean;
          };
          resourceId = r?.orderId ?? p.listingId;
          message = r?.orderId
            ? "Kazandırma tamamlandı — sipariş oluşturuldu."
            : "Kazandırma başlatıldı — firmanızın onay akışına iletildi.";
          break;
        }
        case "place_bid": {
          const p = action.params as { listingId: string; dto: PlaceBidDto };
          await this.listings.placeBid(user, p.listingId, p.dto);
          message = "Teklifiniz gönderildi (kapalı zarf — yalnız ihale sahibi görür).";
          resourceId = p.listingId;
          break;
        }
        case "mark_order_received": {
          const p = action.params as { orderId: string; note?: string };
          await this.orders.receive(user, p.orderId, { note: p.note } as never);
          message = "Sipariş teslim alındı olarak işaretlendi — satıcıya bildirim gitti.";
          resourceId = p.orderId;
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
