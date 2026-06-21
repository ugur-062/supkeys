import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type {
  CreateSupplierBankDto,
  UpdateSupplierBankDto,
} from "../dto/supplier-bank.dto";

/**
 * G6 madde 20 — Tedarikçi kayıtlı banka hesapları.
 * Görüntüleme: tüm tedarikçi kullanıcıları. Düzenleme: yalnızca yönetici.
 */
@Injectable()
export class SupplierBanksService {
  constructor(private readonly prisma: PrismaService) {}

  /** IBAN'ı normalize et (boşlukları at, büyük harf). */
  private normalizeIban(iban: string): string {
    return iban.replace(/\s+/g, "").toUpperCase();
  }

  private async assertManager(supplierUserId: string): Promise<void> {
    const user = await this.prisma.supplierUser.findUnique({
      where: { id: supplierUserId },
      select: { isManager: true },
    });
    if (!user?.isManager) {
      throw new ForbiddenException(
        "Banka hesaplarını yalnızca firma yöneticisi düzenleyebilir",
      );
    }
  }

  async list(supplierId: string) {
    return this.prisma.supplierBank.findMany({
      where: { supplierId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async create(
    supplierUserId: string,
    supplierId: string,
    dto: CreateSupplierBankDto,
  ) {
    await this.assertManager(supplierUserId);
    const iban = this.normalizeIban(dto.iban);

    return this.prisma.$transaction(async (tx) => {
      const existingCount = await tx.supplierBank.count({
        where: { supplierId },
      });
      // İlk hesap her zaman varsayılan; ya da kullanıcı işaretlediyse.
      const makeDefault = dto.isDefault === true || existingCount === 0;
      if (makeDefault) {
        await tx.supplierBank.updateMany({
          where: { supplierId, isDefault: true },
          data: { isDefault: false },
        });
      }
      return tx.supplierBank.create({
        data: {
          supplierId,
          accountHolder: dto.accountHolder.trim(),
          iban,
          bankName: dto.bankName?.trim() || null,
          label: dto.label?.trim() || null,
          isDefault: makeDefault,
        },
      });
    });
  }

  async update(
    supplierUserId: string,
    supplierId: string,
    bankId: string,
    dto: UpdateSupplierBankDto,
  ) {
    await this.assertManager(supplierUserId);

    return this.prisma.$transaction(async (tx) => {
      const bank = await tx.supplierBank.findUnique({ where: { id: bankId } });
      if (!bank || bank.supplierId !== supplierId) {
        throw new NotFoundException("Banka hesabı bulunamadı");
      }
      if (dto.isDefault === true) {
        await tx.supplierBank.updateMany({
          where: { supplierId, isDefault: true, id: { not: bankId } },
          data: { isDefault: false },
        });
      }
      return tx.supplierBank.update({
        where: { id: bankId },
        data: {
          ...(dto.accountHolder !== undefined && {
            accountHolder: dto.accountHolder.trim(),
          }),
          ...(dto.iban !== undefined && { iban: this.normalizeIban(dto.iban) }),
          ...(dto.bankName !== undefined && {
            bankName: dto.bankName?.trim() || null,
          }),
          ...(dto.label !== undefined && {
            label: dto.label?.trim() || null,
          }),
          ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        },
      });
    });
  }

  async remove(supplierUserId: string, supplierId: string, bankId: string) {
    await this.assertManager(supplierUserId);
    const bank = await this.prisma.supplierBank.findUnique({
      where: { id: bankId },
    });
    if (!bank || bank.supplierId !== supplierId) {
      throw new NotFoundException("Banka hesabı bulunamadı");
    }
    await this.prisma.supplierBank.delete({ where: { id: bankId } });
    // Silinen varsayılansa, kalan ilk hesabı varsayılan yap.
    if (bank.isDefault) {
      const next = await this.prisma.supplierBank.findFirst({
        where: { supplierId },
        orderBy: { createdAt: "asc" },
      });
      if (next) {
        await this.prisma.supplierBank.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }
    return { ok: true };
  }
}
