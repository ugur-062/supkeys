import { i18nMessage } from "../../../common/i18n/http-i18n";
import { tApi } from "../../../common/i18n/i18n.service";
import { formatMoney, formatNotificationDate } from "../../../common/notifications/notification-params";
import { localizeDefaultAddressTitle } from "../../../common/company/default-address-title";
import { quantityDisplay } from "../../../common/i18n/unit-label";
import { deliveryTermLabel, paymentCategoryLabel } from "../../../common/i18n/listing-terms-label";
import { currentLocale } from "../../../common/i18n/locale-context";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Prisma } from "@rothern/db";
import {
  BID_DELIVERY_TIMES,
  type AiActionResult,
  type AiPendingAction,
  type BidDeliveryTime,
  normalizeUnit,
} from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { CATEGORY_NAME_SELECT, categoryName } from "../../../common/company/category-name";
import { AuditService } from "../../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CreateListingDto } from "../../company-listings/dto/create-listing.dto";
import { PlaceBidDto } from "../../company-listings/dto/place-bid.dto";
import { CompanyListingsService } from "../../company-listings/services/company-listings.service";
import { CompanyRequestDefaultsService } from "../../company-request-defaults/company-request-defaults.service";
import { MAX_MONEY } from "../../../common/constants/money";
import { CompanyOrdersService } from "../../company-orders/services/company-orders.service";
import { sanitizeAiDraft } from "../tender-extract/ai-draft-sanitizer";
import { missingFieldsForPrompt } from "./assistant.prompts";
import { validatePendingDto } from "./validate-pending-dto";

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
/** Yayin onay kartinda gosterilen teslimat adresi. */
interface PickedAddress {
  id: string;
  title: string;
  city: string | null;
  district: string | null;
}

/** class-validator `maxDecimalPlaces: 2` ile ayni olcu (ondalik basamak sayisi). */
function hasAtMostTwoDecimals(n: number): boolean {
  const s = String(n);
  if (/e/i.test(s)) return false;
  return (s.split(".")[1]?.length ?? 0) <= 2;
}

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
    private readonly requestDefaults: CompanyRequestDefaultsService,
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
      return { ok: false, problem: "Satın Alma Talebi id ve en az bir firma kodu (Rothern ID) gerekli." };
    }
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: { id: true, title: true, number: true, status: true, type: true },
    });
    if (!listing) {
      return { ok: false, problem: "Bu id ile firmanıza ait bir satın alma talebi bulunamadı." };
    }
    if (listing.status !== "DRAFT" && listing.status !== "OPEN") {
      return { ok: false, problem: "Bu satın alma talebi artık davete kapalı (yalnız taslak/açık satın alma talebine davet eklenir)." };
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
        tApi("api.ai.assistant.card.listing", {
          title: listing.title,
          number: listing.number ?? listing.id,
        }),
        tApi("api.ai.assistant.card.invitees", {
          list: targets.map((t) => `${t.name} (${t.rothernId})`).join(", "),
        }),
        tApi("api.ai.assistant.sendInvites.note"),
      ],
    });
  }

  /**
   * Oturumdaki taslaktan ihale YAYINLAMA önerisi (kritik). `turnDraft`: aynı
   * sohbet turunda toplanan (henüz oturuma yazılmamış) taslak — taslak tur
   * SONUNDA kalıcılaşır; "hazırla ve yayınla" tek mesajında DB'deki taslak
   * yok ya da bayat olurdu (derin denetim canlı AI). Taslak yine sanitize
   * edilir; kart + pendingAction üretilir, yürütme yalnız confirm'de.
   */
  async proposePublishTender(
    user: AuthenticatedCompanyUser,
    sessionId: string,
    args: Record<string, unknown>,
    turnDraft?: unknown,
  ): Promise<ProposeOutcome> {
    const type = "ALIM" as const;
    // Davetli (kapalı) yayın en az 1 davetli firma ister (iş kuralı) —
    // yalnız BAĞLANTILI firmalar davet edilebilir; burada önden doğrula.
    const rawCodes = Array.isArray(args.rothernIds)
      ? args.rothernIds.filter((r): r is string => typeof r === "string").slice(0, 50)
      : [];
    if (rawCodes.length === 0) {
      return {
        ok: false,
        problem:
          "Davetli satın alma talebi en az bir firma davetiyle yayınlanır — davet edilecek bağlantılı firmaların Rothern kodlarını isteyin.",
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
    const rawDraft = turnDraft ?? session?.tenderDraft;
    if (!session || !rawDraft) {
      return { ok: false, problem: "Bu sohbette biriken bir satın alma talebi taslağı yok — önce taslağı birlikte hazırlayın." };
    }
    const s = sanitizeAiDraft(rawDraft, "refine");
    if (s.missingRequired.length > 0) {
      return {
        ok: false,
        problem: `Taslakta eksik zorunlu alanlar var: ${missingFieldsForPrompt(s.missingRequired)}. Önce bunları tamamlayın.`,
      };
    }
    if (s.draft.suggestedCategoryIds.length === 0) {
      return { ok: false, problem: "Kategori önerisi yok — kalemleri netleştirin, kategori otomatik önerilsin." };
    }
    const built = await this.draftToCreateDto(user, type, s.draft);
    if (typeof built === "string") return { ok: false, problem: built };
    const { dto, address } = built;
    dto.invitations = invitees.map((c) => c.rothernId!);

    // Kategori adı onay kartında okuyucunun dilinde (eskiden `nameTr` ham —
    // EN/RU arayüzde Türkçe kategori adı basıyordu).
    const cats = await this.prisma.category.findMany({
      where: { id: { in: dto.categoryIds ?? [] } },
      select: CATEGORY_NAME_SELECT,
    });
    return this.storePending(user, sessionId, {
      type: "publish_tender",
      severity: "critical",
      params: { type, dto: dto as unknown as Record<string, unknown> },
      // Onay kartı BAĞLAYICI alanların TAMAMINI göstermeli: bu alanlar belge/
      // sohbet içeriğinden (yani düşman olabilecek girdiden) türetiliyor ve tek
      // tıkla canlı ilana yazılıyor. Eksik gösterim, enjekte edilmiş bir ödeme
      // planının ya da şartname metninin kullanıcı görmeden yayınlanması
      // demekti (denetim 2026-08-24 Parça 6).
      summary: [
        // Satış ilanı kalktı (2026-09-04) — yayın her zaman alım talebi.
        tApi("api.ai.assistant.publish.headingAlim", { title: dto.title }),
        tApi("api.ai.assistant.publish.items", {
          list: `${(dto.items ?? [])
            .slice(0, 5)
            .map(
              (i) =>
                // Miktar + birim okuyucunun dilinde, çoğul kuralıyla.
                i.quantity != null
                  ? `${i.name} — ${quantityDisplay(i.quantity, normalizeUnit(i.unit), i.unit, currentLocale())}`
                  : `${i.name} — ? ${i.unit ?? ""}`.trim(),
            )
            .join(" · ")}${(dto.items ?? []).length > 5 ? " …" : ""}`,
          // Sayı DİZE geçilir: ICU sayı biçimlendirmesi binlik ayraç eklerdi
          // (tr'de "1.000 kalem"), bugünkü çıktı ham sayı basıyor.
          count: String((dto.items ?? []).length),
        }),
        tApi("api.ai.assistant.publish.category", {
          list: cats.map((c) => categoryName(c)).join(", ") || "-",
        }),
        tApi("api.ai.assistant.card.invitees", {
          list: invitees.map((c) => c.name).join(", "),
        }),
        // Kapanis okuyucunun dilinde, Istanbul duvar saatiyle (+ en/ru dilim
        // etiketi) — ham UTC ISO basiliyordu (derin denetim MU-07).
        tApi("api.ai.assistant.publish.closing", {
          closesAt: dto.closesAt
            ? formatNotificationDate(new Date(dto.closesAt), currentLocale(), "dateTime")
            : "-",
          currency: dto.primaryCurrency ?? "-",
        }),
        // Teslimat adresi de BAGLAYICI alan — kartta gorunmeli (MU-07).
        tApi("api.ai.assistant.publish.deliveryAddress", {
          address: [localizeDefaultAddressTitle(address.title), address.district, address.city]
            .map((x) => x?.trim())
            .filter(Boolean)
            .join(", "),
        }),
        // Teslim/ödeme şekli okuyucunun dilinde etiket (ham enum kodu değil).
        tApi("api.ai.assistant.publish.payment", {
          plan: summarizePaymentPlan(dto),
          delivery: deliveryTermLabel(dto.deliveryTerm) ?? "-",
        }),
        tApi("api.ai.assistant.publish.description", {
          text: previewText(dto.description),
        }),
        tApi("api.ai.assistant.publish.terms", { text: previewText(dto.terms) }),
        tApi("api.ai.assistant.publish.note"),
        // "Belgeden geldi" yalnız taslak gerçekten belge çıkarımından geldiyse
        // (açık kaynak işareti — sayfa özetleri şemada zorunlu değil, model
        // atlayabilir); aksi halde metinler sohbetten derlendi — uyarı yine
        // gösterilir.
        s.draft.fromDocument
          ? tApi("api.ai.assistant.publish.sourceWarning")
          : tApi("api.ai.assistant.publish.sourceWarningChat"),
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
        tApi("api.ai.assistant.card.listing", {
          title: ref.listing.title,
          number: ref.listing.number ?? ref.listing.id,
        }),
        tApi("api.ai.assistant.eliminate.bid", {
          supplier: ref.supplierName,
          amount: formatMoney(String(ref.bid.amount), ref.bid.currency, currentLocale()),
        }),
        ...(reason
          ? [tApi("api.ai.assistant.eliminate.reason", { reason })]
          : []),
        tApi("api.ai.assistant.eliminate.note"),
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
      return { ok: false, problem: "Bu satın alma talebi kazandırmaya uygun durumda değil." };
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
        tApi("api.ai.assistant.award.heading", {
          title: ref.listing.title,
          number: ref.listing.number ?? ref.listing.id,
        }),
        tApi("api.ai.assistant.award.winner", {
          supplier: ref.supplierName,
          amount: formatMoney(String(ref.bid.amount), ref.bid.currency, currentLocale()),
        }),
        tApi("api.ai.assistant.award.irreversible"),
        tApi("api.ai.assistant.award.approvalNote"),
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
    if (!listingId) return { ok: false, problem: "Satın Alma Talebi id gerekli." };
    let detail: Record<string, unknown>;
    try {
      detail = (await this.listings.getOne(user, listingId)) as Record<string, unknown>;
    } catch {
      return { ok: false, problem: "Satın Alma Talebi bulunamadı veya erişiminiz yok." };
    }
    if (detail.isOwner === true) {
      return { ok: false, problem: "Kendi satın alma talebinize teklif veremezsiniz." };
    }
    if (detail.status !== "OPEN") {
      return { ok: false, problem: "Bu satın alma talebi teklife açık değil." };
    }
    if (detail.requireBidDocument === true) {
      return {
        ok: false,
        problem: "Bu satın alma talebi teklif belgesi istiyor — teklifi satın alma talebi sayfasından belge yükleyerek verin.",
      };
    }
    const items = (detail.items ?? []) as Array<{
      id: string;
      name: string;
      quantity: unknown;
      unit: string;
      unitCode?: string | null;
      questions?: Array<{ required?: boolean }>;
    }>;
    if (items.length === 0) {
      return { ok: false, problem: "Satın Alma Talebi kalemleri okunamadı — sayfadan teklif verin." };
    }
    if (items.some((i) => (i.questions ?? []).some((q) => q.required))) {
      return {
        ok: false,
        problem: "Bu satın alma talebinde cevaplanması zorunlu teknik sorular var — teklifi satın alma talebi sayfasından verin.",
      };
    }
    const myBid = detail.myBid as { status?: string } | null | undefined;
    if (myBid?.status === "SUBMITTED") {
      return { ok: false, problem: "Bu satın alma talebinde zaten gönderilmiş aktif bir teklifiniz var (geri çekilemez)." };
    }

    // Kalem fiyatları: TÜM kalemler fiyatlanmalı (kısmi teklif sayfaya).
    const argItems = Array.isArray(args.items)
      ? (args.items as Array<{ itemId?: unknown; unitPrice?: unknown }>)
      : [];
    const priceById = new Map<string, number>();
    const badPrice: string[] = [];
    for (const it of argItems) {
      const id = String(it.itemId ?? "");
      const p = Number(it.unitPrice);
      if (!id || !Number.isFinite(p) || p <= 0) continue;
      // PlaceBidItemDto kurali (en fazla 2 ondalik, MAX_MONEY) propose'da —
      // onayda dusup karti harcamasin (derin denetim MU-07).
      if (!hasAtMostTwoDecimals(p) || p > MAX_MONEY) {
        badPrice.push(items.find((i) => i.id === id)?.name ?? id);
        continue;
      }
      priceById.set(id, p);
    }
    if (badPrice.length > 0) {
      return {
        ok: false,
        problem: `Unit price must be a positive amount with at most 2 decimal places (max ${MAX_MONEY}) for: ${badPrice.join(", ")}. Ask the user for a corrected unit price.`,
      };
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
      return { ok: false, problem: `Bu satın alma talebinde geçerli para birimleri: ${allowed.join(", ")}.` };
    }

    // amount = Σ(birim × miktar) — award nöbetçisiyle (bid.amount ≡ Σ) uyumlu.
    let amount = new Prisma.Decimal(0);
    const lines: string[] = [];
    for (const i of items) {
      const price = priceById.get(i.id)!;
      const qty = new Prisma.Decimal(String(i.quantity ?? 1));
      const sub = qty.mul(new Prisma.Decimal(String(price)));
      amount = amount.add(sub);
      // Miktar, birim ve tutarlar okuyucunun dilinde (İngilizce kartta "adet"
      // ve "500 TRY" basılıyordu); sembolün yeri dilden (`formatMoney`).
      const loc = currentLocale();
      lines.push(
        `${i.name}: ${quantityDisplay(String(i.quantity), i.unitCode ?? normalizeUnit(i.unit), i.unit, loc)} × ${formatMoney(price, currency, loc)} = ${formatMoney(sub.toString(), currency, loc)}`,
      );
    }
    const note = typeof args.note === "string" ? args.note.slice(0, 1000) : undefined;
    const validityDays =
      Number.isFinite(Number(args.validityDays)) && Number(args.validityDays) > 0
        ? Math.min(365, Math.floor(Number(args.validityDays)))
        : undefined;
    // Teslim SÜRESİ zorunlu (2026-08-02, placeBid kuralı) — kullanıcıdan istenir.
    const deliveryTime = String(args.deliveryTime ?? "").trim();
    if (!BID_DELIVERY_TIMES.includes(deliveryTime as BidDeliveryTime)) {
      return {
        ok: false,
        problem:
          "Taahhüt edilen teslim süresi gerekli (STOKTAN / W1_2 / W3_4 / W5_8 / M2_3 / M3_PLUS) — kullanıcıya sorun.",
      };
    }

    // Kalemli teklifte `amount` GONDERILMEZ (web ile ayni sozlesme): servis
    // tutari kalemlerden hesaplar; kesirli miktarda Σ 2 ondaligi asip
    // PlaceBidDto.amount kuralina takiliyor, onaylanan kart 400 ile dusuyordu.
    // Gecerlilik gonderimde zorunlu (placeBid kurali; acik eksiltme haric) —
    // propose'da sorulur, onayda dusup karti harcamasin (MU-07).
    if (!validityDays && detail.format !== "ENGLISH_AUCTION") {
      return {
        ok: false,
        problem: "Offer validity in days (validityDays, 1-365) is required to submit a bid. Ask the user.",
      };
    }

    const dto: PlaceBidDto = {
      currency: currency as PlaceBidDto["currency"],
      items: items.map((i) => ({ itemId: i.id, unitPrice: priceById.get(i.id)! })),
      deliveryTime: deliveryTime as BidDeliveryTime,
      ...(note ? { note } : {}),
      ...(validityDays ? { validityDays } : {}),
    } as PlaceBidDto;

    // Teslim süresi onay kartında okuyucunun dilinde (eskiden Türkçe sözlük sabitti).
    const deliveryLabel = tApi(`api.ai.assistant.deliveryTime.${deliveryTime as BidDeliveryTime}`);
    return this.storePending(user, sessionId, {
      type: "place_bid",
      severity: "critical",
      params: { listingId, dto: dto as unknown as Record<string, unknown> },
      summary: [
        tApi("api.ai.assistant.placeBid.heading", {
          title: String(detail.title),
          number: String(detail.number ?? listingId),
        }),
        ...lines.slice(0, 6),
        ...(lines.length > 6
          ? [
              tApi("api.ai.assistant.placeBid.moreItems", {
                count: String(lines.length - 6),
              }),
            ]
          : []),
        validityDays
          ? tApi("api.ai.assistant.placeBid.totalWithValidity", {
              amount: formatMoney(amount.toString(), currency, currentLocale()),
              delivery: deliveryLabel,
              days: validityDays,
            })
          : tApi("api.ai.assistant.placeBid.total", {
              amount: formatMoney(amount.toString(), currency, currentLocale()),
              delivery: deliveryLabel,
            }),
        tApi("api.ai.assistant.placeBid.note"),
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
        tApi("api.ai.assistant.orderReceived.heading", {
          number: order.number ?? order.id,
        }),
        tApi("api.ai.assistant.orderReceived.seller", {
          seller: order.seller?.name ?? "-",
          amount: formatMoney(String(order.amount), order.currency, currentLocale()),
        }),
        tApi("api.ai.assistant.orderReceived.note"),
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
    if (!listingId || !bidId) return "Satın Alma Talebi id ve teklif id gerekli.";
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, companyId: user.companyId },
      select: { id: true, title: true, number: true, status: true },
    });
    if (!listing) return "Bu id ile firmanıza ait bir satın alma talebi bulunamadı.";
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
    if (!bid) return "Bu satın alma talebinde böyle bir teklif bulunamadı.";
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
    type: "ALIM",
    d: ReturnType<typeof sanitizeAiDraft>["draft"],
  ): Promise<{ dto: CreateListingDto; address: PickedAddress } | string> {
    // Teslimat adresi — ilan formunun zorunlu tuttugu alan; secim web hizli
    // talep formuyla ayni sirada (MU-07).
    const addr = await this.pickDeliveryAddress(user.companyId);
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
          // ListingItemDto alanı `targetPrice` (derin denetim LU-04): eski
          // `targetUnitPrice` confirm'deki whitelist ile sessizce düşüyordu.
          targetPrice: i.targetUnitPrice ?? undefined,
        })) as CreateListingDto["items"],
    };
    return { dto, address: addr };
  }

  /**
   * Yayin adresi — web hizli talep formunun sirasi (quick-request.tsx):
   * talep sartlari profilindeki adres (kaydedilmis ya da son talepteki),
   * sonra varsayilan TESLIMAT, sonra herhangi bir TESLIMAT, en son ILETISIM.
   * Eskiden TESLIMAT/ILETISIM arasindan en eski olusturulan aliniyordu: eski
   * bir iletisim adresi yeni varsayilan teslimat adresinin onune geciyordu
   * (derin denetim MU-07).
   */
  private async pickDeliveryAddress(companyId: string): Promise<PickedAddress | null> {
    const select = { id: true, title: true, city: true, district: true } as const;
    const profile = await this.requestDefaults.get(companyId).catch(() => null);
    const preferredId = profile?.defaults?.deliveryAddressId ?? null;
    if (preferredId) {
      const preferred = await this.prisma.companyAddress.findFirst({
        where: { id: preferredId, companyId },
        select,
      });
      if (preferred) return preferred;
    }
    const rows = await this.prisma.companyAddress.findMany({
      where: { companyId, type: { in: ["TESLIMAT", "ILETISIM"] } },
      orderBy: { createdAt: "asc" },
      select: { ...select, type: true, isDefault: true },
    });
    const pick =
      rows.find((a) => a.type === "TESLIMAT" && a.isDefault) ??
      rows.find((a) => a.type === "TESLIMAT") ??
      rows[0];
    return pick ? { id: pick.id, title: pick.title, city: pick.city, district: pick.district } : null;
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
      throw new BadRequestException(i18nMessage("api.ai.buOnayZatenKullanilmis"));
    }

    let message = "";
    let resourceId: string | undefined;
    try {
      switch (action.type) {
        case "send_invites": {
          const p = action.params as { listingId: string; rothernIds: string[] };
          await this.listings.addInvitations(user, p.listingId, p.rothernIds);
          message = tApi("api.ai.assistant.result.invitesSent");
          resourceId = p.listingId;
          break;
        }
        case "eliminate_bid": {
          const p = action.params as { listingId: string; bidId: string; reason?: string };
          await this.listings.eliminate(user, p.listingId, p.bidId, p.reason);
          message = tApi("api.ai.assistant.result.bidEliminated");
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
          message = tApi(
            r?.orderId
              ? "api.ai.assistant.result.awarded"
              : "api.ai.assistant.result.awardPending",
          );
          break;
        }
        case "place_bid": {
          const p = action.params as { listingId: string; dto: PlaceBidDto };
          // Denetim P6: saklanan payload YÜRÜTMEDEN ÖNCE gerçek DTO'suyla
          // doğrulanır (confirm ucu gövde almadığı için ValidationPipe devrede
          // değil; `as PlaceBidDto` yalnız derleme-zamanı iddiadır).
          const bidDto = validatePendingDto(PlaceBidDto, p.dto);
          await this.listings.placeBid(user, p.listingId, bidDto);
          message = tApi("api.ai.assistant.result.bidPlaced");
          resourceId = p.listingId;
          break;
        }
        case "mark_order_received": {
          const p = action.params as { orderId: string; note?: string };
          await this.orders.receive(user, p.orderId, { note: p.note } as never);
          message = tApi("api.ai.assistant.result.orderReceived");
          resourceId = p.orderId;
          break;
        }
        case "publish_tender": {
          const p = action.params as { dto: CreateListingDto };
          const listingDto = validatePendingDto(CreateListingDto, p.dto);
          const created = (await this.listings.create(user, listingDto)) as {
            id?: string;
          };
          resourceId = created?.id;
          message = tApi("api.ai.assistant.result.published");
          // Yayınlanan taslağı oturumdan temizle (tekrar yayınlanmasın).
          await this.prisma.aiChatSession.update({
            where: { id: session.id },
            data: { tenderDraft: Prisma.DbNull },
          });
          break;
        }
        default:
          throw new BadRequestException(i18nMessage("api.ai.bilinmeyenAksiyonTipi"));
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
    return {
      status: "rejected",
      message: tApi("api.ai.assistant.result.rejected"),
    };
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
    if (!session) throw new NotFoundException(i18nMessage("api.ai.sohbetBulunamadi"));
    const action = session.pendingAction as unknown as StoredPendingAction | null;
    if (!action || action.id !== actionId) {
      throw new BadRequestException(i18nMessage("api.ai.onayBekleyenIslemBulunamadi"));
    }
    if (Date.parse(action.expiresAt) < Date.now()) {
      await this.prisma.aiChatSession.update({
        where: { id: session.id },
        data: { pendingAction: Prisma.DbNull },
      });
      throw new ForbiddenException(i18nMessage("api.ai.onaySuresiDolduAsistandanIslemiYeniden"));
    }
    return { session, action };
  }
}

/** Onay kartı için ödeme planı özeti (bağlayıcı alanlar gizlenmemeli). */
function summarizePaymentPlan(dto: {
  paymentCategory?: unknown;
  advancePercent?: number | null;
  paymentDays?: number | null;
}): string {
  const cat = paymentCategoryLabel(dto.paymentCategory ? String(dto.paymentCategory) : null);
  if (!cat) return tApi("api.ai.assistant.payment.unspecified");
  const parts = [cat];
  // Yüzde (1-100) ve vade günü (1-365) SAYI geçilir: üç haneyi aşmadıkları
  // için ICU biçimlendirmesi binlik ayraç eklemez, çeviri çoğul kurabilir.
  if (dto.advancePercent != null) {
    parts.push(
      tApi("api.ai.assistant.payment.advance", { percent: dto.advancePercent }),
    );
  }
  if (dto.paymentDays != null) {
    parts.push(tApi("api.ai.assistant.payment.term", { days: dto.paymentDays }));
  }
  return parts.join(" · ");
}

/** Serbest metin önizlemesi — kart okunur kalsın diye kısaltılır. */
function previewText(v: string | null | undefined, max = 220): string {
  const s = (v ?? "").replace(/\s+/g, " ").trim();
  if (!s) return tApi("api.ai.assistant.preview.empty");
  return s.length > max
    ? tApi("api.ai.assistant.preview.truncated", {
        text: s.slice(0, max),
        // Karakter sayısı dört haneyi aşabilir → DİZE (ICU binlik ayracı
        // bugünkü ham çıktıyı bozardı).
        count: String(s.length),
      })
    : s;
}
