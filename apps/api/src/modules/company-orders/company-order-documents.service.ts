import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CompanyDocType,
  CompanyOrderPaymentTiming,
  CompanyOrderStatus,
  CompanyRole,
} from "@rothern/db";
import * as crypto from "crypto";
import { PrismaService } from "../../common/prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import {
  assertReportedSize,
  assertSafeFileName,
  assertUploadedObjectValid,
} from "../../common/helpers/upload-validation";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";

const ALLOWED_MIME = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];

@Injectable()
export class CompanyOrderDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** Yükleme için presigned PUT URL üretir (R2'ya doğrudan yükleme). */
  async requestUploadUrl(
    user: AuthenticatedCompanyUser,
    orderId: string,
    input: {
      fileName: string;
      mimeType: string;
      type: CompanyDocType;
      fileSize?: number;
    },
  ) {
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new BadRequestException("Sadece PDF veya görsel yüklenebilir");
    }
    assertSafeFileName(input.fileName);
    assertReportedSize(input.fileSize);
    await this.assertCanUpload(user, orderId, input.type);

    const safe = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const key = `company-orders/${orderId}/${input.type.toLowerCase()}/${crypto.randomUUID()}-${safe}`;
    const url = await this.storage.generatePresignedPut("private", key, input.mimeType);
    return { url, key };
  }

  /** Yükleme tamamlanınca belge kaydını oluşturur. */
  async register(
    user: AuthenticatedCompanyUser,
    orderId: string,
    input: {
      type: CompanyDocType;
      key: string;
      fileName: string;
      mimeType: string;
    },
  ) {
    await this.assertCanUpload(user, orderId, input.type);
    // F4 anti-tamper (diğer belge modülleriyle aynı): istemci yalnızca BU
    // sipariş+tip için üretilmiş key'i kaydedebilir — rastgele bucket nesnesi
    // kayıt edilip presigned GET ile indirilebilir hâle getirilemez.
    const expectedPrefix = `company-orders/${orderId}/${input.type.toLowerCase()}/`;
    if (!input.key.startsWith(expectedPrefix)) {
      throw new BadRequestException("Geçersiz dosya anahtarı");
    }
    if (!ALLOWED_MIME.includes(input.mimeType)) {
      throw new BadRequestException("Sadece PDF veya görsel yüklenebilir");
    }
    assertSafeFileName(input.fileName);
    await assertUploadedObjectValid(this.storage, "private", input.key);
    const doc = await this.prisma.companyOrderDocument.create({
      data: {
        orderId,
        type: input.type,
        key: input.key,
        fileName: input.fileName.slice(0, 200),
        mimeType: input.mimeType,
        uploadedByCompanyId: user.companyId,
      },
    });
    return { id: doc.id };
  }

  /** Siparişin belgeleri (her iki taraf görür) — indirme için presigned GET. */
  async list(user: AuthenticatedCompanyUser, orderId: string) {
    await this.requireParty(user, orderId);
    const docs = await this.prisma.companyOrderDocument.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(
      docs.map(async (d) => ({
        id: d.id,
        type: d.type,
        fileName: d.fileName,
        mimeType: d.mimeType,
        createdAt: d.createdAt,
        url: await this.storage.generatePresignedGet("private", d.key, d.fileName),
      })),
    );
  }

  async remove(user: AuthenticatedCompanyUser, orderId: string, docId: string) {
    const doc = await this.prisma.companyOrderDocument.findUnique({
      where: { id: docId },
    });
    if (!doc || doc.orderId !== orderId) {
      throw new NotFoundException("Belge bulunamadı");
    }
    // Sadece yükleyen firma silebilir.
    if (doc.uploadedByCompanyId !== user.companyId) {
      throw new ForbiddenException("Bu belgeyi silemezsiniz");
    }
    // Rol kapısı — yüklemeyle SİMETRİK (assertUploadRole aynı kapı): satıcı
    // yanı SATISCI, alıcı yanı SATIN_ALMACI ister. Eskiden silme yalnız
    // firma-eşitliğine bakıyordu (rolsüz/etiket-only üye operatörün yüklediği
    // belgeyi silebiliyordu — salt-okunur garanti açığı #3).
    const order = await this.requireParty(user, orderId);
    this.assertUploadRole(
      user,
      order.sellerCompanyId === user.companyId ? "seller" : "buyer",
    );
    // Teminat mektubu onaydan sonra silinemez: teslimat garantisi (alıcı
    // koruması) onay ANINDA count>0 kapısıyla doğrulanıyor; sonrasında
    // silinebilseydi garanti sessizce kaybolurdu. Yükleme kapısının aynası
    // (TEMINAT yalnız PENDING'de yönetilir).
    // NOT (kabul-edilen kalıntı): remove-status-check ile accept'in teminat
    // sayımı+geçişi arasında dar bir yarış var (satıcı teminatı silerken kendi
    // siparişini accept ederse). Tam kapatma accept'i FOR UPDATE + teminat +
    // geçiş atomik yapmayı gerektirir; self-inflicted/dar olduğu için ayrı iş.
    if (doc.type === "TEMINAT" && order.status !== "PENDING") {
      throw new BadRequestException(
        "Teminat mektubu, sipariş onaylandıktan sonra silinemez",
      );
    }
    await this.storage.deleteObject("private", doc.key).catch(() => undefined);
    await this.prisma.companyOrderDocument.delete({ where: { id: docId } });
    return { ok: true };
  }

  // ---- yetki ----
  private async requireParty(user: AuthenticatedCompanyUser, orderId: string) {
    const order = await this.prisma.companyOrder.findUnique({
      where: { id: orderId },
      select: {
        sellerCompanyId: true,
        buyerCompanyId: true,
        status: true,
        paymentTiming: true,
        paymentCategory: true,
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

  /**
   * Ödeme penceresi açık mı? CompanyOrdersService.isPaymentOpen ile birebir
   * (ödeme dekontu yükleme, ödeme kaydıyla aynı adımda açılmalı):
   *  - BEFORE_DELIVERY: satıcı onayından itibaren (ACCEPTED → COMPLETED)
   *  - AFTER_DELIVERY: teslim alındıktan itibaren (DELIVERED, COMPLETED)
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

  /**
   * Belge yükleme yetkisi = taraf (kim) + sipariş evresi (ne zaman):
   *  - TEMINAT → satıcı, yalnız onay öncesi (PENDING). Teslim öncesi ödemede onayın ön koşulu.
   *  - DELIVERY → satıcı, onaydan teslime kadar (ACCEPTED/CREATED/IN_DELIVERY/DELIVERED).
   *  - PAYMENT → alıcı, ödeme penceresi açıkken (isPaymentOpen).
   * Evre-dışı yükleme (ör. satıcı onaylamadan alıcının dekont yüklemesi) reddedilir.
   */
  private async assertCanUpload(
    user: AuthenticatedCompanyUser,
    orderId: string,
    type: CompanyDocType,
  ) {
    const order = await this.requireParty(user, orderId);
    const isSeller = order.sellerCompanyId === user.companyId;

    // Rol kapısı — sipariş geçişleriyle simetrik: satıcı belgeleri (TEMINAT/
    // DELIVERY) SATISCI, alıcı belgesi (PAYMENT) SATIN_ALMACI ister; SAHIP tam
    // yetkili. Eskiden yalnız taraf kontrol ediliyordu (rolsüz üye yükleyebilirdi).
    this.assertUploadRole(user, isSeller ? "seller" : "buyer");

    if (type === "TEMINAT") {
      if (!isSeller) {
        throw new ForbiddenException("Teminat mektubunu satıcı yükler");
      }
      if (order.status !== "PENDING") {
        throw new BadRequestException(
          "Teminat mektubu yalnızca sipariş onayından önce yüklenebilir",
        );
      }
      return;
    }

    if (type === "DELIVERY") {
      if (!isSeller) {
        throw new ForbiddenException("Teslim belgesini satıcı yükler");
      }
      const open =
        order.status === "ACCEPTED" ||
        order.status === "CREATED" ||
        order.status === "IN_DELIVERY" ||
        order.status === "DELIVERED";
      if (!open) {
        throw new BadRequestException(
          "Teslim belgesi, sipariş onaylandıktan sonra yüklenebilir",
        );
      }
      return;
    }

    if (type === "PAYMENT") {
      if (isSeller) {
        throw new ForbiddenException("Ödeme dekontunu alıcı yükler");
      }
      // Akreditifte ödeme banka kanalından — alıcının dekont penceresi kapalı.
      if (order.paymentCategory === "LETTER_OF_CREDIT") {
        throw new BadRequestException(
          "Akreditifli siparişte ödeme banka kanalından yapılır — dekont yüklenmez",
        );
      }
      if (!this.isPaymentOpen(order.paymentTiming, order.status)) {
        throw new BadRequestException(
          "Ödeme dekontu, ödeme adımı açıldığında yüklenebilir",
        );
      }
      return;
    }

    if (type === "LC") {
      // Akreditif belgesi (küşat mektubu): alıcı yükler, akreditifli siparişte,
      // satıcı onayından ("Akreditif Açıldı" adımının ön koşulu) gönderime kadar.
      if (isSeller) {
        throw new ForbiddenException("Akreditif belgesini alıcı yükler");
      }
      if (order.paymentCategory !== "LETTER_OF_CREDIT") {
        throw new BadRequestException("Bu sipariş akreditifli değil");
      }
      const open =
        order.status === "ACCEPTED" || order.status === "IN_DELIVERY";
      if (!open) {
        throw new BadRequestException(
          "Akreditif belgesi, sipariş onaylandıktan sonra yüklenebilir",
        );
      }
      return;
    }

    const terminal =
      order.status === "REJECTED" || order.status === "CANCELLED";

    if (type === "INVOICE") {
      // Fatura belgesi: satıcı yükler (faturayı kesen taraf), onaydan itibaren
      // sipariş sonlanana kadar (teslim sonrası fatura da mümkün).
      if (!isSeller) {
        throw new ForbiddenException("Fatura belgesini satıcı yükler");
      }
      if (order.status === "PENDING" || terminal) {
        throw new BadRequestException(
          "Fatura belgesi, sipariş onaylandıktan sonra yüklenebilir",
        );
      }
      return;
    }

    if (type === "PROFORMA") {
      // Proforma fatura: satıcı yükler (proformayı satıcı düzenler), sipariş
      // onaylandıktan sonra — alıcı bunu akreditif açmak / peşin ödeme yapmak
      // için kullanır. INVOICE ile aynı pencere (PENDING/terminal dışı).
      if (!isSeller) {
        throw new ForbiddenException("Proforma faturayı satıcı yükler");
      }
      if (order.status === "PENDING" || terminal) {
        throw new BadRequestException(
          "Proforma fatura, sipariş onaylandıktan sonra yüklenebilir",
        );
      }
      return;
    }

    if (type === "OTHER") {
      // Serbest ek belge (tek kutu): her iki taraf, sipariş aktifken. Rol kapısı
      // yukarıda kullanıcının kendi tarafına göre zaten uygulandı. Sonlanmış
      // (iptal/ret) siparişte yeni belge eklenemez.
      if (terminal) {
        throw new BadRequestException(
          "Sonlanmış siparişe belge eklenemez",
        );
      }
      return;
    }
  }

  /** Sipariş belgesi yükleme/silme rolü (sipariş geçişleriyle aynı; Faz R: SAHIP muaf değil). */
  private assertUploadRole(
    user: AuthenticatedCompanyUser,
    side: "seller" | "buyer",
  ): void {
    const needed =
      side === "seller" ? CompanyRole.SATISCI : CompanyRole.SATIN_ALMACI;
    if (!user.roles.includes(needed)) {
      throw new ForbiddenException(
        side === "seller"
          ? "Sipariş belgeleri için Satışçı rolü gerekir"
          : "Sipariş belgeleri için Satın Almacı rolü gerekir",
      );
    }
  }
}
