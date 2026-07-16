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
  advanceDueAmount,
  DUE_DATE_CATEGORIES,
  isLetterOfCredit,
  paymentDueDate,
  sellerShipsGoods,
  type PaymentCategory,
} from "@rothern/shared";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import type {
  AcceptOrderDto,
  OrderNoteDto,
  ProposeRevisionDto,
  ShipOrderDto,
} from "../dto/order-action.dto";
import { EmailService } from "../../email/email.service";
import {
  NotificationService,
  rolesForPortal,
  type NotificationPortal,
} from "../../notifications/notification.service";
import { RealtimeService } from "../../realtime/realtime.service";

/**
 * Sipariş listesi tavanı — client-side işlenen liste (OrdersList) full-set ister.
 * Eski 200 tavanı 200+ siparişli firmanın eski kayıtlarını erişilemez kılıyordu.
 * ~800'e yaklaşınca liste server-driven'a taşınmalı (bkz. list() JSDoc'u).
 */
const ORDERS_LIST_CAP = 1000;

@Injectable()
export class CompanyOrdersService {
  private readonly logger = new Logger(CompanyOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  private webUrl(): string {
    return this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
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
    // Teminat mektubu, İLAN SAHİBİ İSTEDİYSE zorunlu (opsiyonel özellik —
    // yalnız teslim-öncesi ödemede seçilebilir, sistem orada önerir): parayı
    // önden alan satıcı, teslimatı garanti etmek için onaydan önce teminat
    // yükler. Bayrak award anında ilandan siparişe snapshot'lanır.
    if (src.requireGuaranteeLetter) {
      const teminat = await this.prisma.companyOrderDocument.count({
        where: { orderId: id, type: "TEMINAT" },
      });
      if (teminat === 0) {
        throw new BadRequestException(
          "Bu ilanda teminat mektubu şartı var — siparişi onaylamadan önce Belgeler bölümünden teminat mektubu yükleyin (teslimat garantisi)",
        );
      }
    }
    // Ödeme alabilmek için kayıtlı banka hesabı ZORUNLU — alıcı buraya öder.
    // (Hesabı yalnız Kurucu ekler; satıcı onayda kayıtlı hesaplarından seçer.)
    if (!input.bankAccountId) {
      throw new BadRequestException(
        "Ödeme alabilmek için onayda bir banka hesabı seçmelisiniz — kayıtlı hesabınız yoksa Ayarlar → Banka Hesapları'ndan ekleyin (yalnız Kurucu ekleyebilir)",
      );
    }
    const acct = await this.prisma.companyBankAccount.findUnique({
      where: { id: input.bankAccountId },
      select: { companyId: true, accountHolder: true, iban: true },
    });
    if (!acct || acct.companyId !== user.companyId) {
      throw new BadRequestException("Geçersiz banka hesabı seçimi");
    }
    const bankAccountHolder = acct.accountHolder;
    const bankIban = acct.iban;
    const res = await this.transition(user, id, {
      side: "seller",
      from: "PENDING",
      to: "ACCEPTED",
      data: {
        acceptedAt: new Date(),
        acceptedNote: input.acceptedNote?.trim() || null,
        bankAccountHolder,
        bankIban,
        expectedDeliveryDate: new Date(input.expectedDeliveryDate),
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
        expectedDeliveryDate: input.expectedDeliveryDate,
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
    const advanceDue = advanceDueAmount(
      category,
      order.advancePercent,
      Number(order.amount),
    );
    if (advanceDue > 0) {
      const confirmed = await this.confirmedPaymentSum(id);
      if (confirmed + 0.01 < advanceDue) {
        const curSym = await this.orderCurrencySymbol(id);
        throw new BadRequestException(
          `Bu siparişte peşin ödeme şartı var — gönderim için ${advanceDue.toLocaleString("tr-TR")} ${curSym} peşin tahsilat onaylanmalı (onaylı: ${confirmed.toLocaleString("tr-TR")} ${curSym})`,
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
      from: ["ACCEPTED", "CREATED"],
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
   * Alıcı teslim alır. AFTER_DELIVERY → DELIVERED (ödeme adımı açılır);
   * BEFORE_DELIVERY → tam ödeme ONAYLIYSA doğrudan COMPLETED, değilse
   * DELIVERED (ödeme penceresi açık kalır). Eskiden koşulsuz COMPLETED'a
   * geçiyordu — hiç ödeme kaydı olmadan sipariş "ödeme+teslim tamam" görünür,
   * kalan ödemenin takibi kaybolurdu.
   */
  async receive(user: AuthenticatedCompanyUser, id: string, input: OrderNoteDto) {
    const order = await this.loadParticipant(user, id);
    let toCompleted = false;
    if (order.paymentTiming === "BEFORE_DELIVERY") {
      const [amt, confirmed] = await Promise.all([
        this.prisma.companyOrder.findUnique({
          where: { id },
          select: { amount: true },
        }),
        this.confirmedPaymentSum(id),
      ]);
      const total = amt ? Number(amt.amount) : 0;
      toCompleted = this.isFullyPaid(total, confirmed);
    }
    const res = await this.transition(user, id, {
      side: "buyer",
      from: "IN_DELIVERY",
      to: toCompleted ? "COMPLETED" : "DELIVERED",
      data: toCompleted
        ? {
            deliveredAt: new Date(),
            completedAt: new Date(),
            completedNote: input.note?.trim() || null,
          }
        : { deliveredAt: new Date(), completedNote: input.note?.trim() || null },
    });
    // INV-AUDIT-1: durum geçişi (teslim alındı / oto-tamamlandı) — commit sonrası.
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
        to: toCompleted ? "COMPLETED" : "DELIVERED",
        autoCompleted: toCompleted,
      },
    });
    await this.notifyOrderParty(
      id,
      res.order.sellerCompanyId,
      toCompleted ? "Sipariş tamamlandı" : "Sipariş teslim alındı",
      toCompleted ? "Sipariş tamamlandı" : "Teslim alındı",
      `${this.orderLabel(res.order.number)} siparişi alıcı tarafından teslim alındı${
        toCompleted ? " ve tamamlandı" : ""
      }.`,
      "satis",
    );
    return { ok: res.ok, status: res.status };
  }

  /** Alıcı siparişi tamamlar: DELIVERED → COMPLETED (+ not).
   *  Satıcının ONAYLAMADIĞI ödeme kaydı varken tamamlanamaz — alıcı "ödedim"
   *  deyip satıcı doğrulamadan siparişi kapatamaz (SERVER-side kapı). */
  async complete(user: AuthenticatedCompanyUser, id: string, input: OrderNoteDto) {
    // Yetki + durum ön-kontrolü (transition atomik yineler): yalnız alıcı,
    // yalnız DELIVERED. Yanlış taraf, ödeme değil YETKİ hatası almalı.
    const src = await this.loadParticipant(user, id);
    if (src.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu işlemi yapamazsınız");
    }
    this.assertOrderRole(user, "buyer");
    if (src.status !== "DELIVERED") {
      throw new BadRequestException("Sipariş bu durumda bu işleme uygun değil");
    }
    const pendingPayments = await this.prisma.companyOrderPayment.count({
      where: { orderId: id, status: "AWAITING_CONFIRMATION" },
    });
    if (pendingPayments > 0) {
      throw new BadRequestException(
        "Satıcının onaylamadığı ödeme kaydı var — satıcı ödemeyi onayladıktan (veya reddettikten) sonra siparişi tamamlayabilirsiniz",
      );
    }
    // Ödeme tam olarak ONAYLANMADAN tamamlanamaz: alıcı ödemeyi bildirir,
    // satıcı onaylar, sonra tamamlanır. (receive/auto-complete yollarıyla aynı
    // değişmez; teslim öncesi/sonrası fark etmez — her ikisinde de tam ödeme
    // onaylı olmalı.)
    const [amt, confirmed] = await Promise.all([
      this.prisma.companyOrder.findUnique({
        where: { id },
        select: { amount: true },
      }),
      this.confirmedPaymentSum(id),
    ]);
    const total = amt ? Number(amt.amount) : 0;
    if (!this.isFullyPaid(total, confirmed)) {
      throw new BadRequestException(
        "Sipariş, ödeme tam olarak alınıp onaylanmadan tamamlanamaz — alıcı ödemeyi bildirir, satıcı onayladığında tamamlanır",
      );
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
    await this.prisma.$transaction(async (tx) => {
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

  // ---- Sipariş revizyon müzakeresi (satıcı önerir, alıcı karar verir — Faz 5) ----

  /** Revizyon açılabilir mi? ACCEPTED + ödeme kaydı YOK + LC henüz açılmamış +
   *  açık (PENDING) revizyon yok. Para/enstrüman taahhüt edilmişse revizyon
   *  iade/mutabakat gerektirir → destek kanalına bırakılır. */
  private async assertRevisionAllowed(orderId: string, status: string) {
    if (status !== "ACCEPTED") {
      throw new BadRequestException(
        "Revizyon yalnız onaylanmış, henüz gönderilmemiş siparişte önerilebilir",
      );
    }
    const [payments, order, openRev] = await Promise.all([
      this.prisma.companyOrderPayment.count({
        where: {
          orderId,
          status: { in: ["AWAITING_CONFIRMATION", "CONFIRMED"] },
        },
      }),
      this.prisma.companyOrder.findUnique({
        where: { id: orderId },
        select: { paymentCategory: true, lcOpenedAt: true },
      }),
      this.prisma.orderRevision.count({
        where: { orderId, status: "PENDING" },
      }),
    ]);
    if (payments > 0) {
      throw new BadRequestException(
        "Ödeme kaydı bulunan siparişte revizyon için destek ekibiyle iletişime geçin",
      );
    }
    if (
      order?.paymentCategory === "LETTER_OF_CREDIT" &&
      order.lcOpenedAt
    ) {
      throw new BadRequestException(
        "Akreditif açıldıktan sonra revizyon önerilemez — akreditif belirli bir tutar için açılmıştır",
      );
    }
    if (openRev > 0) {
      throw new BadRequestException(
        "Bu siparişte alıcı kararı bekleyen bir revizyon zaten var",
      );
    }
  }

  /** Satıcı revizyon önerir: yeni kalemler + opsiyonel teslim tarihi/not. */
  async proposeRevision(
    user: AuthenticatedCompanyUser,
    id: string,
    input: ProposeRevisionDto,
  ) {
    const order = await this.loadParticipant(user, id);
    if (order.sellerCompanyId !== user.companyId) {
      throw new ForbiddenException("Revizyonu yalnızca satıcı önerebilir");
    }
    this.assertOrderRole(user, "seller");
    await this.assertRevisionAllowed(id, order.status);

    // Tutar kalemlerden hesaplanır (order-level tutar düzenlenmez → tutarsızlık
    // olmaz). Para birimi siparişinkiyle aynı (revizyon birim değiştirmez).
    const amount = input.items.reduce(
      (sum, it) => sum.plus(new Prisma.Decimal(it.unitPrice).mul(it.quantity)),
      new Prisma.Decimal(0),
    );
    const rev = await this.prisma.orderRevision.create({
      data: {
        orderId: id,
        proposedByCompanyId: user.companyId,
        proposedByUserId: user.userId,
        status: "PENDING",
        amount,
        currency: order.currency,
        expectedDeliveryDate: input.expectedDeliveryDate
          ? new Date(input.expectedDeliveryDate)
          : null,
        note: input.note?.trim() || null,
        items: {
          create: input.items.map((it) => ({
            name: it.name.trim(),
            quantity: it.quantity,
            unit: it.unit.trim(),
            unitPrice: it.unitPrice,
            deliveryDate: it.deliveryDate ? new Date(it.deliveryDate) : null,
            note: it.note?.trim() || null,
          })),
        },
      },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.buyerCompanyId,
      "Sipariş revizyonu önerildi — onayınız bekleniyor",
      "Revizyon önerildi",
      `${this.orderLabel(order.number)} sipariş için satıcı bir revizyon önerdi. İnceleyip onaylayın ya da reddedin.`,
      "satinalma",
    );
    return { ok: true, revisionId: rev.id };
  }

  /** Alıcı revizyonu onaylar: kalemler değişir, tutar/teslim tarihi güncellenir. */
  async approveRevision(
    user: AuthenticatedCompanyUser,
    id: string,
    revisionId: string,
  ) {
    const order = await this.loadParticipant(user, id);
    if (order.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Revizyonu yalnızca alıcı onaylayabilir");
    }
    this.assertOrderRole(user, "buyer");

    await this.prisma.$transaction(async (tx) => {
      // Sipariş satırını kilitle — eşzamanlı geçiş/ödeme ile serileşir.
      const rows = await tx.$queryRaw<{ status: CompanyOrderStatus }[]>`
        SELECT "status" FROM "company_orders" WHERE "id" = ${id} FOR UPDATE`;
      const status = rows[0]?.status;
      if (status !== "ACCEPTED") {
        throw new BadRequestException(
          "Sipariş revizyon onayına uygun değil (durumu değişmiş olabilir)",
        );
      }
      // Onay anında ödeme oluştuysa (yarış) revizyon uygulanmaz.
      const payments = await tx.companyOrderPayment.count({
        where: {
          orderId: id,
          status: { in: ["AWAITING_CONFIRMATION", "CONFIRMED"] },
        },
      });
      if (payments > 0) {
        throw new BadRequestException(
          "Bu siparişte ödeme kaydı oluştu — revizyon uygulanamaz",
        );
      }
      const rev = await tx.orderRevision.findUnique({
        where: { id: revisionId },
        include: { items: true },
      });
      if (!rev || rev.orderId !== id) {
        throw new NotFoundException("Revizyon bulunamadı");
      }
      if (rev.status !== "PENDING") {
        throw new BadRequestException("Bu revizyon zaten sonuçlanmış");
      }
      // Sipariş kalemlerini revizyon kalemleriyle DEĞİŞTİR (sil + oluştur).
      await tx.companyOrderItem.deleteMany({ where: { orderId: id } });
      await tx.companyOrderItem.createMany({
        data: rev.items.map((it) => ({
          orderId: id,
          name: it.name,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: it.unitPrice,
          deliveryDate: it.deliveryDate,
          note: it.note,
        })),
      });
      await tx.companyOrder.update({
        where: { id },
        data: {
          amount: rev.amount,
          ...(rev.expectedDeliveryDate
            ? { expectedDeliveryDate: rev.expectedDeliveryDate }
            : {}),
        },
      });
      await tx.orderRevision.update({
        where: { id: revisionId },
        data: {
          status: "APPROVED",
          decidedByUserId: user.userId,
          decidedAt: new Date(),
        },
      });
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Revizyon onaylandı",
      "Revizyon onaylandı",
      `${this.orderLabel(order.number)} sipariş için önerdiğiniz revizyon alıcı tarafından onaylandı ve uygulandı.`,
      "satis",
    );
    return { ok: true };
  }

  /** Alıcı revizyonu reddeder (gerekçeli) — sipariş değişmez. */
  async rejectRevision(
    user: AuthenticatedCompanyUser,
    id: string,
    revisionId: string,
    reason?: string,
  ) {
    const order = await this.loadParticipant(user, id);
    if (order.buyerCompanyId !== user.companyId) {
      throw new ForbiddenException("Revizyonu yalnızca alıcı reddedebilir");
    }
    this.assertOrderRole(user, "buyer");
    if ((reason?.trim().length ?? 0) < 10) {
      throw new BadRequestException("Ret gerekçesi en az 10 karakter olmalı");
    }
    const res = await this.prisma.orderRevision.updateMany({
      where: { id: revisionId, orderId: id, status: "PENDING" },
      data: {
        status: "REJECTED",
        rejectReason: reason!.trim(),
        decidedByUserId: user.userId,
        decidedAt: new Date(),
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException("Revizyon bulunamadı veya zaten sonuçlanmış");
    }
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Revizyon reddedildi",
      "Revizyon reddedildi",
      `${this.orderLabel(order.number)} sipariş için önerdiğiniz revizyon reddedildi.${
        reason ? ` Gerekçe: ${reason}` : ""
      }`,
      "satis",
    );
    return { ok: true };
  }

  /** Satıcı önerdiği revizyonu karar öncesi geri çeker. */
  async cancelRevision(
    user: AuthenticatedCompanyUser,
    id: string,
    revisionId: string,
  ) {
    const order = await this.loadParticipant(user, id);
    if (order.sellerCompanyId !== user.companyId) {
      throw new ForbiddenException("Revizyonu yalnızca satıcı geri çekebilir");
    }
    this.assertOrderRole(user, "seller");
    const res = await this.prisma.orderRevision.updateMany({
      where: { id: revisionId, orderId: id, status: "PENDING" },
      data: { status: "CANCELLED", decidedAt: new Date() },
    });
    if (res.count !== 1) {
      throw new BadRequestException("Revizyon bulunamadı veya zaten sonuçlanmış");
    }
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.buyerCompanyId,
      "Revizyon geri çekildi",
      "Revizyon geri çekildi",
      `${this.orderLabel(order.number)} sipariş için önerilen revizyon satıcı tarafından geri çekildi.`,
      "satinalma",
    );
    return { ok: true };
  }

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

  /** Alıcı: "Akreditif Açıldı" — LC belgesi yüklenmiş olmalı; ACCEPTED evresi. */
  async lcMarkOpened(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.loadParticipant(user, id);
    this.assertLcOrder(order, user, "buyer");
    if (order.status !== "ACCEPTED") {
      throw new BadRequestException("Sipariş bu durumda bu işleme uygun değil");
    }
    if (order.lcOpenedAt) {
      throw new BadRequestException("Akreditif zaten açıldı olarak işaretlendi");
    }
    // Akreditif belgesi (küşat mektubu) yüklenmeden "açıldı" denemez.
    const lcDoc = await this.prisma.companyOrderDocument.count({
      where: { orderId: id, type: "LC" },
    });
    if (lcDoc === 0) {
      throw new BadRequestException(
        "Akreditif belgesini (küşat mektubu) Belgeler bölümünden yüklemeden 'Akreditif Açıldı' işaretlenemez",
      );
    }
    await this.prisma.companyOrder.update({
      where: { id },
      data: { lcOpenedAt: new Date() },
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Akreditif açıldı — kabulünüz bekleniyor",
      "Akreditif açıldı",
      `${this.orderLabel(order.number)} sipariş için alıcı akreditifi açtı. Belgeyi inceleyip 'Akreditifi Kabul Ettim' adımını tamamlayın.`,
      "satis",
    );
    return { ok: true };
  }

  /** Satıcı: "Akreditifi Kabul Ettim" — açılmış olmalı; gönderim kilidini açar. */
  async lcMarkAccepted(user: AuthenticatedCompanyUser, id: string) {
    const order = await this.loadParticipant(user, id);
    this.assertLcOrder(order, user, "seller");
    if (order.status !== "ACCEPTED") {
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
    if (order.status !== "IN_DELIVERY" && order.status !== "DELIVERED") {
      throw new BadRequestException(
        "Ödeme, sipariş gönderildikten sonra işaretlenebilir",
      );
    }
    if (order.lcPaidAt) {
      throw new BadRequestException("Ödeme zaten alındı olarak işaretlendi");
    }
    const autoCompleted = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        { status: CompanyOrderStatus; amount: Prisma.Decimal }[]
      >`SELECT "status","amount" FROM "company_orders" WHERE "id" = ${id} FOR UPDATE`;
      const row = rows[0];
      if (!row) throw new NotFoundException("Sipariş bulunamadı");
      if (row.status !== "IN_DELIVERY" && row.status !== "DELIVERED") {
        throw new BadRequestException(
          "Sipariş durumu az önce değişti — sayfayı yenileyip tekrar deneyin",
        );
      }
      const total = Number(row.amount);
      const confirmed = await tx.companyOrderPayment
        .aggregate({
          where: { orderId: id, status: "CONFIRMED" },
          _sum: { amount: true },
        })
        .then((a) => (a._sum.amount ? Number(a._sum.amount) : 0));
      const remaining = Math.max(0, total - confirmed);
      // Kalan > 0 ise onaylı tam-tutar kaydı üret (idempotent lcPaidAt damgası
      // çift-tıkı zaten engeller; remaining=0 ise yalnız damga).
      if (remaining > 0) {
        await tx.companyOrderPayment.create({
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
      }
      await tx.companyOrder.update({
        where: { id },
        data: { lcPaidAt: new Date() },
      });
      // DELIVERED ise tam ödeme sağlandı → tamamla (IN_DELIVERY'de teslim
      // alınınca receive() aynı kapıdan COMPLETED'a geçirir).
      if (row.status === "DELIVERED") {
        const done = await tx.companyOrder.updateMany({
          where: { id, status: "DELIVERED" },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        return done.count === 1;
      }
      return false;
    });
    this.realtime?.pingOrder(id, [order.sellerCompanyId, order.buyerCompanyId]);
    await this.notifyOrderParty(
      id,
      order.buyerCompanyId,
      "Akreditif ödemesi alındı",
      "Ödeme alındı",
      `${this.orderLabel(order.number)} sipariş için akreditif ödemesi banka kanalından alındı${
        autoCompleted ? " ve sipariş tamamlandı" : ""
      }.`,
      "satinalma",
    );
    return { ok: true, completed: autoCompleted };
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
      const candidates = await this.prisma.companyOrder.findMany({
        where: {
          status: "DELIVERED",
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
        const sums = await this.prisma.companyOrderPayment.groupBy({
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
            s._sum.amount ? Number(s._sum.amount) : 0,
          ]),
        );
        for (const { o, dueAt } of due) {
          const confirmed = sumByOrder.get(o.id) ?? 0;
          if (this.isFullyPaid(Number(o.amount), confirmed)) continue; // ödenmiş
          // Idempotent claim — yalnız hâlâ damgasız kayıt bildirim atar
          // (overlap/çift-replica güvenli).
          const claimed = await this.prisma.companyOrder.updateMany({
            where: { id: o.id, paymentDueReminderSentAt: null },
            data: { paymentDueReminderSentAt: new Date() },
          });
          if (claimed.count !== 1) continue;
          const remaining = Math.max(0, Number(o.amount) - confirmed);
          const curSym = o.currency && o.currency !== "TRY" ? o.currency : "₺";
          await this.notifyOrderParty(
            o.id,
            o.buyerCompanyId,
            "Ödeme vadesi yaklaşıyor",
            "Ödeme vadesi yaklaşıyor",
            `${this.orderLabel(o.number)} sipariş için ödeme vadesi ${dueAt!.toLocaleDateString("tr-TR")} — kalan tutar ${remaining.toLocaleString("tr-TR")} ${curSym}.`,
            "satinalma",
          );
          sent++;
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
  private isFullyPaid(total: number, confirmed: number): boolean {
    return total <= 0 || confirmed + 0.01 >= total;
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
  ): Promise<number> {
    const agg = await client.companyOrderPayment.aggregate({
      where: { orderId, status: "CONFIRMED" },
      _sum: { amount: true },
    });
    return agg._sum.amount ? Number(agg._sum.amount) : 0;
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
  private assertOrderRole(
    user: AuthenticatedCompanyUser,
    side: "seller" | "buyer",
  ): void {
    const needed =
      side === "seller" ? CompanyRole.SATISCI : CompanyRole.SATIN_ALMACI;
    // Kurucu (SAHIP) tam yetkilidir — her iki taraftaki sipariş adımını atabilir.
    if (
      !user.roles.includes(CompanyRole.SAHIP) &&
      !user.roles.includes(needed)
    ) {
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
        sellerCompanyId: true,
        buyerCompanyId: true,
      },
    });
    if (
      !order ||
      (order.sellerCompanyId !== user.companyId &&
        order.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
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
  ): boolean {
    // Akreditifte ödeme banka kanalından akar — alıcının manuel ödeme kaydı
    // ve dekont penceresi KAPALI. Satıcı "Ödeme Bankadan Alındı" adımıyla
    // sistem tam-tutar onaylı kayıt üretir (lcMarkPaid).
    if (category === "LETTER_OF_CREDIT") return false;
    if (timing === "BEFORE_DELIVERY") {
      return (
        status === "ACCEPTED" ||
        status === "IN_DELIVERY" ||
        status === "DELIVERED" ||
        status === "COMPLETED"
      );
    }
    return status === "DELIVERED" || status === "COMPLETED";
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
    const { payment, currency } = await this.prisma.$transaction(async (tx) => {
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
          select: { amount: true },
        }),
      ]);
      const cap = orderAmt ? Number(orderAmt.amount) : 0;
      const recorded = existing.reduce((s, p) => s + Number(p.amount), 0);
      const cur = orderAmt?.currency ?? "TRY";
      if (recorded + input.amount > cap + 0.01) {
        const remaining = Math.max(0, cap - recorded);
        const curSym = cur === "TRY" ? "₺" : cur;
        throw new BadRequestException(
          `Kalan ödeme ${remaining.toLocaleString("tr-TR")} ${curSym} — bu tutarı aşan ödeme kaydedilemez`,
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
    const autoCompleted = await this.prisma.$transaction(async (tx) => {
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
      // Otomatik tamamlama — kilit altında taze durum + toplam ile.
      if (decision === "CONFIRMED" && status === "DELIVERED") {
        const [orderAmt, confirmedSum] = await Promise.all([
          tx.companyOrder.findUnique({ where: { id }, select: { amount: true } }),
          this.confirmedPaymentSum(id, tx),
        ]);
        const total = orderAmt ? Number(orderAmt.amount) : 0;
        if (this.isFullyPaid(total, confirmedSum)) {
          const done = await tx.companyOrder.updateMany({
            where: { id, status: "DELIVERED" },
            data: { status: "COMPLETED", completedAt: new Date() },
          });
          return done.count === 1;
        }
      }
      return false;
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
        autoCompleted,
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

    // Otomatik tamamlandıysa → SATICIYA bilgi (alıcı zaten onay bildirimini aldı).
    if (autoCompleted) {
      await this.notifyOrderParty(
        id,
        order.sellerCompanyId,
        "Sipariş tamamlandı",
        "Sipariş tamamlandı",
        `${this.orderLabel(order.number)} sipariş tam ödeme ile tamamlandı.`,
        "satis",
      );
    }

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
    return rows.map((o) => this.serialize(o, companyId));
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
        revisions: {
          orderBy: { createdAt: "desc" },
          include: { items: true },
        },
      },
    });
    if (
      !o ||
      (o.sellerCompanyId !== user.companyId &&
        o.buyerCompanyId !== user.companyId)
    ) {
      throw new NotFoundException("Sipariş bulunamadı");
    }
    const other = o.sellerCompanyId === user.companyId ? o.buyer : o.seller;

    let confirmed = 0;
    let pending = 0;
    for (const p of o.payments) {
      const amt = Number(p.amount);
      if (p.status === "CONFIRMED") confirmed += amt;
      else if (p.status === "AWAITING_CONFIRMATION") pending += amt;
    }
    const total = Number(o.amount);
    const remaining = Math.max(0, total - confirmed - pending);

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
      paymentOpen: this.isPaymentOpen(
        o.paymentTiming,
        o.status,
        o.paymentCategory,
      ),
      paymentTotals: {
        confirmed: confirmed.toFixed(2),
        pending: pending.toFixed(2),
        remaining: remaining.toFixed(2),
      },
      // Gönderim öncesi onaylanması gereken peşin tutar (S3) — UI kilit/eşik
      // mesajı bunu gösterir; 0 = peşin şartı yok.
      advanceDue: advanceDueAmount(
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
        note: it.note,
      })),
      // Revizyon müzakere geçmişi (en yeni önce) — UI öneri/karar akışı bunu sürer.
      revisions: o.revisions.map((r) => ({
        id: r.id,
        status: r.status,
        proposedByCompanyId: r.proposedByCompanyId,
        amount: r.amount.toString(),
        currency: r.currency,
        expectedDeliveryDate: r.expectedDeliveryDate,
        note: r.note,
        rejectReason: r.rejectReason,
        decidedAt: r.decidedAt,
        createdAt: r.createdAt,
        items: r.items.map((it) => ({
          id: it.id,
          name: it.name,
          quantity: it.quantity.toString(),
          unit: it.unit,
          unitPrice: it.unitPrice.toString(),
          deliveryDate: it.deliveryDate,
          note: it.note,
        })),
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
