import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import { StorageService } from "../../storage/storage.service";
import type {
  CreateCertDto,
  RequestCertUploadDto,
} from "../dto/supplier-certificate.dto";

/**
 * G9 madde 26 — Tedarikçi sertifika/belgeleri (ISO vb.). Tedarikçi serbestçe
 * yükler; herkese açık profilde görünür. (Premium gerektirmez.)
 */
@Injectable()
export class SupplierCertificatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private async getSupplierId(supplierUserId: string): Promise<string> {
    const u = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { supplierId: true },
    });
    if (!u) throw new NotFoundException("Kullanıcı bulunamadı");
    return u.supplierId;
  }

  private async serialize(c: {
    id: string;
    name: string;
    fileUrl: string;
    createdAt: Date;
  }) {
    return {
      id: c.id,
      name: c.name,
      url: await this.storage.resolveImageUrl(c.fileUrl),
      createdAt: c.createdAt.toISOString(),
    };
  }

  async requestUpload(supplierUserId: string, dto: RequestCertUploadDto) {
    const supplierId = await this.getSupplierId(supplierUserId);
    const key = this.storage.buildSupplierCertificateKey(
      supplierId,
      randomUUID(),
      dto.filename,
    );
    const uploadUrl = await this.storage.generatePresignedPut(
      key,
      dto.mimeType,
    );
    return { uploadUrl, key };
  }

  async create(supplierUserId: string, dto: CreateCertDto) {
    const supplierId = await this.getSupplierId(supplierUserId);
    if (!dto.key.includes(`/supplier-certificates/${supplierId}/`)) {
      throw new ForbiddenException("Bu dosya size ait değil");
    }
    const check = await this.storage.checkExists(dto.key);
    if (!check.exists) {
      throw new BadRequestException(
        "Yüklenmiş dosya bulunamadı — önce R2'ya PUT atın",
      );
    }
    const cert = await this.prisma.supplierCertificate.create({
      data: { supplierId, name: dto.name.trim(), fileUrl: dto.key },
    });
    return this.serialize(cert);
  }

  async list(supplierUserId: string) {
    const supplierId = await this.getSupplierId(supplierUserId);
    const certs = await this.prisma.supplierCertificate.findMany({
      where: { supplierId },
      orderBy: { createdAt: "desc" },
    });
    return Promise.all(certs.map((c) => this.serialize(c)));
  }

  async remove(supplierUserId: string, id: string) {
    const supplierId = await this.getSupplierId(supplierUserId);
    const cert = await this.prisma.supplierCertificate.findUnique({
      where: { id },
    });
    if (!cert || cert.supplierId !== supplierId) {
      throw new NotFoundException("Belge bulunamadı");
    }
    await this.storage.deleteObject(cert.fileUrl).catch(() => undefined);
    await this.prisma.supplierCertificate.delete({ where: { id } });
    return { ok: true };
  }
}
