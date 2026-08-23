import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CompanyRole,
  Prisma,
  type CompanyOrderPaymentTiming,
  type CompanyOrderStatus,
} from "@rothern/db";
import {
  advancePercentFor,
  DUE_DATE_CATEGORIES,
  isLetterOfCredit,
  paymentDueDate,
  sellerShipsGoods,
  type PaymentCategory,
} from "@rothern/shared";
import {
  PrismaService,
  PrismaBypassService,
} from "../../../common/prisma/prisma.service";
import { runTenantTx } from "../../../common/prisma/tenant-tx";
import { MAX_MONEY } from "../../../common/constants/money";
import { sumPaymentsByStatus } from "../../../common/company/order-payments";
import { AuditService } from "../../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import type {
  AcceptOrderDto,
  OrderNoteDto,
  ShipOrderDto,
} from "../dto/order-action.dto";
import { EmailService } from "../../email/email.service";
import {
  NotificationService,
  rolesForPortal,
  type NotificationPortal,
} from "../../notifications/notification.service";
import { RealtimeService } from "../../realtime/realtime.service";
import { resolveWebUrl } from "../../../common/config/web-url";

/**
 * Sipariş listesi tavanı — client-side işlenen liste (OrdersList) full-set ister.
 * Eski 200 tavanı 200+ siparişli firmanın eski kayıtlarını erişilemez kılıyordu.
 * ~800'e yaklaşınca liste server-driven'a taşınmalı (bkz. list() JSDoc'u).
 */
const ORDERS_LIST_CAP = 1000;

// TTK 23 muayene/ayıp ihbarı penceresi — teslimden itibaren gün. Tek pencere
// (2/8 açık/gizli ayrımı hukuki nitelendirme, buton değil): en geniş süreyi ver.
const DEFECT_NOTICE_WINDOW_DAYS = 8;

@Injectable()
export class CompanyOrdersService {
  private readonly logger = new Logger(CompanyOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    // RLS: KÜRESEL cron sweep'i (sendDuePaymentReminders) tenant-bağlamsız çalışır
    // ve TÜM firmaların vadesi gelen siparişlerini tarar → RLS'li client boş
    // dönerdi. Bu tek yol bypass kullanır (gerekçe: inherently cross-tenant cron,
    // bildirim/announce cron'larıyla aynı kategori). Kullanıcı-bağlamlı TÜM order
    // işlemleri (accept/ship/complete/...) this.prisma (RLS-korumalı) kalır.
    private readonly bypass: PrismaBypassService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  private webUrl(): string {
    return resolveWebUrl(this.config);
  }

  private async companyRecipient(
    companyId: string,
    portal?: NotificationPortal,
  ): Promise<{ email: string; name: string } | null> {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { name: true, billingEmail: true },
    });
    if (!company) return null;
    if (company.billingEmail) {
      return { email: company.billingEmail, name: company.name };
    }
    const user = await this.prisma.companyUser.findFirst({
      where: {
        companyId,
        isActive: true,
        deletedAt: null,
        ...(portal ? { roles: { hasSome: rolesForPortal(portal) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user) return null;
    return { email: user.email, name: `${user.firstName} ${user.lastName}` };
  }

  /**
   * Sipariş durumu değişince karşı tarafa bildirim (fire-and-forget). `portal`
   * alıcının siparişteki rolüdür: alıcı→satinalma, satıcı→satış (böylece
   * satış siparişi bildirimi saf satın almacıya düşmez).
   */
  private async notifyOrderParty(
    orderId: string,
    recipientCompanyId: string,
    subject: string,
    heading: string,
    paragraph: string,
    portal: NotificationPortal,
  ): Promise<void> {
    const ctaUrl = `${this.webUrl()}/company/siparis/${orderId}`;
    // In-app kanal (order_status_changed transactional → her zaman gider).
    await this.notifications.pushToCompany(recipientCompanyId, {
      type: "order_status_changed",
      portal,
      title: heading,
      body: paragraph,
      ctaLabel: "Siparişi Gör",
      ctaUrl,
    });
    const to = await this.companyRecipient(recipientCompanyId, portal);
    if (!to) return;
    void this.email
      .send({
        to: { email: to.email, name: to.name },
        templateData: {
          template: "notification",
          data: {
            subject,
            heading,
            paragraphs: ["Merhaba,", paragraph],
            ctaLabel: "Siparişi Gör",
            ctaUrl,
          },
        },
        subject,
        context: { type: "order_status_changed", id: orderId },
      })
      .catch((err) =>
        this.logger.error(
          `Sipariş bildirimi gönderilemedi (${to.email}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      );
  }

  /** Satıcı siparişi onaylar: PENDING → ACCEPTED (+ teslim tarihi/banka/not).
   *  Banka bilgisi elle girilmez — KAYITLI hesaptan (id) seçilir, firmaya
   *  aitliği doğrulanır ve siparişe SNAPSHOT yazılır (hesap sonradan silinse
   *  de sipariş kaydı değişmez). */
  async accept(user: AuthenticatedCompanyUser, id: string, input: AcceptOrderDto) {
    // Yetki + durum ön-kontrolü (transition atomik olarak yineler): yalnız
    // satıcı, yalnız PENDING. Yanlış taraf, teminat/banka hatası değil YETKİ
    // hatası almalı (kontrol sırası: authz → iş doğrulaması).
    const src = await this.loadParticipant(user, id);
    if (src.sellerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "seller");
    if (src.status !== "PENDING") {
      throw new BadRequestException("Sipariş bu durumda bu işleme uygun değil");
    }
    // Teminat mektubu şartı (requireGuaranteeLetter) BİLGİ AMAÇLIDIR: belge
    // yükleme siparişten kaldırıldı (2026-08-22, "muhasebe/belge arşivi değiliz")
    // — teminat platform dışında alıcıya iletilir; onay kapısı yok.
    // Ödeme alabilmek için kayıtlı banka hesabı — alıcı buraya öder. (Hesabı
    // yalnız Kurucu ekler; satıcı onayda kayıtlı hesaplarından seçer.)
    // S1: LC/vesaik mukabilinde ödeme banka kanalından LC/belge şartına göre
    // gider → seçilen IBAN işlevsiz; bu iki kategoride banka hesabı OPSİYONEL
    // (verilmezse snapshot null; verilirse yine doğrulanıp saklanır).
    const skipBankRequired =
      src.paymentCategory === "LETTER_OF_CREDIT" ||
      src.paymentCategory === "CASH_AGAINST_DOCS";
    let bankAccountHolder: string | null = null;
    let bankIban: string | null = null;
    if (input.bankAccountId) {
      const acct = await this.prisma.companyBankAccount.findUnique({
        where: { id: input.bankAccountId },
        select: { companyId: true, accountHolder: true, iban: true },
      });
      if (!acct || acct.companyId !== user.companyId) {
        throw new BadRequestException("Geçersiz banka hesabı seçimi");
      }
      bankAccountHolder = acct.accountHolder;
      bankIban = acct.iban;
    } else if (!skipBankRequired) {
      throw new BadRequestException(
        "Ödeme alabilmek için onayda bir banka hesabı seçmelisiniz — kayıtlı hesabınız yoksa Ayarlar → Banka Hesapları'ndan ekleyin (yalnız Kurucu ekleyebilir)",
      );
    }
    // Tahmini teslim kabulde SORULMAZ (2026-08-02) — teklif zaten teslim
    // bilgisi taşıyor. Verilmezse award snapshot'ındaki kalem teslim
    // tarihlerinin en geci; hiç yoksa null (gösterimler null'a dayanıklı).
    let expectedDeliveryDate: Date | null = input.expectedDeliveryDate
      ? new Date(input.expectedDeliveryDate)
      : null;
    if (!expectedDeliveryDate) {
      const latest = await this.prisma.companyOrderItem.aggregate({
        where: { orderId: id, deliveryDate: { not: null } },
        _max: { deliveryDate: true },
      });
      expectedDeliveryDate = latest._max.deliveryDate ?? null;
    }
    const res = await this.transition(user, id, {
      side: "seller",
      from: "PENDING",
      to: "ACCEPTED",
      data: {
        acceptedAt: new Date(),
        acceptedNote: input.acceptedNote?.trim() || null,
        bankAccountHolder,
        bankIban,
        expectedDeliveryDate,
      },
    });
    // INV-AUDIT-1: durum geçişi (sipariş onayı) — commit SONRASI, bildirimden önce.
    await this.audit.log({
      action: "company.order.accepted",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: {
        orderNumber: res.order.number,
        from: "PENDING",
        to: "ACCEPTED",
        expectedDeliveryDate: expectedDeliveryDate?.toISOString() ?? null,
        bankAccountId: input.bankAccountId,
      },
    });
    await this.notifyOrderParty(
      id,
      res.order.buyerCompanyId,
      "Siparişiniz onaylandı",
      "Sipariş onaylandı",
      `${this.orderLabel(res.order.number)} siparişiniz satıcı tarafından onaylandı ve hazırlanıyor.`,
      "satinalma",
    );
    return { ok: res.ok, status: res.status };
  }

  /** Satıcı siparişi reddeder: PENDING → REJECTED (+ gerekçe zorunlu). */
  async reject(user: AuthenticatedCompanyUser, id: string, reason?: string) {
    // Eski sistem paritesi + frontend ReasonModal minLength=10 ile aynı kural:
    // karşı taraf gerekçesiz ret görmesin (sunucu otorite).
    if ((reason?.trim().length ?? 0) < 10) {
      throw new BadRequestException("Red gerekçesi en az 10 karakter olmalı");
    }
    const res = await this.transition(user, id, {
      side: "seller",
      from: "PENDING",
      to: "REJECTED",
      // Gerekçe geçişle AYNI yazmada — ikinci update yarıda kalırsa
      // gerekçesiz REJECTED kalmasın.
      data: { rejectedReason: reason!.trim(), rejectedAt: new Date() },
    });
    // INV-AUDIT-1: durum geçişi (sipariş reddi) — commit SONRASI, bildirimden önce.
    await this.audit.log({
      action: "company.order.rejected",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: {
        orderNumber: res.order.number,
        from: "PENDING",
        to: "REJECTED",
        reason: reason!.trim(),
      },
    });
    await this.notifyOrderParty(
      id,
      res.order.buyerCompanyId,
      "Siparişiniz reddedildi",
      "Sipariş reddedildi",
      `${this.orderLabel(res.order.number)} siparişiniz satıcı tarafından reddedildi.${
        reason ? ` Gerekçe: ${reason}` : ""
      }`,
      "satinalma",
    );
    return { ok: res.ok, status: res.status };
  }

  /** Satıcı siparişi gönderir: ACCEPTED → IN_DELIVERY (+ fatura no zorunlu).
   *  Alıcının bekleyen ödeme kaydı varken gönderilemez — satıcı önce
   *  ödemeyi onaylamalı ya da reddetmeli (alıcı tamamlama kapısının simetriği). */
  async ship(user: AuthenticatedCompanyUser, id: string, input: ShipOrderDto) {
    const order = await this.loadParticipant(user, id);
    // TTK 23: ayıp ihbarı DISPUTED'ında satıcı SEVK EDEMEZ (mal zaten teslim,
    // ihtilaf muayene/ayıp meselesi). A1 (satıcı iptal talebi) DISPUTED'ında
    // sevk açık kalır — ayrımı defectNotifiedAt yapar. (ship from-list DISPUTED
    // içerdiğinden bu guard olmadan ayıplı sipariş sevk yoluna girerdi.)
    if (order.status === "DISPUTED" && order.defectNotifiedAt) {
      throw new BadRequestException(
        "Ayıp ihbarı bulunan sipariş sevk edilemez — mal zaten teslim edilmiş; çözüm taraflar arasında",
      );
    }
    const category = order.paymentCategory as PaymentCategory;
    // AKREDİTİF: satıcı, alıcının açtırdığı akreditifi KABUL etmeden gönderemez
    // (banka güvencesi teyit edilmeden mal yola çıkmasın — S5 adım kilidi).
    if (isLetterOfCredit(category)) {
      if (!order.lcOpenedAt) {
        throw new BadRequestException(
          "Alıcının akreditifi henüz açmadı — akreditif açılıp kabul edilmeden gönderilemez",
        );
      }
      if (!order.lcAcceptedAt) {
        throw new BadRequestException(
          "Akreditifi kabul etmeden gönderemezsiniz — Akreditif bölümünden 'Akreditifi Kabul Ettim' adımını tamamlayın",
        );
      }
    }
    // PEŞİN (S3): onaylı ödeme, gönderim öncesi peşin eşiğine ulaşmalı. Alıcı
    // hiç ödemeden satıcının kargoya vermesi burada engellenir (eski davranışta
    // yalnız frontend gizliyordu). Kısmi peşinde eşik = tutar × yüzde.
    const advanceDue = this.advanceDueDecimal(
      category,
      order.advancePercent,
      new Prisma.Decimal(order.amount),
    );
    if (advanceDue.gt(0)) {
      const confirmed = await this.confirmedPaymentSum(id);
      // INV-MONEY-1: tam Decimal, tolerans yok — eşiğe TAM ulaşma GEÇER,
      // 1 kuruş eksik gönderimi ENGELLER.
      if (confirmed.lt(advanceDue)) {
        const curSym = await this.orderCurrencySymbol(id);
        throw new BadRequestException(
          `Bu siparişte peşin ödeme şartı var — gönderim için ${advanceDue.toNumber().toLocaleString("tr-TR")} ${curSym} peşin tahsilat onaylanmalı (onaylı: ${confirmed.toNumber().toLocaleString("tr-TR")} ${curSym})`,
        );
      }
    }
    const pendingPayments = await this.prisma.companyOrderPayment.count({
      where: { orderId: id, status: "AWAITING_CONFIRMATION" },
    });
    if (pendingPayments > 0) {
      throw new BadRequestException(
        "Alıcının onay bekleyen ödeme kaydı var — siparişi göndermeden önce Ödemeler bölümünden onaylayın veya reddedin",
      );
    }
    const res = await this.transition(user, id, {
      side: "seller",
      // A1: DISPUTED'dan da sevk edilebilir (mal bulundu → ihtilaf çözüldü).
      // Ship ön-koşulları (peşin/LC/bekleyen-ödeme) yukarıda zaten çalıştı.
      from: ["ACCEPTED", "CREATED", "DISPUTED"],
      to: "IN_DELIVERY",
      data: {
        invoiceNumber: input.invoiceNumber.trim(),
        deliveryNote: input.deliveryNote?.trim() || null,
        deliveryStartedAt: new Date(),
      },
    });
    // INV-AUDIT-1: durum geçişi (gönderim) — commit SONRASI, bildirimden önce.
    await this.audit.log({
      action: "company.order.shipped",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: {
        orderNumber: res.order.number,
        from: order.status,
        to: "IN_DELIVERY",
        invoiceNumber: input.invoiceNumber.trim(),
      },
    });
    // Teslim şekline göre bildirim: satıcı taşıyorsa "gönderildi/yolda";
    // alıcı topluyorsa (EXW/fabrika teslim/FOB…) "teslime hazır".
    const ships = sellerShipsGoods(order.deliveryTerm);
    await this.notifyOrderParty(
      id,
      res.order.buyerCompanyId,
      ships ? "Siparişiniz gönderildi" : "Siparişiniz teslime hazır",
      ships ? "Sipariş yolda" : "Teslime hazır",
      ships
        ? `${this.orderLabel(res.order.number)} siparişiniz gönderildi (Fatura no: ${input.invoiceNumber.trim()}).`
        : `${this.orderLabel(res.order.number)} siparişiniz teslime hazır — teslim alabilirsiniz (Fatura no: ${input.invoiceNumber.trim()}).`,
      "satinalma",
    );
    return { ok: res.ok, status: res.status };
  }

  /**
   * Alıcı teslim alır → HER ZAMAN DELIVERED (fiziksel teslim). YAŞAM DÖNGÜSÜ
   * AYRIMI: teslim (operasyonel) ile ödeme (finansal) ayrı — eskiden BEFORE_
   * DELIVERY tam ödeme → oto-COMPLETED yapıyordu (ödeme→durum kaplini). Artık
   * alıcı muayene (TTK 8 gün) sonrası `complete()` ile KABUL eder; ödeme ayrı
   * izlenir. İSTİSNA: vesaik mukabili (CASH_AGAINST_DOCS) teslim KAPISI korunur
   * (belge karşılığı ödeme onayı olmadan mal çekilemez — tamamlama değil, teslim).
   */
  async receive(user: AuthenticatedCompanyUser, id: string, input: OrderNoteDto) {
    const order = await this.loadParticipant(user, id);
    if (
      order.paymentTiming === "BEFORE_DELIVERY" &&
      order.paymentCategory === "CASH_AGAINST_DOCS"
    ) {
      const [amt, confirmed] = await Promise.all([
        this.prisma.companyOrder.findUnique({
          where: { id },
          select: { amount: true },
        }),
        this.confirmedPaymentSum(id),
      ]);
      const total = amt ? new Prisma.Decimal(amt.amount) : new Prisma.Decimal(0);
      if (!this.isFullyPaid(total, confirmed)) {
        throw new BadRequestException(
          "Vesaik mukabili: teslim almadan önce tam ödemenin onaylanması gerekir",
        );
      }
    }
    // Madde 17 (2026-08-02): alıcı "Teslim Aldım" deyince sipariş OTOMATİK
    // tamamlanır (IN_DELIVERY → doğrudan COMPLETED; ayrı "Tamamla" adımı
    // kalktı). Ödeme yaşam döngüsü AYRI izlenmeye devam eder (COMPLETED
    // sipariş ödeme-açık olabilir); ayıp ihbarı penceresi COMPLETED'da da
    // açık (deliveredAt + 8 gün). Eski DELIVERED kayıtlar için complete()
    // yolu duruyor.
    const res = await this.transition(user, id, {
      side: "buyer",
      from: "IN_DELIVERY",
      to: "COMPLETED",
      data: {
        deliveredAt: new Date(),
        completedAt: new Date(),
        completedNote: input.note?.trim() || null,
      },
    });
    // INV-AUDIT-1: durum geçişi (teslim alındı → tamamlandı) — commit sonrası.
    await this.audit.log({
      action: "company.order.received",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: {
        orderNumber: res.order.number,
        from: "IN_DELIVERY",
        to: "COMPLETED",
        autoCompleted: true,
      },
    });
    await this.notifyOrderParty(
      id,
      res.order.sellerCompanyId,
      "Sipariş teslim alındı ve tamamlandı",
      "Sipariş tamamlandı",
      `${this.orderLabel(res.order.number)} siparişi alıcı tarafından teslim alındı ve tamamlandı.`,
      "satis",
    );
    return { ok: res.ok, status: res.status };
  }

  /** Alıcı siparişi tamamlar: DELIVERED → COMPLETED = malın KABULÜ (operasyonel
   *  bitiş). YAŞAM DÖNGÜSÜ AYRIMI: ödeme şartı YOK — sipariş (mal teslim/kabul)
   *  ile ödeme (borç kapandı mı) farklı yaşam döngüleridir. Vadeli siparişte
   *  alıcı malı kabul edip tamamlar; borç `paymentTotals`/cron ile AYRI izlenir
   *  (COMPLETED sipariş ödeme-açık olabilir). */
  async complete(user: AuthenticatedCompanyUser, id: string, input: OrderNoteDto) {
    // Yetki + durum ön-kontrolü (transition atomik yineler): yalnız alıcı,
    // yalnız DELIVERED.
    const src = await this.loadParticipant(user, id);
    if (src.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "buyer");
    if (src.status !== "DELIVERED") {
      throw new BadRequestException("Sipariş bu durumda bu işleme uygun değil");
    }
    const res = await this.transition(user, id, {
      side: "buyer",
      from: "DELIVERED",
      to: "COMPLETED",
      data: { completedAt: new Date(), completedNote: input.note?.trim() || null },
    });
    // INV-AUDIT-1: durum geçişi (tamamlama) — commit SONRASI, bildirimden önce.
    await this.audit.log({
      action: "company.order.completed",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: {
        orderNumber: res.order.number,
        from: "DELIVERED",
        to: "COMPLETED",
      },
    });
    await this.notifyOrderParty(
      id,
      res.order.sellerCompanyId,
      "Sipariş tamamlandı",
      "Sipariş tamamlandı",
      `${this.orderLabel(res.order.number)} siparişi tamamlandı.`,
      "satis",
    );
    return { ok: res.ok, status: res.status };
  }

  /**
   * Alıcı siparişi iptal eder (teslimat öncesi): PENDING/ACCEPTED → CANCELLED.
   * Gerekçe zorunlu (eski sistem paritesi). Bilinçli fark: eski sistem
   * IN_DELIVERY'de de iptale izin veriyordu — kargodaki (faturası kesilmiş)
   * siparişin tek taraflı iptali ihtilaf yarattığından yeni akışta kapalı.
   */
  async cancel(user: AuthenticatedCompanyUser, id: string, reason?: string) {
    if ((reason?.trim().length ?? 0) < 10) {
      throw new BadRequestException(
        "İptal gerekçesi en az 10 karakter olmalı",
      );
    }
    // Yetki dış katmanda (iş doğrulamasından önce).
    const order = await this.loadParticipant(user, id);
    if (order.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "buyer");

    const CANCELABLE: CompanyOrderStatus[] = ["PENDING", "ACCEPTED", "CREATED"];
    // Sipariş satırını FOR UPDATE kilitle → CONFIRMED say → geçiş, tek tx'te.
    // paymentDecision(confirm) da aynı satırı kilitlediğinden iptal↔onay yarışı
    // serileşir: ikisi aynı anda çalışamaz, biri diğerinin sonucunu görür.
    await runTenantTx(this.prisma, async (tx) => {
      const rows = await tx.$queryRaw<{ status: CompanyOrderStatus }[]>`
        SELECT "status" FROM "company_orders" WHERE "id" = ${id} FOR UPDATE`;
      const status = rows[0]?.status;
      if (!status || !CANCELABLE.includes(status)) {
        throw new BadRequestException(
          "Sipariş bu durumda bu işleme uygun değil",
        );
      }
      // Onaylı (CONFIRMED) ödeme varsa tek taraflı iptal edilemez — para el
      // değiştirdi, iade akışı gerekir. Bekleyen ödeme (AWAITING) engel değil.
      const confirmedPayments = await tx.companyOrderPayment.count({
        where: { orderId: id, status: "CONFIRMED" },
      });
      if (confirmedPayments > 0) {
        throw new BadRequestException(
          "Onaylı ödeme bulunan sipariş iptal edilemez — iade için destek ekibiyle iletişime geçin",
        );
      }
      const done = await tx.companyOrder.updateMany({
        where: { id, status: { in: CANCELABLE } },
        data: { status: "CANCELLED", cancelReason: reason!.trim(), cancelledAt: new Date() },
      });
      if (done.count !== 1) {
        throw new BadRequestException(
          "Sipariş durumu az önce değişti — sayfayı yenileyip tekrar deneyin",
        );
      }
    });
    // INV-AUDIT-1: durum geçişi (iptal) — commit SONRASI, bildirimden önce.
    await this.audit.log({
      action: "company.order.cancelled",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: {
        orderNumber: order.number,
        from: order.status,
        to: "CANCELLED",
        reason: reason!.trim(),
      },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Sipariş iptal edildi",
      "Sipariş iptal edildi",
      `${this.orderLabel(order.number)} siparişi alıcı tarafından iptal edildi.${
        reason ? ` Gerekçe: ${reason}` : ""
      }`,
      "satis",
    );
    return { ok: true, status: "CANCELLED" as const };
  }

  // ---- A1: Satıcı iptal talebi + DISPUTED (yalnız ACCEPTED) ----
  // Platform sözleşme icra etmez / para tutmaz / hakem değildir — katkısı NE
  // OLDUĞUNU DOĞRU KAYDETMEK (audit_logs). Satıcı çıkış talep eder; alıcı onaylar
  // (→CANCELLED) ya da reddeder (→DISPUTED, saat durur, iki-yönlü çıkış açık).

  /** Satıcı ACCEPTED siparişte iptal talebi açar (gerekçe ZORUNLU, min 10).
   *  Durum ACCEPTED kalır (flag); otomatik onay YOK — alıcı karar verir. */
  async requestCancel(user: AuthenticatedCompanyUser, id: string, reason?: string) {
    if ((reason?.trim().length ?? 0) < 10) {
      throw new BadRequestException(
        "İptal talebi gerekçesi en az 10 karakter olmalı",
      );
    }
    const order = await this.loadParticipant(user, id);
    if (order.sellerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "seller");
    // Atomik: yalnız ACCEPTED ve açık talep YOKKEN (transition() flag koşulu
    // alamaz → doğrudan updateMany + count===1, INV-SM-3 deseni).
    const res = await this.prisma.companyOrder.updateMany({
      where: { id, status: "ACCEPTED", cancelRequestedAt: null },
      data: {
        cancelRequestedAt: new Date(),
        cancelRequestReason: reason!.trim(),
        cancelRequestById: user.userId,
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException(
        "İptal talebi yalnız onaylanmış (ve açık talebi olmayan) siparişte açılabilir",
      );
    }
    await this.audit.log({
      action: "company.order.cancel_requested",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: { orderNumber: order.number, reason: reason!.trim() },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.buyerCompanyId,
      "Satıcı sipariş iptali talep etti",
      "Satıcı sipariş iptali talep etti",
      `${this.orderLabel(order.number)} sipariş için satıcı iptal talep etti. Gerekçe: ${reason!.trim()} — Onaylayın veya reddedin.`,
      "satinalma",
    );
    return { ok: true as const };
  }

  /** Satıcı açık iptal talebini geri çeker — sipariş ACCEPTED'da kalır. */
  async withdrawCancelRequest(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.loadParticipant(user, id);
    if (order.sellerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "seller");
    const res = await this.prisma.companyOrder.updateMany({
      where: { id, status: "ACCEPTED", cancelRequestedAt: { not: null } },
      data: {
        cancelRequestedAt: null,
        cancelRequestReason: null,
        cancelRequestById: null,
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException("Geri çekilecek açık bir iptal talebi yok");
    }
    await this.audit.log({
      action: "company.order.cancel_request_withdrawn",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: { orderNumber: order.number },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.buyerCompanyId,
      "İptal talebi geri çekildi",
      "İptal talebi geri çekildi",
      `${this.orderLabel(order.number)} sipariş için satıcı iptal talebini geri çekti; sipariş devam ediyor.`,
      "satinalma",
    );
    return { ok: true as const };
  }

  /** Alıcı iptal talebini ONAYLAR → CANCELLED. DISPUTED'dan da çağrılabilir
   *  (alıcı sonradan iptali kabul eder). CONFIRMED ödemede ENGELLEME YOK — iade
   *  taraflar arasında (platform para tutmaz); uyarı frontend'de gösterilir. */
  async approveCancelRequest(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.loadParticipant(user, id);
    if (order.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "buyer");
    const res = await this.prisma.companyOrder.updateMany({
      where: {
        id,
        OR: [
          { status: "ACCEPTED", cancelRequestedAt: { not: null } },
          // TTK 23: yalnız A1 (satıcı iptal talebi) DISPUTED'ı — ayıp ihbarı
          // DISPUTED'ı (defectNotifiedAt dolu) buradan iptal edilemez.
          { status: "DISPUTED", defectNotifiedAt: null },
        ],
      },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason:
          order.cancelRequestReason ?? "Satıcı iptal talebi onaylandı",
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException(
        "Onaylanacak açık bir iptal talebi/ihtilaf yok — durum değişmiş olabilir",
      );
    }
    await this.audit.log({
      action: "company.order.cancel_request_approved",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: {
        orderNumber: order.number,
        from: order.status,
        to: "CANCELLED",
      },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "İptal talebi onaylandı",
      "İptal talebi onaylandı",
      `${this.orderLabel(order.number)} sipariş, alıcının onayıyla iptal edildi.`,
      "satis",
    );
    return { ok: true as const, status: "CANCELLED" as const };
  }

  /** Alıcı iptal talebini REDDEDER → DISPUTED (ACCEPTED'a geri DÖNMEZ). Sipariş
   *  gerçekten ihtilaflı; saat durur, iki-yönlü çıkış açık (satıcı sevk / alıcı onay). */
  async rejectCancelRequest(
    user: AuthenticatedCompanyUser,
    id: string,
    reason?: string,
  ) {
    const order = await this.loadParticipant(user, id);
    if (order.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "buyer");
    const res = await this.prisma.companyOrder.updateMany({
      where: { id, status: "ACCEPTED", cancelRequestedAt: { not: null } },
      data: { status: "DISPUTED", disputedAt: new Date() },
    });
    if (res.count !== 1) {
      throw new BadRequestException(
        "Reddedilecek açık bir iptal talebi yok — durum değişmiş olabilir",
      );
    }
    await this.audit.log({
      action: "company.order.disputed",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: {
        orderNumber: order.number,
        from: "ACCEPTED",
        to: "DISPUTED",
        sellerReason: order.cancelRequestReason ?? null,
        buyerReason: reason?.trim() || null,
      },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "İptal talebi reddedildi — sipariş ihtilaflı",
      "İptal talebi reddedildi — sipariş ihtilaflı",
      `${this.orderLabel(order.number)} sipariş için iptal talebiniz reddedildi. Sipariş ihtilaflı; mal bulunursa sevk edebilir, ya da alıcı sonradan iptali onaylayabilir.`,
      "satis",
    );
    return { ok: true as const, status: "DISPUTED" as const };
  }

  // ---- TTK 23: Muayene/kabul + ayıp ihbarı (alıcı, teslimden sonra 8 gün) ----
  // Tacirler arası satışta alıcı teslim alınca inceleyip ayıbı ihbar etmezse
  // seçimlik haklarını kaybeder. Platform icra etmez/hakem değildir — ihbarı
  // KAYDEDER (delil); çözüm (dönme/indirim/onarım/değişim) taraflar arasında.
  // Tek pencere: 8 gün (2/8 açık/gizli ayrımı hukuki nitelendirme, buton değil).

  /** Alıcı ayıp ihbarı açar (gerekçe ZORUNLU min 10) → DISPUTED. Teslimden
   *  itibaren 8 gün içinde; DELIVERED ve COMPLETED'da (TTK ödemeye bakmaz).
   *  Otomatik kabul YOK — süre dolunca yalnız pencere kapanır. */
  async raiseDefectNotice(
    user: AuthenticatedCompanyUser,
    id: string,
    reason?: string,
  ) {
    if ((reason?.trim().length ?? 0) < 10) {
      throw new BadRequestException(
        "Ayıp ihbarı gerekçesi en az 10 karakter olmalı",
      );
    }
    const order = await this.loadParticipant(user, id);
    if (order.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "buyer");
    if (order.status !== "DELIVERED" && order.status !== "COMPLETED") {
      throw new BadRequestException(
        "Ayıp ihbarı yalnız teslim alınmış siparişte açılabilir",
      );
    }
    if (!order.deliveredAt) {
      throw new BadRequestException("Siparişin teslim tarihi yok");
    }
    // 8-gün muayene penceresi — WHERE'de tarih-aritmetiği ifade edilemez, kodda.
    const windowMs = DEFECT_NOTICE_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() > new Date(order.deliveredAt).getTime() + windowMs) {
      throw new BadRequestException(
        `Muayene/ayıp ihbarı süresi (${DEFECT_NOTICE_WINDOW_DAYS} gün) doldu`,
      );
    }
    // Atomik: DELIVERED/COMPLETED + açık ihbar yokken. disputePrevStatus geri
    // çekmede restore için okunan durumla damgalanır (INV-SM-1 count===1).
    const res = await this.prisma.companyOrder.updateMany({
      where: {
        id,
        status: { in: ["DELIVERED", "COMPLETED"] },
        defectNotifiedAt: null,
      },
      data: {
        status: "DISPUTED",
        disputedAt: new Date(),
        defectNotifiedAt: new Date(),
        defectReason: reason!.trim(),
        disputePrevStatus: order.status,
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException(
        "Ayıp ihbarı açılamadı — sipariş durumu değişmiş veya zaten bir ihbar var",
      );
    }
    await this.audit.log({
      action: "company.order.defect_notified",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: {
        orderNumber: order.number,
        from: order.status,
        to: "DISPUTED",
        reason: reason!.trim(),
      },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Ayıp ihbarı — sipariş ihtilaflı",
      "Ayıp ihbarı",
      `${this.orderLabel(order.number)} sipariş için alıcı ayıp ihbarında bulundu (TTK 23). Gerekçe: ${reason!.trim()} — çözüm taraflar arasındadır.`,
      "satis",
    );
    return { ok: true as const, status: "DISPUTED" as const };
  }

  /** Alıcı ayıp ihbarını geri çeker → önceki durumuna (DELIVERED/COMPLETED) döner. */
  async withdrawDefectNotice(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.loadParticipant(user, id);
    if (order.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "buyer");
    if (order.status !== "DISPUTED" || !order.defectNotifiedAt) {
      throw new BadRequestException("Geri çekilecek açık bir ayıp ihbarı yok");
    }
    const prev: CompanyOrderStatus = order.disputePrevStatus ?? "DELIVERED";
    const res = await this.prisma.companyOrder.updateMany({
      where: { id, status: "DISPUTED", defectNotifiedAt: { not: null } },
      data: {
        status: prev,
        disputedAt: null,
        defectNotifiedAt: null,
        defectReason: null,
        disputePrevStatus: null,
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException(
        "Ayıp ihbarı geri çekilemedi — durum değişmiş olabilir",
      );
    }
    await this.audit.log({
      action: "company.order.defect_notice_withdrawn",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      critical: true,
      metadata: { orderNumber: order.number, from: "DISPUTED", to: prev },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Ayıp ihbarı geri çekildi",
      "Ayıp ihbarı geri çekildi",
      `${this.orderLabel(order.number)} sipariş için alıcı ayıp ihbarını geri çekti; sipariş önceki durumuna döndü.`,
      "satis",
    );
    return { ok: true as const, status: prev };
  }

  // Sipariş revizyon müzakeresi KALDIRILDI (2026-08-02, kullanıcı kararı).
  // order_revisions tabloları veri kaybı olmasın diye şemada duruyor; açık
  // (PENDING) revizyonlar işlevsiz kalır — değişiklik iletişim + iptal yoluyla.

  // ---- Akreditif adım seti (yalnız paymentCategory=LETTER_OF_CREDIT, Faz 3) ----

  /** LC guard: sipariş akreditifli mi + istenen taraf mı (temiz yetki/durum). */
  private assertLcOrder(
    order: { paymentCategory: string; sellerCompanyId: string; buyerCompanyId: string },
    user: AuthenticatedCompanyUser,
    side: "seller" | "buyer",
  ) {
    if (!isLetterOfCredit(order.paymentCategory as PaymentCategory)) {
      throw new BadRequestException("Bu sipariş akreditifli değil");
    }
    const own =
      side === "seller"
        ? order.sellerCompanyId === user.companyId
        : order.buyerCompanyId === user.companyId;
    if (!own) throw new ForbiddenException("Bu işlemi yapamazsınız");
    this.assertOrderRole(user, side);
  }

  /** Alıcı: "Akreditif Açıldı" — beyan (belge yüklemesi yok); ACCEPTED evresi. */
  async lcMarkOpened(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.loadParticipant(user, id);
    this.assertLcOrder(order, user, "buyer");
    // A1-DISPUTED'ta da açık: sevk çıkışının ön koşulu (bkz. isPaymentOpen).
    if (order.status !== "ACCEPTED" && !this.isA1Dispute(order)) {
      throw new BadRequestException("Sipariş bu durumda bu işleme uygun değil");
    }
    if (order.lcOpenedAt) {
      throw new BadRequestException("Akreditif zaten açıldı olarak işaretlendi");
    }
    await this.prisma.companyOrder.update({
      where: { id },
      data: { lcOpenedAt: new Date() },
    });
    await this.audit.log({
      action: "company.order.lc_opened",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      metadata: { orderNumber: order.number },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Akreditif açıldı — kabulünüz bekleniyor",
      "Akreditif açıldı",
      `${this.orderLabel(order.number)} sipariş için alıcı akreditifi açtı. Bankanızdan teyit edip 'Akreditifi Kabul Ettim' adımını tamamlayın.`,
      "satis",
    );
    return { ok: true };
  }

  /** Satıcı: "Akreditifi Kabul Ettim" — açılmış olmalı; gönderim kilidini açar. */
  async lcMarkAccepted(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.loadParticipant(user, id);
    this.assertLcOrder(order, user, "seller");
    // A1-DISPUTED'ta da açık: sevk çıkışının ön koşulu (bkz. isPaymentOpen).
    if (order.status !== "ACCEPTED" && !this.isA1Dispute(order)) {
      throw new BadRequestException("Sipariş bu durumda bu işleme uygun değil");
    }
    if (!order.lcOpenedAt) {
      throw new BadRequestException(
        "Önce alıcının akreditifi açması gerekir",
      );
    }
    if (order.lcAcceptedAt) {
      throw new BadRequestException("Akreditif zaten kabul edildi");
    }
    await this.prisma.companyOrder.update({
      where: { id },
      data: { lcAcceptedAt: new Date() },
    });
    await this.audit.log({
      action: "company.order.lc_accepted",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order",
      entityId: id,
      metadata: { orderNumber: order.number },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.buyerCompanyId,
      "Akreditif kabul edildi",
      "Akreditif kabul edildi",
      `${this.orderLabel(order.number)} sipariş için satıcı akreditifi kabul etti ve gönderime hazırlanıyor.`,
      "satinalma",
    );
    return { ok: true };
  }

  /**
   * Satıcı: "Ödeme Bankadan Alındı" — akreditif ödemesi banka kanalından geldi.
   * Sistem, siparişin kalanı kadar ONAYLI ödeme kaydı üretir (yöntem
   * "Akreditif") → mevcut tamamlama/oto-tamamlama kapıları değişmeden çalışır.
   * DELIVERED ise doğrudan tamamlanır; IN_DELIVERY ise teslim alınınca kapanır.
   */
  async lcMarkPaid(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.loadParticipant(user, id);
    this.assertLcOrder(order, user, "seller");
    if (!order.lcAcceptedAt) {
      throw new BadRequestException(
        "Akreditif kabul edilmeden ödeme alındı işaretlenemez",
      );
    }
    if (
      order.status !== "IN_DELIVERY" &&
      order.status !== "DELIVERED" &&
      // Madde 17: teslim alma siparişi oto-tamamlar — LC banka ödemesi
      // COMPLETED siparişte de işaretlenebilmeli (borç yaşam döngüsü ayrı).
      order.status !== "COMPLETED"
    ) {
      throw new BadRequestException(
        "Ödeme, sipariş gönderildikten sonra işaretlenebilir",
      );
    }
    if (order.lcPaidAt) {
      throw new BadRequestException("Ödeme zaten alındı olarak işaretlendi");
    }
    // YAŞAM DÖNGÜSÜ AYRIMI: LC ödemesi borcu kapatır (onaylı tam-tutar kaydı +
    // lcPaidAt damgası) ama sipariş DURUMUNU değiştirmez — operasyonel tamamlama
    // alıcının `complete()` (kabul) adımıdır, ödeme değil.
    let createdPaymentId: string | null = null;
    let paidAmount = new Prisma.Decimal(0);
    await runTenantTx(this.prisma, async (tx) => {
      const rows = await tx.$queryRaw<
        { status: CompanyOrderStatus; amount: Prisma.Decimal }[]
      >`SELECT "status","amount" FROM "company_orders" WHERE "id" = ${id} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new NotFoundException("Sipariş bulunamadı");
      if (
        row.status !== "IN_DELIVERY" &&
        row.status !== "DELIVERED" &&
        // Madde 17: teslim alma oto-tamamlar — COMPLETED'da da işaretlenebilir.
        row.status !== "COMPLETED"
      ) {
        throw new BadRequestException(
          "Sipariş durumu az önce değişti — sayfayı yenileyip tekrar deneyin",
        );
      }
      const total = new Prisma.Decimal(row.amount);
      // X7/C4: birleşik onaylı-toplam (kilit altında, tx ile).
      const confirmed = await this.confirmedPaymentSum(id, tx);
      const remaining = Prisma.Decimal.max(0, total.minus(confirmed));
      // Kalan > 0 ise onaylı tam-tutar kaydı üret (idempotent lcPaidAt damgası
      // çift-tıkı zaten engeller; remaining=0 ise yalnız damga).
      if (remaining.gt(0)) {
        const created = await tx.companyOrderPayment.create({
          data: {
            orderId: id,
            amount: remaining,
            method: "Akreditif",
            note: "Akreditif ödemesi banka kanalından alındı",
            status: "CONFIRMED",
            confirmedAt: new Date(),
            recordedByCompanyId: order.sellerCompanyId,
            recordedByUserId: user.userId,
          },
        });
        createdPaymentId = created.id;
        paidAmount = remaining;
      }
      await tx.companyOrder.update({
        where: { id },
        data: { lcPaidAt: new Date() },
      });
    });
    // INV-AUDIT-1: bu uç ONAYLI ödeme satırı üretip audit'li paymentDecision
    // yolunu atlıyordu — "her CONFIRMED ödemenin izi vardır" simetrisi için
    // aynı aksiyon adıyla iz bırakılır (denetim 2026-08-23 Parça 3 #4).
    await this.audit.log({
      action: "company.order.payment_confirmed",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: createdPaymentId ? "company_order_payment" : "company_order",
      entityId: createdPaymentId ?? id,
      critical: true,
      metadata: {
        orderId: id,
        orderNumber: order.number,
        amount: Number(paidAmount),
        currency: order.currency,
        source: "letter_of_credit",
        to: "CONFIRMED",
      },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.buyerCompanyId,
      "Akreditif ödemesi alındı",
      "Ödeme alındı",
      `${this.orderLabel(order.number)} sipariş için akreditif ödemesi banka kanalından alındı.`,
      "satinalma",
    );
    return { ok: true };
  }

  /**
   * S7 — Vade hatırlatması. Teslim alınmış (DELIVERED) ama tam ödenmemiş
   * Vadeli/Çek/kısmi-peşin siparişlerde, vadeye `withinDays` gün veya daha az
   * kalanlar için alıcıya BİR KEZ bildirim (idempotency: paymentDueReminderSentAt).
   * Scheduler saatlik çağırır. Küçük aday kümesi → JS'te vade filtresi.
   */
  async sendDuePaymentReminders(withinDays = 3): Promise<number> {
    const now = Date.now();
    const horizon = now + withinDays * 24 * 60 * 60 * 1000;
    // Perf (1000 firma): global cron. Aday kümesi CURSOR-BATCH'lenir (sınırsız
    // tarama yok); onaylı ödeme toplamı per-order aggregate DEĞİL, batch başına
    // TEK groupBy + Map ile çözülür (eski N+1 → 1 sorgu/batch).
    const BATCH = 500;
    let cursor: string | undefined;
    let sent = 0;
    for (;;) {
      const candidates = await this.bypass.companyOrder.findMany({
        where: {
          // YAŞAM DÖNGÜSÜ AYRIMI: vadeli sipariş artık teslim/kabul edilince
          // COMPLETED olabilir ama borç açık kalır → cron DELIVERED + COMPLETED
          // izler. DISPUTED bilerek YOK (A1/TTK: ihtilafta ödeme saati durur).
          status: { in: ["DELIVERED", "COMPLETED"] },
          paymentDueReminderSentAt: null,
          deliveredAt: { not: null },
          paymentDays: { not: null },
          paymentCategory: { in: [...DUE_DATE_CATEGORIES] },
        },
        select: {
          id: true,
          number: true,
          amount: true,
          currency: true,
          buyerCompanyId: true,
          sellerCompanyId: true,
          paymentCategory: true,
          paymentDays: true,
          deliveredAt: true,
        },
        orderBy: { id: "asc" },
        take: BATCH,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });
      if (candidates.length === 0) break;
      cursor = candidates[candidates.length - 1]!.id;

      // Vade filtresi JS'te (küçük küme) → yalnız vadesi gelenler.
      const due = candidates
        .map((o) => ({
          o,
          dueAt: paymentDueDate(
            o.paymentCategory as PaymentCategory,
            o.paymentDays,
            o.deliveredAt,
          ),
        }))
        .filter((x) => x.dueAt != null && x.dueAt.getTime() <= horizon);

      if (due.length > 0) {
        // Batch'in onaylı ödeme toplamları: TEK groupBy (per-order aggregate yok).
        const sums = await this.bypass.companyOrderPayment.groupBy({
          by: ["orderId"],
          where: {
            orderId: { in: due.map((x) => x.o.id) },
            status: "CONFIRMED",
          },
          _sum: { amount: true },
        });
        const sumByOrder = new Map(
          sums.map((s) => [
            s.orderId,
            s._sum.amount ?? new Prisma.Decimal(0),
          ]),
        );
        for (const { o, dueAt } of due) {
          const confirmed = sumByOrder.get(o.id) ?? new Prisma.Decimal(0);
          const totalDec = new Prisma.Decimal(o.amount);
          if (this.isFullyPaid(totalDec, confirmed)) continue; // ödenmiş
          // Idempotent claim — yalnız hâlâ damgasız kayıt bildirim atar
          // (overlap/çift-replica güvenli).
          const claimed = await this.bypass.companyOrder.updateMany({
            where: { id: o.id, paymentDueReminderSentAt: null },
            data: { paymentDueReminderSentAt: new Date() },
          });
          if (claimed.count !== 1) continue;
          const remaining = Prisma.Decimal.max(0, totalDec.minus(confirmed));
          const curSym = o.currency && o.currency !== "TRY" ? o.currency : "₺";
          // Bildirim hatası (a) bu siparişin hatırlatmasını kalıcı kaybetmesin
          // (damga geri alınır), (b) taramanın kalanını iptal etmesin
          // (denetim 2026-08-23 Parça 3 #7). `await` korunur — spec'ler
          // sendDuePaymentReminders sonrası bildirimi senkron sayıyor.
          try {
            await this.notifyOrderParty(
              o.id,
              o.buyerCompanyId,
              "Ödeme vadesi yaklaşıyor",
              "Ödeme vadesi yaklaşıyor",
              `${this.orderLabel(o.number)} sipariş için ödeme vadesi ${dueAt!.toLocaleDateString("tr-TR")} — kalan tutar ${remaining.toNumber().toLocaleString("tr-TR")} ${curSym}.`,
              "satinalma",
            );
            sent++;
          } catch (err) {
            await this.bypass.companyOrder
              .updateMany({
                where: { id: o.id },
                data: { paymentDueReminderSentAt: null },
              })
              .catch(() => undefined);
            this.logger.error(
              `Vade hatırlatması gönderilemedi (${o.id}): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
          }
        }
      }
      if (candidates.length < BATCH) break;
    }
    return sent;
  }

  private orderLabel(number: string | null): string {
    return number ? `${number} numaralı` : "İlgili";
  }

  /**
   * Tam-ödeme kapısı. total <= 0 → ödenecek tutar yok = tam ödenmiş sayılır
   * (kalem-bazlı kazandırmada yalnız 0-fiyatlı kalem kazanan teklifçi sıfır
   * tutarlı sipariş doğurabilir; aksi halde bu sipariş hiçbir yoldan COMPLETED
   * olamaz, DELIVERED'da sonsuza kilitlenirdi). Aksi halde 1 kuruş tolerans.
   */
  /**
   * INV-MONEY-1: gönderim öncesi onaylı olması gereken peşin tutar (S3) — DECIMAL.
   * Kural shared'da (`advancePercentFor`); HESAP burada: `total × pct / 100`,
   * ROUND_HALF_UP (Decimal(18,2) kolon hassasiyeti; eski `Math.round` half-up
   * davranışını korur). Peşin şartı yoksa 0.
   */
  private advanceDueDecimal(
    category: PaymentCategory,
    advancePercent: number | null | undefined,
    total: Prisma.Decimal,
  ): Prisma.Decimal {
    const pct = advancePercentFor(category, advancePercent);
    if (pct === null) return new Prisma.Decimal(0);
    return total
      .mul(pct)
      .div(100)
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  }

  private isFullyPaid(
    total: Prisma.Decimal,
    confirmed: Prisma.Decimal,
  ): boolean {
    // INV-MONEY-1: TAM Decimal karşılaştırma, tolerans YOK. Eşitlik GEÇER
    // (confirmed == total → tam ödendi); 1 kuruş eksik GEÇMEZ. total<=0 =
    // ödenecek yok (0-tutarlı sipariş kilitlenmesin).
    return total.lte(0) || confirmed.gte(total);
  }

  /**
   * Onaylı (CONFIRMED) ödeme toplamı — TEK KAYNAK. Peşin eşiği, tamamlama
   * kapıları, oto-tamamlama ve LC ödeme hepsi bunu çağırır (X7: eskiden 4 ayrı
   * inline aggregate vardı → tutarsız birikim). tx-içi çağrılar kilit altında
   * okumak için `client = tx` geçer. NOT: `Number()` coercion bilinçli olarak
   * TEK yerde tutulur (para-float ayrı iş, X1); değişirse buradan düzeltilir.
   */
  private async confirmedPaymentSum(
    orderId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<Prisma.Decimal> {
    const agg = await client.companyOrderPayment.aggregate({
      where: { orderId, status: "CONFIRMED" },
      _sum: { amount: true },
    });
    // INV-MONEY-1: TEK KAYNAK Decimal döner (X7'de "ileride tek noktadan" denen
    // Number() coercion'ı kalktı). Kapılar Decimal karşılaştırır.
    return agg._sum.amount ?? new Prisma.Decimal(0);
  }

  private async orderCurrencySymbol(id: string): Promise<string> {
    const o = await this.prisma.companyOrder.findUnique({
      where: { id },
      select: { currency: true },
    });
    return o?.currency && o.currency !== "TRY" ? o.currency : "₺";
  }

  private async transition(
    user: AuthenticatedCompanyUser,
    id: string,
    rule: {
      side: "seller" | "buyer";
      from: CompanyOrderStatus | CompanyOrderStatus[];
      to: CompanyOrderStatus;
      data?: Prisma.CompanyOrderUpdateInput;
    },
  ) {
    const order = await this.loadParticipant(user, id);
    const isSeller = order.sellerCompanyId === user.companyId;
    const allowed = rule.side === "seller" ? isSeller : !isSeller;
    if (!allowed) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, rule.side);
    const fromList = Array.isArray(rule.from) ? rule.from : [rule.from];
    if (!fromList.includes(order.status)) {
      throw new BadRequestException("Sipariş bu durumda bu işleme uygun değil");
    }
    // ATOMİK geçiş: durum koşulu yazma anında da doğrulanır — eşzamanlı iki
    // aksiyonda (ör. alıcı iptal ederken satıcı kargoya verirse) son yazan
    // iptali ezemez; kaybeden taraf anlaşılır hata alır.
    const res = await this.prisma.companyOrder.updateMany({
      where: { id, status: { in: fromList } },
      data: { status: rule.to, ...(rule.data as Prisma.CompanyOrderUpdateManyMutationInput) },
    });
    if (res.count !== 1) {
      throw new BadRequestException(
        "Sipariş durumu az önce değişti — sayfayı yenileyip tekrar deneyin",
      );
    }
    // WS: iki tarafın sipariş listesi + açık detayları anında güncellensin.
    this.realtime?.pingOrder(id, [
      order.sellerCompanyId,
      order.buyerCompanyId,
    ]);
    return { ok: true, status: rule.to, order };
  }

  /**
   * Kişi-rol kapısı — teklif/kazandırma ile tutarlı: satıcı tarafı aksiyonları
   * SATISCI, alıcı tarafı aksiyonları SATIN_ALMACI rolü ister (firma doğru
   * olsa bile rolsüz kullanıcı sipariş adımı atamaz).
   */
  /**
   * Faz O — sipariş OKUMA kapısı: ONAYLAYICI-only (ve rolsüz) üye siparişi
   * yalnız kaynağı olan ihalenin onayında adımı varsa görür (award onayını
   * veren, doğan siparişi izleyebilir); listing bağı yoksa 404. Mutasyonlar
   * ayrıca assertOrderRole ile kapılı.
   */
  private async assertOrderReadContext(
    user: AuthenticatedCompanyUser,
    listingId: string | null,
  ): Promise<void> {
    const fullRead =
      user.isOwner ||
      user.roles.some((r) =>
        (
          [
            CompanyRole.SAHIP,
            CompanyRole.YONETICI,
            CompanyRole.SATIN_ALMACI,
            CompanyRole.SATISCI,
          ] as CompanyRole[]
        ).includes(r),
      );
    if (fullRead) return;
    if (listingId) {
      const linked = await this.prisma.approvalRequest.findFirst({
        where: {
          listingId,
          companyId: user.companyId,
          steps: { some: { approverUserId: user.userId } },
        },
        select: { id: true },
      });
      if (linked) return;
    }
    throw new NotFoundException("Sipariş bulunamadı");
  }

  private assertOrderRole(
    user: AuthenticatedCompanyUser,
    side: "seller" | "buyer",
  ): void {
    const needed =
      side === "seller" ? CompanyRole.SATISCI : CompanyRole.SATIN_ALMACI;
    // Faz R: SAHIP muafiyeti kaldırıldı — sipariş adımı yalnız taraf-rolüyle.
    if (!user.roles.includes(needed)) {
      throw new ForbiddenException(
        side === "seller"
          ? "Bu işlem için Satışçı rolü gerekir — firma yöneticinizden rol isteyin"
          : "Bu işlem için Satın Almacı rolü gerekir — firma yöneticinizden rol isteyin",
      );
    }
  }

  private async loadParticipant(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.prisma.companyOrder.findUnique({
      where: { id },
      select: {
        id: true,
        number: true,
        status: true,
        amount: true,
        currency: true,
        paymentTiming: true,
        requireGuaranteeLetter: true,
        // Ödeme planı (Faz 2 snapshot) — adım motoru kararlarında kullanılır.
        paymentCategory: true,
        advancePercent: true,
        paymentDays: true,
        // Akreditif adım damgaları (Faz 3).
        lcOpenedAt: true,
        lcAcceptedAt: true,
        lcPaidAt: true,
        deliveredAt: true,
        // Teslim şekli — "gönder" mi "teslime hazırla" mı adım/etiketini belirler.
        deliveryTerm: true,
        listingId: true, // Faz O: okuma-kapısı (approval bağlamı) için
        sellerCompanyId: true,
        buyerCompanyId: true,
        // A1: iptal talebi bağlamı (approve'da cancelReason'a taşınır).
        cancelRequestedAt: true,
        cancelRequestReason: true,
        // TTK 23: ayıp ihbarı bağlamı (ship guard + withdraw restore).
        // (deliveredAt yukarıda zaten seçili.)
        defectNotifiedAt: true,
        disputePrevStatus: true,
      },
    });
    if (
      !order ||
      (order.sellerCompanyId !== user.companyId &&
        order.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    // Faz O — dar-bağlam okuma kapısı (getOne ile simetrik; mutasyonlar ayrıca
    // assertOrderRole ile kapılı, bu yalnız okuma sızıntısını kapatır).
    await this.assertOrderReadContext(user, order.listingId);
    return order;
  }

  // ---- Ödeme kayıtları (alıcı kaydeder, satıcı onaylar/reddeder) ----

  /**
   * Ödeme açık mı?
   *  - BEFORE_DELIVERY: satıcı onayından itibaren (ACCEPTED → COMPLETED);
   *    DELIVERED dahil — tam ödeme onaylanmadan teslim alınmışsa kalan
   *    ödeme burada kaydedilir.
   *  - AFTER_DELIVERY: teslim alındıktan itibaren (DELIVERED, COMPLETED).
   *    COMPLETED defansif olarak dahil (legacy kayıtlar); yeni kuralda sipariş
   *    ancak TAM ödeme onaylıyken tamamlanır → COMPLETED'da kalan olmaz.
   *  Kalan-tutar tavanı (recordPayment) fazla ödemeyi zaten engeller.
   */
  private isPaymentOpen(
    timing: CompanyOrderPaymentTiming,
    status: CompanyOrderStatus,
    category?: PaymentCategory | string | null,
    defectNotifiedAt?: Date | null,
  ): boolean {
    // Akreditifte ödeme banka kanalından akar — alıcının manuel ödeme kaydı
    // ve dekont penceresi KAPALI. Satıcı "Ödeme Bankadan Alındı" adımıyla
    // sistem tam-tutar onaylı kayıt üretir (lcMarkPaid).
    if (category === "LETTER_OF_CREDIT") return false;
    if (timing === "BEFORE_DELIVERY") {
      // A1-DISPUTED (satıcı iptal talebi reddedildi, ayıp ihbarı YOK): satıcının
      // "mal bulundu → sevk" çıkışının ön koşulu peşin eşiğidir; pencere kapalı
      // olsaydı alıcı ödeyemez, sevk hiç açılmaz ve iki-yönlü çıkış (invariants
      // §A1) tek yönlü kalırdı. Ayıp-DISPUTED'ta (TTK-23) KAPALI kalır.
      return (
        status === "ACCEPTED" ||
        status === "IN_DELIVERY" ||
        status === "DELIVERED" ||
        status === "COMPLETED" ||
        (status === "DISPUTED" && !defectNotifiedAt)
      );
    }
    return status === "DELIVERED" || status === "COMPLETED";
  }

  /** A1 ihtilafı (satıcı iptal talebi reddedildi) — ayıp ihbarı DEĞİL. */
  private isA1Dispute(order: {
    status: CompanyOrderStatus;
    defectNotifiedAt: Date | null;
  }): boolean {
    return order.status === "DISPUTED" && !order.defectNotifiedAt;
  }

  /** Alıcı ödeme kaydı oluşturur (AWAITING_CONFIRMATION). */
  async recordPayment(
    user: AuthenticatedCompanyUser,
    id: string,
    input: {
      amount: number;
      method?: string;
      note?: string;
      chequeNo?: string;
      chequeBank?: string;
      chequeDueDate?: string;
    },
  ) {
    const order = await this.loadParticipant(user, id);
    if (order.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Ödemeyi yalnızca alıcı kaydedebilir");
    }
    this.assertOrderRole(user, "buyer");
    if (
      !this.isPaymentOpen(
        order.paymentTiming,
        order.status,
        order.paymentCategory,
        order.defectNotifiedAt,
      )
    ) {
      throw new BadRequestException(
        isLetterOfCredit(order.paymentCategory as PaymentCategory)
          ? "Akreditifli siparişte ödeme banka kanalından yapılır — manuel ödeme kaydı girilmez"
          : "Bu sipariş şu an ödeme kaydına uygun değil",
      );
    }
    if (!(input.amount > 0)) {
      throw new BadRequestException("Tutar 0'dan büyük olmalı");
    }
    // Kalan tutar koruması ATOMİK: sipariş satırını FOR UPDATE ile kilitle →
    // aynı siparişe eşzamanlı ödeme kayıtları serialize olur, AWAITING+CONFIRMED
    // toplamı sipariş tutarını AŞAMAZ (çift-gönderim / yarış fazla-tahsilatı kapatır).
    const isCheque = input.method?.trim() === "Çek";
    const { payment, currency } = await runTenantTx(this.prisma, async (tx) => {
      await tx.$queryRaw`SELECT id FROM company_orders WHERE id = ${id} FOR UPDATE`;
      const [orderAmt, existing] = await Promise.all([
        tx.companyOrder.findUnique({
          where: { id },
          select: { amount: true, currency: true },
        }),
        tx.companyOrderPayment.findMany({
          where: {
            orderId: id,
            status: { in: ["AWAITING_CONFIRMATION", "CONFIRMED"] },
          },
          select: { amount: true, status: true },
        }),
      ]);
      const cap = orderAmt ? new Prisma.Decimal(orderAmt.amount) : new Prisma.Decimal(0);
      // S4: "committed" = AWAITING+CONFIRMED — getOne remaining ile AYNI tek-kaynak
      // reducer. (Sorgu zaten bu iki statüye filtreli; helper tanımı tutarlı kılar.)
      const recorded = sumPaymentsByStatus(existing, [
        "AWAITING_CONFIRMATION",
        "CONFIRMED",
      ]);
      const inputDec = new Prisma.Decimal(input.amount);
      const cur = orderAmt?.currency ?? "TRY";
      // INV-MONEY-1: tam Decimal, tolerans yok — cap'e TAM ulaşma GEÇER,
      // cap'i 1 kuruş aşan REDDEDİLİR (AWAITING+CONFIRMED toplamı cap'i aşamaz).
      if (recorded.plus(inputDec).gt(cap)) {
        const remaining = Prisma.Decimal.max(0, cap.minus(recorded));
        const curSym = cur === "TRY" ? "₺" : cur;
        throw new BadRequestException(
          `Kalan ödeme ${remaining.toNumber().toLocaleString("tr-TR")} ${curSym} — bu tutarı aşan ödeme kaydedilemez`,
        );
      }
      const p = await tx.companyOrderPayment.create({
        data: {
          orderId: id,
          amount: input.amount,
          method: input.method?.trim() || null,
          note: input.note?.trim() || null,
          recordedByCompanyId: user.companyId,
          recordedByUserId: user.userId,
          chequeNo: isCheque ? input.chequeNo?.trim() || null : null,
          chequeBank: isCheque ? input.chequeBank?.trim() || null : null,
          chequeDueDate:
            isCheque && input.chequeDueDate
              ? new Date(input.chequeDueDate)
              : null,
        },
      });
      return { payment: p, currency: cur };
    });
    // Bildirim tutarı siparişin para biriminde (USD siparişte "₺" yazıyordu).
    const curSym = currency === "TRY" ? "₺" : currency;
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Yeni ödeme kaydı — onayınız bekleniyor",
      "Ödeme kaydedildi",
      `${this.orderLabel(order.number)} sipariş için ${input.amount.toLocaleString("tr-TR")} ${curSym} tutarında ödeme kaydedildi. Onaylamanız bekleniyor.`,
      "satis",
    );
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    return this.serializePayment(payment);
  }

  /** Satıcı ödemeyi onaylar: AWAITING_CONFIRMATION → CONFIRMED. */
  confirmPayment(
    user: AuthenticatedCompanyUser,
    id: string,
    paymentId: string,
  ) {
    return this.paymentDecision(user, id, paymentId, "CONFIRMED");
  }

  /** Satıcı ödemeyi reddeder: AWAITING_CONFIRMATION → REJECTED (+ gerekçe). */
  rejectPayment(
    user: AuthenticatedCompanyUser,
    id: string,
    paymentId: string,
    reason?: string,
  ) {
    return this.paymentDecision(user, id, paymentId, "REJECTED", reason);
  }

  private async paymentDecision(
    user: AuthenticatedCompanyUser,
    id: string,
    paymentId: string,
    decision: "CONFIRMED" | "REJECTED",
    reason?: string,
  ) {
    const order = await this.loadParticipant(user, id);
    if (order.sellerCompanyId !== user.companyId) {
      throw new ForbiddenException("Ödemeyi yalnızca satıcı onaylayabilir");
    }
    this.assertOrderRole(user, "seller");
    // Ödeme kaydı ön-kontrolü (temiz 404).
    const payment = await this.prisma.companyOrderPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.orderId !== id) {
      throw new NotFoundException("Ödeme kaydı bulunamadı");
    }

    // Kararı, sipariş satırını FOR UPDATE kilitleyerek UYGULA (cancel ile
    // serileşir → iptal↔onay yarışı kapanır):
    //  - CONFIRMED yalnız iptal/red DIŞINDA (CANCELLED sipariş üstünde onaylı
    //    para oluşmasın; cancel de aynı satırı kilitleyip CONFIRMED sayar).
    //  - REJECTED HER durumda serbest — iptal edilmiş siparişte havale yapıp
    //    asılı kalan AWAITING ödeme reddedilerek sonuçlandırılabilsin.
    await runTenantTx(this.prisma, async (tx) => {
      const rows = await tx.$queryRaw<{ status: CompanyOrderStatus }[]>`
        SELECT "status" FROM "company_orders" WHERE "id" = ${id} FOR UPDATE`;
      const status = rows[0]?.status;
      if (!status) throw new NotFoundException("Sipariş bulunamadı");
      if (
        decision === "CONFIRMED" &&
        (status === "CANCELLED" || status === "REJECTED")
      ) {
        throw new BadRequestException(
          "İptal edilmiş siparişte ödeme onaylanamaz",
        );
      }
      // Atomik CAS: yalnız hâlâ bekleyen ödeme sonuçlanır (çift tık güvenli).
      const res = await tx.companyOrderPayment.updateMany({
        where: { id: paymentId, orderId: id, status: "AWAITING_CONFIRMATION" },
        data: {
          status: decision,
          confirmedAt: decision === "CONFIRMED" ? new Date() : null,
          rejectReason: decision === "REJECTED" ? reason?.trim() || null : null,
        },
      });
      if (res.count !== 1) {
        throw new BadRequestException("Bu ödeme zaten sonuçlanmış");
      }
      // YAŞAM DÖNGÜSÜ AYRIMI: ödeme onayı borcu kapatır ama sipariş DURUMUNU
      // değiştirmez (eski DELIVERED→COMPLETED oto-tamamlama kaldırıldı). Operasyonel
      // tamamlama alıcının `complete()` (kabul) adımıdır; ödeme ayrı izlenir.
    });

    const updated = await this.prisma.companyOrderPayment.findUniqueOrThrow({
      where: { id: paymentId },
    });

    // INV-AUDIT-1: para geçişi (ödeme onay/red) — commit SONRASI, bildirimden
    // önce. actor = kararı veren satıcı; before/after ödeme durumu metadata'da.
    await this.audit.log({
      action:
        decision === "CONFIRMED"
          ? "company.order.payment_confirmed"
          : "company.order.payment_rejected",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_order_payment",
      entityId: paymentId,
      critical: true,
      metadata: {
        orderId: id,
        orderNumber: order.number,
        amount: Number(updated.amount),
        currency: order.currency,
        from: "AWAITING_CONFIRMATION",
        to: decision,
        ...(decision === "REJECTED" ? { reason: reason?.trim() || null } : {}),
      },
    });

    // Ödeme kararı bildirimi alıcıya.
    await this.notifyOrderParty(
      id,
      order.buyerCompanyId,
      decision === "CONFIRMED" ? "Ödemeniz onaylandı" : "Ödemeniz reddedildi",
      decision === "CONFIRMED" ? "Ödeme onaylandı" : "Ödeme reddedildi",
      decision === "CONFIRMED"
        ? `${this.orderLabel(order.number)} sipariş için ödemeniz satıcı tarafından onaylandı.`
        : `${this.orderLabel(order.number)} sipariş için ödemeniz reddedildi.${
            reason ? ` Gerekçe: ${reason}` : ""
          }`,
      "satinalma",
    );

    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    return this.serializePayment(updated);
  }

  private serializePayment(p: {
    id: string;
    amount: { toString(): string };
    method: string | null;
    note: string | null;
    status: string;
    rejectReason: string | null;
    recordedByCompanyId: string;
    confirmedAt: Date | null;
    createdAt: Date;
    chequeNo?: string | null;
    chequeBank?: string | null;
    chequeDueDate?: Date | null;
  }) {
    return {
      id: p.id,
      amount: p.amount.toString(),
      method: p.method,
      note: p.note,
      status: p.status,
      rejectReason: p.rejectReason,
      recordedByCompanyId: p.recordedByCompanyId,
      confirmedAt: p.confirmedAt,
      createdAt: p.createdAt,
      chequeNo: p.chequeNo ?? null,
      chequeBank: p.chequeBank ?? null,
      chequeDueDate: p.chequeDueDate ?? null,
    };
  }

  /**
   * Firmanın siparişleri — hem satıcı hem alıcı olduğu, role etiketli.
   *
   * Liste TAMAMEN client-side işleniyor (OrdersList: KPI/filtre/arama/sıralama/
   * sayfalama hepsi full-set üzerinden). Bu yüzden burada sayfalama YOK; tavan
   * `ORDERS_LIST_CAP` ile büyütüldü (eski 200 tavanı 200+ siparişli firmanın eski
   * kayıtlarına erişimi kesiyordu — latency değil, veri erişilemezliği).
   *
   * Tavan yükselince aşırı-veri-çekme kritik oldu: `select` yalnız serialize()'ın
   * kullandığı alanları çeker (eski include tüm kolonları — JSON adres, IBAN,
   * notlar, lc-damgaları — getiriyordu → 1000 şişkin satır = gereksiz payload).
   *
   * TETİKLEYİCİ (server-side'a geçiş): bir firma ~800 siparişe yaklaşınca veya
   * liste render'ı hissedilir yavaşlayınca OrdersList server-driven'a taşınmalı
   * (filtre/arama/sıralama/KPI/sayaçlar backend'e). Bkz. docs/perf-notes.md.
   */
  async list(companyId: string) {
    const rows = await this.prisma.companyOrder.findMany({
      where: {
        OR: [{ sellerCompanyId: companyId }, { buyerCompanyId: companyId }],
      },
      select: {
        id: true,
        number: true,
        amount: true,
        currency: true,
        status: true,
        sellerCompanyId: true,
        buyerCompanyId: true,
        listingId: true,
        createdAt: true,
        deliveredAt: true,
        deliveryTerm: true,
        paymentCategory: true,
        paymentDays: true,
        advancePercent: true,
        seller: { select: { name: true } },
        buyer: { select: { name: true } },
        listing: { select: { title: true, type: true, number: true } },
      },
      orderBy: { createdAt: "desc" },
      take: ORDERS_LIST_CAP,
    });
    // YAŞAM DÖNGÜSÜ AYRIMI: ödeme durumu türetilir (yeni alan yok). Sayfa
    // siparişleri için TEK groupBy (cron deseni; N+1 yok) → paymentSettled +
    // paymentDueDate. Liste rozeti/KPI status yerine bunu kullanır.
    const ids = rows.map((r) => r.id);
    const sums = ids.length
      ? await this.prisma.companyOrderPayment.groupBy({
          by: ["orderId"],
          where: { orderId: { in: ids }, status: "CONFIRMED" },
          _sum: { amount: true },
        })
      : [];
    const confirmedByOrder = new Map(
      sums.map((s) => [s.orderId, s._sum.amount ?? new Prisma.Decimal(0)]),
    );
    return rows.map((o) => {
      const confirmed =
        confirmedByOrder.get(o.id) ?? new Prisma.Decimal(0);
      const due = paymentDueDate(
        o.paymentCategory as PaymentCategory,
        o.paymentDays,
        o.deliveredAt,
      );
      return {
        ...this.serialize(o, companyId),
        paymentSettled: this.isFullyPaid(new Prisma.Decimal(o.amount), confirmed),
        paymentDueDate: due ? due.toISOString() : null,
      };
    });
  }

  // Karşı taraf özeti — yalnız KURUMSAL iletişim alanları (kişi PII'si değil);
  // sipariş ilişkisindeki taraflar zaten sözleşme muhatabıdır.
  private static readonly COUNTERPARTY_SELECT = {
    name: true,
    city: true,
    industry: true,
    billingEmail: true,
    billingPhone: true,
    rothernId: true,
  } as const;

  async getOne(user: AuthenticatedCompanyUser, id: string) {
    const o = await this.prisma.companyOrder.findUnique({
      where: { id },
      include: {
        seller: { select: CompanyOrdersService.COUNTERPARTY_SELECT },
        buyer: { select: CompanyOrdersService.COUNTERPARTY_SELECT },
        listing: {
          select: { title: true, type: true, number: true },
        },
        items: true,
        payments: { orderBy: { createdAt: "desc" } },
      },
    });
    if (
      !o ||
      (o.sellerCompanyId !== user.companyId &&
        o.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    // Faz O — dar-bağlam okuma kapısı (listing getOne ile simetrik).
    await this.assertOrderReadContext(user, o.listingId);
    const other = o.sellerCompanyId === user.companyId ? o.buyer : o.seller;

    // S3: gösterim toplamları tek-kaynak reducer'dan (eskiden inline döngü
    // confirmedPaymentSum'ı re-derive ediyordu). Gösterim sınırında (.toFixed(2))
    // string'e çevrilir — yanıt şekli değişmez.
    const confirmed = sumPaymentsByStatus(o.payments, ["CONFIRMED"]);
    const pending = sumPaymentsByStatus(o.payments, ["AWAITING_CONFIRMATION"]);
    const total = new Prisma.Decimal(o.amount);
    const remaining = Prisma.Decimal.max(
      0,
      total.minus(confirmed).minus(pending),
    );

    return {
      ...this.serialize(o, user.companyId),
      counterpartyProfile: {
        city: other.city,
        industry: other.industry,
        email: other.billingEmail,
        phone: other.billingPhone,
        rothernId: other.rothernId,
      },
      paymentTiming: o.paymentTiming,
      // İlan sahibinin seçimi (award snapshot'ı) — true ise satıcı onaydan
      // önce teminat mektubu yükler; UI adımı buna göre gösterir.
      requireGuaranteeLetter: o.requireGuaranteeLetter,
      // A1: satıcı iptal talebi durumu — alıcıya onay/red paneli, satıcıya "Geri
      // Çek", DISPUTED rozeti. Açık talep = status ACCEPTED && cancelRequestedAt.
      cancelRequestedAt: o.cancelRequestedAt,
      cancelRequestReason: o.cancelRequestReason,
      cancelRequestById: o.cancelRequestById,
      disputedAt: o.disputedAt,
      // TTK 23: ayıp ihbarı durumu — alıcıya "Ayıp İhbarı" butonu (pencere içinde)
      // + DISPUTED'da geri-çek paneli. Frontend deliveredAt + windowDays ile
      // kalan süreyi hesaplar. defectNotifiedAt dolu → ayıp-DISPUTED (A1 değil).
      defectNotifiedAt: o.defectNotifiedAt,
      defectReason: o.defectReason,
      disputePrevStatus: o.disputePrevStatus,
      defectNoticeWindowDays: DEFECT_NOTICE_WINDOW_DAYS,
      paymentOpen: this.isPaymentOpen(
        o.paymentTiming,
        o.status,
        o.paymentCategory,
        o.defectNotifiedAt,
      ),
      paymentTotals: {
        confirmed: confirmed.toFixed(2),
        pending: pending.toFixed(2),
        // S4/Madde 16: "kalan BİLDİRİLEBİLİR tutar" — bekleyen (onaysız)
        // bildirim de düşülür. "Borç kapandı mı" sinyali DEĞİL; onun için
        // aşağıdaki `paymentSettled` (liste ucuyla aynı helper) kullanılır.
        remaining: remaining.toFixed(2),
      },
      // INV-SM-4: borç kapandı mı — YALNIZ onaylı toplamdan (liste ucuyla
      // birebir aynı). Detay/liste çelişkisini kapatır (Parça 3 #6).
      paymentSettled: this.isFullyPaid(total, confirmed),
      // Gönderim öncesi onaylanması gereken peşin tutar (S3) — UI kilit/eşik
      // mesajı bunu gösterir; 0 = peşin şartı yok.
      advanceDue: this.advanceDueDecimal(
        o.paymentCategory as PaymentCategory,
        o.advancePercent,
        total,
      ).toFixed(2),
      // Vade tarihi (Vadeli/Çek/kısmi-peşin kalanı) — teslim + gün; UI bilgi
      // satırı + vade hatırlatması bunu kullanır.
      paymentDueDate: paymentDueDate(
        o.paymentCategory as PaymentCategory,
        o.paymentDays,
        o.deliveredAt,
      ),
      // Akreditif adım damgaları (Faz 3) — UI LC adım setini bunlarla sürer.
      lcOpenedAt: o.lcOpenedAt,
      lcAcceptedAt: o.lcAcceptedAt,
      lcPaidAt: o.lcPaidAt,
      // Teslimat adresi snapshot'ı (award anında: ALIM→ilan, SATIS→teklif).
      deliveryAddress: o.deliveryAddress as Record<
        string,
        string | null
      > | null,
      // Ödeme planı + teslim şekli — award anındaki SNAPSHOT (ilan silinse de
      // kalır). Teminat tetiği bu değil, order.paymentTiming'dir (yukarıda).
      paymentCategory: o.paymentCategory,
      advancePercent: o.advancePercent,
      paymentDays: o.paymentDays,
      lcType: o.lcType,
      lcConfirmed: o.lcConfirmed,
      paymentNote: o.paymentNote,
      deliveryTerm: o.deliveryTerm,
      // Adım verileri + timeline (eski sistemle birebir).
      acceptedAt: o.acceptedAt,
      acceptedNote: o.acceptedNote,
      bankAccountHolder: o.bankAccountHolder,
      bankIban: o.bankIban,
      expectedDeliveryDate: o.expectedDeliveryDate,
      invoiceNumber: o.invoiceNumber,
      deliveryStartedAt: o.deliveryStartedAt,
      deliveryNote: o.deliveryNote,
      deliveredAt: o.deliveredAt,
      completedAt: o.completedAt,
      completedNote: o.completedNote,
      rejectedAt: o.rejectedAt,
      rejectedReason: o.rejectedReason,
      cancelledAt: o.cancelledAt,
      cancelReason: o.cancelReason,
      payments: o.payments.map((p) => this.serializePayment(p)),
      items: o.items.map((it) => ({
        id: it.id,
        name: it.name,
        quantity: it.quantity.toString(),
        unit: it.unit,
        unitPrice: it.unitPrice.toString(),
        deliveryDate: it.deliveryDate,
        deliveryTime: it.deliveryTime,
        note: it.note,
      })),
    };
  }

  private serialize(
    o: {
      id: string;
      number: string | null;
      amount: { toString(): string };
      currency: string;
      status: string;
      sellerCompanyId: string;
      buyerCompanyId: string;
      listingId: string | null;
      seller: { name: string };
      buyer: { name: string };
      listing: { title: string; type: string; number: string | null } | null;
      createdAt: Date;
      // Liste rozet/adım etiketi teslim şekline göre uyarlanır; ödeme planı
      // liste kartında gösterilebilir (ikisi de include ile geliyor).
      deliveryTerm?: string | null;
      paymentCategory?: string | null;
      paymentDays?: number | null;
      advancePercent?: number | null;
    },
    companyId: string,
  ) {
    const iAmSeller = o.sellerCompanyId === companyId;
    return {
      id: o.id,
      number: o.number,
      amount: o.amount.toString(),
      // Kazandırma anında teklifin biriminden yazılır (legacy backfill → TRY).
      currency: o.currency,
      status: o.status,
      role: iAmSeller ? ("seller" as const) : ("buyer" as const),
      counterparty: iAmSeller ? o.buyer.name : o.seller.name,
      counterpartyCompanyId: iAmSeller ? o.buyerCompanyId : o.sellerCompanyId,
      listingId: o.listingId,
      listingTitle: o.listing?.title ?? null,
      listingType: o.listing?.type ?? null,
      listingNumber: o.listing?.number ?? null,
      createdAt: o.createdAt,
      // Teslim şekli — liste durum etiketini "Gönderildi"/"Teslime Hazır"
      // ayrımı için (sellerShipsGoods). Ödeme planı liste kartı özeti için.
      deliveryTerm: o.deliveryTerm ?? null,
      paymentCategory: o.paymentCategory ?? null,
      paymentDays: o.paymentDays ?? null,
      advancePercent: o.advancePercent ?? null,
    };
  }
}
