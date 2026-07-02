import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@supkeys/db";
import { isValidIbanTr, normalizeIban } from "@supkeys/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { UpsertBankAccountDto } from "./dto/company-bank-account.dto";

/**
 * Banka hesabı defteri (adres defteri deseni) — sipariş kabulünde IBAN elle
 * yazılmaz, buradan seçilir. Tek varsayılan hesap.
 */
@Injectable()
export class CompanyBankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  list(companyId: string) {
    return this.prisma.companyBankAccount.findMany({
      where: { companyId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
  }

  async create(user: AuthenticatedCompanyUser, dto: UpsertBankAccountDto) {
    const iban = this.validateIban(dto.iban);
    return this.prisma.$transaction(async (tx) => {
      const created = await tx.companyBankAccount.create({
        data: {
          companyId: user.companyId,
          title: dto.title.trim(),
          accountHolder: dto.accountHolder.trim(),
          iban,
          bankName: dto.bankName?.trim() || null,
          isDefault: dto.isDefault ?? false,
        },
      });
      if (created.isDefault) {
        await this.clearOtherDefaults(tx, user.companyId, created.id);
      }
      return created;
    });
  }

  async update(
    user: AuthenticatedCompanyUser,
    id: string,
    dto: UpsertBankAccountDto,
  ) {
    await this.requireOwn(user.companyId, id);
    const iban = this.validateIban(dto.iban);
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.companyBankAccount.update({
        where: { id },
        data: {
          title: dto.title.trim(),
          accountHolder: dto.accountHolder.trim(),
          iban,
          bankName: dto.bankName?.trim() || null,
          isDefault: dto.isDefault ?? false,
        },
      });
      if (u.isDefault) {
        await this.clearOtherDefaults(tx, user.companyId, u.id);
      }
      return u;
    });
  }

  async remove(user: AuthenticatedCompanyUser, id: string) {
    await this.requireOwn(user.companyId, id);
    await this.prisma.companyBankAccount.delete({ where: { id } });
    return { ok: true };
  }

  /** TR IBAN katı doğrulanır; yabancı IBAN gevşek (uzunluk + format DTO'da). */
  private validateIban(raw: string): string {
    const iban = normalizeIban(raw.trim());
    if (iban.startsWith("TR") && !isValidIbanTr(iban)) {
      throw new BadRequestException("Geçerli bir TR IBAN giriniz");
    }
    if (!/^[A-Z]{2}[0-9A-Z]{8,32}$/.test(iban)) {
      throw new BadRequestException("Geçerli bir IBAN giriniz");
    }
    return iban;
  }

  private async requireOwn(companyId: string, id: string) {
    const a = await this.prisma.companyBankAccount.findUnique({
      where: { id },
      select: { id: true, companyId: true },
    });
    if (!a || a.companyId !== companyId) {
      throw new NotFoundException("Banka hesabı bulunamadı");
    }
    return a;
  }

  /** Diğer hesapların varsayılanını kaldır (tek varsayılan). */
  private async clearOtherDefaults(
    tx: Prisma.TransactionClient,
    companyId: string,
    keepId: string,
  ) {
    await tx.companyBankAccount.updateMany({
      where: { companyId, id: { not: keepId }, isDefault: true },
      data: { isDefault: false },
    });
  }
}
