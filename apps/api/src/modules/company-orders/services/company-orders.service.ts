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
} from "@supkeys/db";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import type {
  AcceptOrderDto,
  OrderNoteDto,
  ShipOrderDto,
} from "../dto/order-action.dto";
import { EmailService } from "../../email/email.service";
import { NotificationService } from "../../notifications/notification.service";
import { RealtimeService } from "../../realtime/realtime.service";

@Injectable()
export class CompanyOrdersService {
  private readonly logger = new Logger(CompanyOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly notifications: NotificationService,
    @Optional() private readonly realtime?: RealtimeService,
  ) {}

  private webUrl(): string {
    return this.config.get<string>("WEB_URL") ?? "http://localhost:3000";
  }

  private async companyRecipient(
    companyId: string,
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
      where: { companyId, isActive: true, deletedAt: null },
      orderBy: { createdAt: "asc" },
      select: { email: true, firstName: true, lastName: true },
    });
    if (!user) return null;
    return { email: user.email, name: `${user.firstName} ${user.lastName}` };
  }

  /** Sipariş durumu değişince karşı tarafa bildirim (fire-and-forget). */
  private async notifyOrderParty(
    orderId: string,
    recipientCompanyId: string,
    subject: string,
    heading: string,
    paragraph: string,
  ): Promise<void> {
    const ctaUrl = `${this.webUrl()}/company/siparis/${orderId}`;
    // In-app kanal (order_status_changed transactional → her zaman gider).
    await this.notifications.pushToCompany(recipientCompanyId, {
      type: "order_status_changed",
      title: heading,
      body: paragraph,
      ctaLabel: "Siparişi Gör",
      ctaUrl,
    });
    const to = await this.companyRecipient(recipientCompanyId);
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
    // Peşin (CASH) işte teminat mektubu ZORUNLU: parayı önden alan satıcı,
    // onaydan önce teslimat garantisi yükler (ilan wizard'ındaki taahhüt).
    const src = await this.prisma.companyOrder.findUnique({
      where: { id },
      select: { listing: { select: { paymentTerm: true } } },
    });
    if (src?.listing?.paymentTerm === "CASH") {
      const teminat = await this.prisma.companyOrderDocument.count({
        where: { orderId: id, type: "TEMINAT" },
      });
      if (teminat === 0) {
        throw new BadRequestException(
          "Bu iş peşin (nakit) — siparişi onaylamadan önce Belgeler bölümünden teminat mektubu yükleyin",
        );
      }
    }
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
        expectedDeliveryDate: new Date(input.expectedDeliveryDate),
      },
    });
    await this.notifyOrderParty(
      id,
      res.order.buyerCompanyId,
      "Siparişiniz onaylandı",
      "Sipariş onaylandı",
      `${this.orderLabel(res.order.number)} siparişiniz satıcı tarafından onaylandı ve hazırlanıyor.`,
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
    await this.notifyOrderParty(
      id,
      res.order.buyerCompanyId,
      "Siparişiniz reddedildi",
      "Sipariş reddedildi",
      `${this.orderLabel(res.order.number)} siparişiniz satıcı tarafından reddedildi.${
        reason ? ` Gerekçe: ${reason}` : ""
      }`,
    );
    return { ok: res.ok, status: res.status };
  }

  /** Satıcı kargoya verir: ACCEPTED → IN_DELIVERY (+ fatura no zorunlu).
   *  Alıcının bekleyen ödeme kaydı varken kargoya verilemez — satıcı önce
   *  ödemeyi onaylamalı ya da reddetmeli (alıcı tamamlama kapısının simetriği). */
  async ship(user: AuthenticatedCompanyUser, id: string, input: ShipOrderDto) {
    const pendingPayments = await this.prisma.companyOrderPayment.count({
      where: { orderId: id, status: "AWAITING_CONFIRMATION" },
    });
    if (pendingPayments > 0) {
      throw new BadRequestException(
        "Alıcının onay bekleyen ödeme kaydı var — kargoya vermeden önce Ödemeler bölümünden onaylayın veya reddedin",
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
    await this.notifyOrderParty(
      id,
      res.order.buyerCompanyId,
      "Siparişiniz kargoya verildi",
      "Sipariş yolda",
      `${this.orderLabel(res.order.number)} siparişiniz kargoya verildi (Fatura no: ${input.invoiceNumber.trim()}).`,
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
      const [amt, agg] = await Promise.all([
        this.prisma.companyOrder.findUnique({
          where: { id },
          select: { amount: true },
        }),
        this.prisma.companyOrderPayment.aggregate({
          where: { orderId: id, status: "CONFIRMED" },
          _sum: { amount: true },
        }),
      ]);
      const total = amt ? Number(amt.amount) : 0;
      const confirmed = agg._sum.amount ? Number(agg._sum.amount) : 0;
      toCompleted = total > 0 && confirmed + 0.01 >= total;
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
    await this.notifyOrderParty(
      id,
      res.order.sellerCompanyId,
      toCompleted ? "Sipariş tamamlandı" : "Sipariş teslim alındı",
      toCompleted ? "Sipariş tamamlandı" : "Teslim alındı",
      `${this.orderLabel(res.order.number)} siparişi alıcı tarafından teslim alındı${
        toCompleted ? " ve tamamlandı" : ""
      }.`,
    );
    return { ok: res.ok, status: res.status };
  }

  /** Alıcı siparişi tamamlar: DELIVERED → COMPLETED (+ not).
   *  Satıcının ONAYLAMADIĞI ödeme kaydı varken tamamlanamaz — alıcı "ödedim"
   *  deyip satıcı doğrulamadan siparişi kapatamaz (SERVER-side kapı). */
  async complete(user: AuthenticatedCompanyUser, id: string, input: OrderNoteDto) {
    const pendingPayments = await this.prisma.companyOrderPayment.count({
      where: { orderId: id, status: "AWAITING_CONFIRMATION" },
    });
    if (pendingPayments > 0) {
      throw new BadRequestException(
        "Satıcının onaylamadığı ödeme kaydı var — satıcı ödemeyi onayladıktan (veya reddettikten) sonra siparişi tamamlayabilirsiniz",
      );
    }
    const res = await this.transition(user, id, {
      side: "buyer",
      from: "DELIVERED",
      to: "COMPLETED",
      data: { completedAt: new Date(), completedNote: input.note?.trim() || null },
    });
    await this.notifyOrderParty(
      id,
      res.order.sellerCompanyId,
      "Sipariş tamamlandı",
      "Sipariş tamamlandı",
      `${this.orderLabel(res.order.number)} siparişi tamamlandı.`,
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
    const res = await this.transition(user, id, {
      side: "buyer",
      from: ["PENDING", "ACCEPTED", "CREATED"],
      to: "CANCELLED",
      data: { cancelReason: reason!.trim(), cancelledAt: new Date() },
    });
    await this.notifyOrderParty(
      id,
      res.order.sellerCompanyId,
      "Sipariş iptal edildi",
      "Sipariş iptal edildi",
      `${this.orderLabel(res.order.number)} siparişi alıcı tarafından iptal edildi.${
        reason ? ` Gerekçe: ${reason}` : ""
      }`,
    );
    return { ok: res.ok, status: res.status };
  }

  private orderLabel(number: string | null): string {
    return number ? `${number} numaralı` : "İlgili";
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
        paymentTiming: true,
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
   *  - AFTER_DELIVERY: teslim alındıktan itibaren (DELIVERED, COMPLETED) —
   *    COMPLETED dahil: kısmi ödemeyle tamamlanan siparişin kalanı sonradan
   *    kaydedilebilsin (eskiden pencere kapanıyor, bakiye takipsiz kalıyordu).
   *  Kalan-tutar tavanı (recordPayment) fazla ödemeyi zaten engeller.
   */
  private isPaymentOpen(
    timing: CompanyOrderPaymentTiming,
    status: CompanyOrderStatus,
  ): boolean {
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
    if (!this.isPaymentOpen(order.paymentTiming, order.status)) {
      throw new BadRequestException(
        "Bu sipariş şu an ödeme kaydına uygun değil",
      );
    }
    if (!(input.amount > 0)) {
      throw new BadRequestException("Tutar 0'dan büyük olmalı");
    }
    // Kalan tutar koruması — AWAITING + CONFIRMED toplamı sipariş tutarını aşamaz.
    const [orderAmt, existing] = await Promise.all([
      this.prisma.companyOrder.findUnique({
        where: { id },
        select: { amount: true, currency: true },
      }),
      this.prisma.companyOrderPayment.findMany({
        where: {
          orderId: id,
          status: { in: ["AWAITING_CONFIRMATION", "CONFIRMED"] },
        },
        select: { amount: true },
      }),
    ]);
    const cap = orderAmt ? Number(orderAmt.amount) : 0;
    const recorded = existing.reduce((s, p) => s + Number(p.amount), 0);
    if (recorded + input.amount > cap + 0.01) {
      const remaining = Math.max(0, cap - recorded);
      // Sembol siparişin para birimine göre — USD siparişte "₺" yazıyordu.
      const cur = orderAmt?.currency ?? "TRY";
      const curSym = cur === "TRY" ? "₺" : cur;
      throw new BadRequestException(
        `Kalan ödeme ${remaining.toLocaleString("tr-TR")} ${curSym} — bu tutarı aşan ödeme kaydedilemez`,
      );
    }
    const isCheque = input.method?.trim() === "Çek";
    const payment = await this.prisma.companyOrderPayment.create({
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
    await this.notifyOrderParty(
      id,
      order.sellerCompanyId,
      "Yeni ödeme kaydı — onayınız bekleniyor",
      "Ödeme kaydedildi",
      `${this.orderLabel(order.number)} sipariş için ${input.amount.toLocaleString("tr-TR")} ₺ tutarında ödeme kaydedildi. Onaylamanız bekleniyor.`,
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
    const payment = await this.prisma.companyOrderPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment || payment.orderId !== id) {
      throw new NotFoundException("Ödeme kaydı bulunamadı");
    }
    if (payment.status !== "AWAITING_CONFIRMATION") {
      throw new BadRequestException("Bu ödeme zaten sonuçlanmış");
    }
    // Atomik karar: çift tık / eşzamanlı onay+red yarışında ikinci yazma
    // ilkini ezemez (yalnız hâlâ bekleyense sonuçlanır).
    const res = await this.prisma.companyOrderPayment.updateMany({
      where: { id: paymentId, status: "AWAITING_CONFIRMATION" },
      data: {
        status: decision,
        confirmedAt: decision === "CONFIRMED" ? new Date() : null,
        rejectReason: decision === "REJECTED" ? reason?.trim() || null : null,
      },
    });
    if (res.count !== 1) {
      throw new BadRequestException("Bu ödeme zaten sonuçlanmış");
    }
    const updated = await this.prisma.companyOrderPayment.findUniqueOrThrow({
      where: { id: paymentId },
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
    );

    // Otomatik tamamlama (eski sistemle aynı): sipariş teslim alındı (DELIVERED)
    // ve onaylı ödemeler toplamı sipariş tutarına ulaştıysa → COMPLETED.
    if (decision === "CONFIRMED" && order.status === "DELIVERED") {
      const [orderAmt, agg] = await Promise.all([
        this.prisma.companyOrder.findUnique({
          where: { id },
          select: { amount: true },
        }),
        this.prisma.companyOrderPayment.aggregate({
          where: { orderId: id, status: "CONFIRMED" },
          _sum: { amount: true },
        }),
      ]);
      const total = orderAmt ? Number(orderAmt.amount) : 0;
      const confirmedSum = agg._sum.amount ? Number(agg._sum.amount) : 0;
      if (total > 0 && confirmedSum + 0.01 >= total) {
        // Atomik: alıcı aynı anda complete ettiyse ezme; damga eksik kalmasın.
        await this.prisma.companyOrder.updateMany({
          where: { id, status: "DELIVERED" },
          data: { status: "COMPLETED", completedAt: new Date() },
        });
        // Tam ödeme ile otomatik tamamlandı → her iki tarafa bilgi.
        await this.notifyOrderParty(
          id,
          order.buyerCompanyId,
          "Sipariş tamamlandı",
          "Sipariş tamamlandı",
          `${this.orderLabel(order.number)} sipariş tam ödeme ile tamamlandı.`,
        );
      }
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

  /** Firmanın siparişleri — hem satıcı hem alıcı olduğu, role etiketli. */
  async list(companyId: string) {
    const rows = await this.prisma.companyOrder.findMany({
      where: {
        OR: [{ sellerCompanyId: companyId }, { buyerCompanyId: companyId }],
      },
      include: {
        seller: { select: { name: true } },
        buyer: { select: { name: true } },
        listing: { select: { title: true, type: true, number: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
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
    supkeysId: true,
  } as const;

  async getOne(user: AuthenticatedCompanyUser, id: string) {
    const o = await this.prisma.companyOrder.findUnique({
      where: { id },
      include: {
        seller: { select: CompanyOrdersService.COUNTERPARTY_SELECT },
        buyer: { select: CompanyOrdersService.COUNTERPARTY_SELECT },
        listing: {
          select: { title: true, type: true, number: true, paymentTerm: true },
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
        supkeysId: other.supkeysId,
      },
      paymentTiming: o.paymentTiming,
      paymentOpen: this.isPaymentOpen(o.paymentTiming, o.status),
      paymentTotals: {
        confirmed: confirmed.toFixed(2),
        pending: pending.toFixed(2),
        remaining: remaining.toFixed(2),
      },
      // Teslimat adresi snapshot'ı (award anında: ALIM→ilan, SATIS→teklif).
      deliveryAddress: o.deliveryAddress as Record<
        string,
        string | null
      > | null,
      // Peşin işte satıcı onaydan önce teminat mektubu yüklemek zorunda —
      // UI (accept modalı + belgeler bölümü) bu bayrağa göre yönlendirir.
      listingPaymentTerm: o.listing?.paymentTerm ?? null,
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
    };
  }
}
