import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { AttachmentScope, Bid, Order, Tender } from "@supkeys/db";
import { randomBytes } from "crypto";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_TENDER_TOTAL = 200 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set<string>([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
]);

const FORBIDDEN_EXTENSIONS = new Set<string>([
  "exe",
  "sh",
  "bat",
  "cmd",
  "js",
  "html",
  "htm",
  "jsp",
  "php",
  "py",
  "rb",
  "msi",
  "dll",
  "scr",
]);

/**
 * Aktör bağlamı — istek tenant kullanıcısından mı tedarikçi kullanıcısından mı geldi?
 */
export type ActorContext =
  | {
      kind: "tenant";
      tenantId: string;
      userId: string;
      role: string;
    }
  | {
      kind: "supplier";
      supplierId: string;
      supplierUserId: string;
    };

interface UploadParams {
  scope: AttachmentScope;
  scopeRefId: string;
  originalFilename: string;
  mimeType: string;
  fileSize: number;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ---------- Public API ----------

  async requestUploadUrl(actor: ActorContext, params: UploadParams) {
    this.validateMime(params.mimeType, params.originalFilename);
    this.validateSize(params.fileSize);

    const tenantId = await this.assertScopeAccessForWrite(
      actor,
      params.scope,
      params.scopeRefId,
    );

    if (params.scope === "TENDER_DOC") {
      await this.assertTenderTotalUnderLimit(tenantId, params.scopeRefId, params.fileSize);
    }

    const created = await this.prisma.attachment.create({
      data: {
        tenantId,
        scope: params.scope,
        scopeRefId: params.scopeRefId,
        originalFilename: params.originalFilename,
        mimeType: params.mimeType,
        fileSize: params.fileSize,
        status: "PENDING",
        // Geçici placeholder — id oluştuktan sonra gerçek key ile update edilir.
        key: `__pending__/${this.cuidish()}`,
        ...(actor.kind === "tenant"
          ? { uploadedByUserId: actor.userId }
          : { uploadedBySupplierUserId: actor.supplierUserId }),
      },
    });

    const key = this.storage.buildKey(tenantId, created.id, params.originalFilename);

    const updated = await this.prisma.attachment.update({
      where: { id: created.id },
      data: { key },
    });

    const uploadUrl = await this.storage.generatePresignedPut(key, params.mimeType);

    return {
      attachmentId: updated.id,
      key,
      uploadUrl,
      expiresIn: 15 * 60,
    };
  }

  async finalizeUpload(actor: ActorContext, attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException("Dosya bulunamadı");
    this.assertOwnsAttachment(actor, attachment);
    if (attachment.status !== "PENDING") {
      throw new BadRequestException("Bu dosya zaten finalize edilmiş");
    }

    const check = await this.storage.checkExists(attachment.key);
    if (!check.exists) {
      await this.prisma.attachment.delete({ where: { id: attachmentId } });
      throw new BadRequestException("Dosya yüklenmemiş veya transfer başarısız");
    }

    if (check.size !== undefined && check.size !== attachment.fileSize) {
      this.logger.warn(
        `Boyut uyuşmuyor (${attachmentId}): bildirilen=${attachment.fileSize}, gerçek=${check.size}. Gerçek boyuta göre güncelleniyor.`,
      );
    }

    return this.prisma.attachment.update({
      where: { id: attachmentId },
      data: {
        status: "UPLOADED",
        finalizedAt: new Date(),
        ...(check.size !== undefined && { fileSize: check.size }),
      },
      include: { uploadedByUser: { select: { firstName: true, lastName: true } } },
    });
  }

  async list(
    actor: ActorContext,
    scope: AttachmentScope,
    scopeRefId: string,
  ) {
    await this.assertScopeAccessForRead(actor, scope, scopeRefId);

    const items = await this.prisma.attachment.findMany({
      where: {
        scope,
        scopeRefId,
        status: "UPLOADED",
      },
      include: {
        uploadedByUser: { select: { firstName: true, lastName: true } },
        uploadedBySupplierUser: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return items.map((a) => ({
      id: a.id,
      scope: a.scope,
      scopeRefId: a.scopeRefId,
      originalFilename: a.originalFilename,
      mimeType: a.mimeType,
      fileSize: a.fileSize,
      createdAt: a.createdAt,
      finalizedAt: a.finalizedAt,
      uploadedBy: a.uploadedByUser
        ? {
            firstName: a.uploadedByUser.firstName,
            lastName: a.uploadedByUser.lastName,
            kind: "tenant" as const,
          }
        : a.uploadedBySupplierUser
          ? {
              firstName: a.uploadedBySupplierUser.firstName,
              lastName: a.uploadedBySupplierUser.lastName,
              kind: "supplier" as const,
            }
          : null,
    }));
  }

  async getDownloadUrl(actor: ActorContext, attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException();
    if (attachment.status !== "UPLOADED") {
      throw new BadRequestException("Dosya henüz yüklenmemiş");
    }

    await this.assertScopeAccessForRead(
      actor,
      attachment.scope,
      attachment.scopeRefId,
    );

    const url = await this.storage.generatePresignedGet(
      attachment.key,
      attachment.originalFilename,
    );

    return {
      url,
      filename: attachment.originalFilename,
      mimeType: attachment.mimeType,
      expiresIn: 60 * 60,
    };
  }

  async delete(actor: ActorContext, attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment) throw new NotFoundException();
    this.assertOwnsAttachment(actor, attachment);

    // Yayın sonrası kilit
    if (attachment.scope === "TENDER_DOC") {
      const tender = await this.prisma.tender.findUnique({
        where: { id: attachment.scopeRefId },
        select: { status: true },
      });
      if (tender && !["DRAFT", "IN_APPROVAL"].includes(tender.status)) {
        throw new BadRequestException(
          "Yayınlanmış ihalenin dökümanları silinemez",
        );
      }
    }
    if (attachment.scope === "BID_RESPONSE") {
      const bid = await this.prisma.bid.findUnique({
        where: { id: attachment.scopeRefId },
        select: { status: true },
      });
      if (bid && bid.status !== "DRAFT") {
        throw new BadRequestException(
          "Gönderilen teklifin dökümanları silinemez",
        );
      }
    }

    try {
      await this.storage.deleteObject(attachment.key);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`R2 silme başarısız (${attachment.key}): ${msg}`);
    }

    await this.prisma.attachment.delete({ where: { id: attachmentId } });

    return { success: true };
  }

  // ---------- Yetki ----------

  /**
   * Yazma izni — yeni upload veya silme için. tenantId döner.
   */
  private async assertScopeAccessForWrite(
    actor: ActorContext,
    scope: AttachmentScope,
    scopeRefId: string,
  ): Promise<string> {
    if (scope === "TENDER_DOC") {
      if (actor.kind !== "tenant") {
        throw new ForbiddenException("Sadece alıcı ihale dökümanı yükleyebilir");
      }
      const tender = await this.requireTender(scopeRefId);
      if (tender.tenantId !== actor.tenantId) throw new ForbiddenException();
      return tender.tenantId;
    }
    if (scope === "BID_RESPONSE") {
      if (actor.kind !== "supplier") {
        throw new ForbiddenException(
          "Sadece tedarikçi teklif dökümanı yükleyebilir",
        );
      }
      const bid = await this.requireBid(scopeRefId);
      if (bid.supplierId !== actor.supplierId) throw new ForbiddenException();
      // tenantId bid'in tender'ından
      const tender = await this.prisma.tender.findUnique({
        where: { id: bid.tenderId },
        select: { tenantId: true },
      });
      if (!tender) throw new NotFoundException("İhale bulunamadı");
      return tender.tenantId;
    }
    if (scope === "ORDER_INVOICE") {
      const order = await this.requireOrder(scopeRefId);
      if (actor.kind === "tenant") {
        if (order.tenantId !== actor.tenantId) throw new ForbiddenException();
      } else {
        if (order.supplierId !== actor.supplierId) throw new ForbiddenException();
      }
      return order.tenantId;
    }
    // G5 madde 19/21 — sipariş belgeleri (proforma/teknik/teslimat) yalnızca
    // siparişin tedarikçisi tarafından yüklenir/silinir. Alıcı sadece okur.
    if (
      scope === "ORDER_PROFORMA" ||
      scope === "ORDER_TECHNICAL" ||
      scope === "ORDER_DELIVERY"
    ) {
      if (actor.kind !== "supplier") {
        throw new ForbiddenException(
          "Bu belgeleri yalnızca tedarikçi yükleyebilir",
        );
      }
      const order = await this.requireOrder(scopeRefId);
      if (order.supplierId !== actor.supplierId) throw new ForbiddenException();
      return order.tenantId;
    }
    if (scope === "MESSAGE_ATTACHMENT") {
      // V2-4 — scopeRefId polymorphic: önce order, sonra tender lookup.
      // Yetki: order için her iki taraf, tender için tenant veya invited supplier.
      return this.assertMessageAttachmentAccess(actor, scopeRefId);
    }
    throw new BadRequestException(`Geçersiz scope: ${scope}`);
  }

  /**
   * Okuma izni — list / download.
   */
  private async assertScopeAccessForRead(
    actor: ActorContext,
    scope: AttachmentScope,
    scopeRefId: string,
  ): Promise<void> {
    if (scope === "TENDER_DOC") {
      const tender = await this.prisma.tender.findUnique({
        where: { id: scopeRefId },
        select: { id: true, tenantId: true },
      });
      if (!tender) throw new NotFoundException("İhale bulunamadı");

      if (actor.kind === "tenant") {
        if (tender.tenantId !== actor.tenantId) throw new ForbiddenException();
        return;
      }
      // Supplier: davet edilmiş mi?
      const invitation = await this.prisma.tenderInvitation.findUnique({
        where: {
          tenderId_supplierId: { tenderId: tender.id, supplierId: actor.supplierId },
        },
        select: { id: true },
      });
      if (!invitation) throw new ForbiddenException();
      return;
    }
    if (scope === "BID_RESPONSE") {
      const bid = await this.prisma.bid.findUnique({
        where: { id: scopeRefId },
        select: {
          supplierId: true,
          tender: { select: { tenantId: true } },
        },
      });
      if (!bid) throw new NotFoundException("Teklif bulunamadı");

      if (actor.kind === "tenant") {
        if (bid.tender.tenantId !== actor.tenantId) throw new ForbiddenException();
        return;
      }
      if (bid.supplierId !== actor.supplierId) throw new ForbiddenException();
      return;
    }
    // ORDER_INVOICE ve G5 sipariş belgeleri (proforma/teknik/teslimat) —
    // okuma izni siparişin her iki tarafına açık.
    if (
      scope === "ORDER_INVOICE" ||
      scope === "ORDER_PROFORMA" ||
      scope === "ORDER_TECHNICAL" ||
      scope === "ORDER_DELIVERY"
    ) {
      const order = await this.prisma.order.findUnique({
        where: { id: scopeRefId },
        select: { tenantId: true, supplierId: true },
      });
      if (!order) throw new NotFoundException("Sipariş bulunamadı");

      if (actor.kind === "tenant") {
        if (order.tenantId !== actor.tenantId) throw new ForbiddenException();
        return;
      }
      if (order.supplierId !== actor.supplierId) throw new ForbiddenException();
      return;
    }
    if (scope === "MESSAGE_ATTACHMENT") {
      await this.assertMessageAttachmentAccess(actor, scopeRefId);
      return;
    }
    throw new BadRequestException(`Geçersiz scope: ${scope}`);
  }

  /**
   * V2-4 MESSAGE_ATTACHMENT — scopeRefId polymorphic (order|tender).
   * Önce order, sonra tender lookup. Tenant: kendi tarafı. Supplier: order
   * tarafı veya tender'a davet edilmiş.
   */
  private async assertMessageAttachmentAccess(
    actor: ActorContext,
    scopeRefId: string,
  ): Promise<string> {
    const order = await this.prisma.order.findUnique({
      where: { id: scopeRefId },
      select: { tenantId: true, supplierId: true },
    });
    if (order) {
      if (actor.kind === "tenant") {
        if (order.tenantId !== actor.tenantId) throw new ForbiddenException();
      } else {
        if (order.supplierId !== actor.supplierId) {
          throw new ForbiddenException();
        }
      }
      return order.tenantId;
    }

    const tender = await this.prisma.tender.findUnique({
      where: { id: scopeRefId },
      select: { id: true, tenantId: true },
    });
    if (!tender) throw new NotFoundException("Bağlam bulunamadı");

    if (actor.kind === "tenant") {
      if (tender.tenantId !== actor.tenantId) throw new ForbiddenException();
      return tender.tenantId;
    }
    const invited = await this.prisma.tenderInvitation.findUnique({
      where: {
        tenderId_supplierId: {
          tenderId: tender.id,
          supplierId: actor.supplierId,
        },
      },
      select: { id: true },
    });
    if (!invited) throw new ForbiddenException();
    return tender.tenantId;
  }

  /**
   * Silme/finalize öncesi: aktör bu attachment'ın sahibi mi?
   */
  private assertOwnsAttachment(
    actor: ActorContext,
    attachment: { uploadedByUserId: string | null; uploadedBySupplierUserId: string | null; tenantId: string },
  ): void {
    if (actor.kind === "tenant") {
      if (attachment.tenantId !== actor.tenantId) {
        throw new ForbiddenException();
      }
      // Tenant-tarafı sahipliği: tenant kullanıcısı yüklemiş VEYA COMPANY_ADMIN.
      // Tedarikçi yüklediği BID_RESPONSE'a tenant tarafı dokunamaz (silemez).
      if (
        attachment.uploadedBySupplierUserId &&
        !attachment.uploadedByUserId
      ) {
        throw new ForbiddenException(
          "Tedarikçi tarafından yüklenmiş dosya tenant tarafından silinemez",
        );
      }
      if (
        attachment.uploadedByUserId &&
        attachment.uploadedByUserId !== actor.userId &&
        actor.role !== "COMPANY_ADMIN"
      ) {
        throw new ForbiddenException(
          "Bu dosyayı sadece yükleyen veya firma yöneticisi silebilir",
        );
      }
      return;
    }
    // Supplier — supplier-user owner olmalı
    if (
      !attachment.uploadedBySupplierUserId ||
      attachment.uploadedBySupplierUserId !== actor.supplierUserId
    ) {
      throw new ForbiddenException();
    }
  }

  // ---------- Yardımcılar ----------

  private validateMime(mimeType: string, filename: string) {
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new BadRequestException(`Bu dosya türü desteklenmiyor: ${mimeType}`);
    }
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext && FORBIDDEN_EXTENSIONS.has(ext)) {
      throw new BadRequestException(`Bu uzantı yasak: .${ext}`);
    }
  }

  private validateSize(fileSize: number) {
    if (!Number.isFinite(fileSize) || fileSize <= 0) {
      throw new BadRequestException("Dosya boyutu geçersiz");
    }
    if (fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException("Dosya 50 MB'tan büyük olamaz");
    }
  }

  private async assertTenderTotalUnderLimit(
    tenantId: string,
    tenderId: string,
    incomingSize: number,
  ): Promise<void> {
    const agg = await this.prisma.attachment.aggregate({
      where: {
        tenantId,
        scope: "TENDER_DOC",
        scopeRefId: tenderId,
        status: "UPLOADED",
      },
      _sum: { fileSize: true },
    });
    const current = agg._sum.fileSize ?? 0;
    if (current + incomingSize > MAX_TENDER_TOTAL) {
      throw new BadRequestException(
        `İhale toplam dosya limiti aşıldı (${Math.floor(
          MAX_TENDER_TOTAL / 1024 / 1024,
        )} MB). Mevcut: ${(current / 1024 / 1024).toFixed(1)} MB.`,
      );
    }
  }

  private async requireTender(id: string): Promise<Pick<Tender, "id" | "tenantId" | "status">> {
    const tender = await this.prisma.tender.findUnique({
      where: { id },
      select: { id: true, tenantId: true, status: true },
    });
    if (!tender) throw new NotFoundException("İhale bulunamadı");
    return tender;
  }

  private async requireBid(id: string): Promise<Pick<Bid, "id" | "supplierId" | "tenderId" | "status">> {
    const bid = await this.prisma.bid.findUnique({
      where: { id },
      select: { id: true, supplierId: true, tenderId: true, status: true },
    });
    if (!bid) throw new NotFoundException("Teklif bulunamadı");
    return bid;
  }

  private async requireOrder(id: string): Promise<Pick<Order, "id" | "tenantId" | "supplierId">> {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, tenantId: true, supplierId: true },
    });
    if (!order) throw new NotFoundException("Sipariş bulunamadı");
    return order;
  }

  /**
   * Geçici key suffix'i için kriptografik random.
   * Security audit O-4 — Math.random() predictable; randomBytes ile değiştirildi.
   */
  private cuidish(): string {
    return randomBytes(8).toString("hex");
  }
}
