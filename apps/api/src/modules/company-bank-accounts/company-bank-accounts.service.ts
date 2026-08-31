import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@rothern/db";
import {
  ibanChecksumOk,
  isValidIbanTr,
  maskIban,
  normalizeIban,
} from "@rothern/shared";
import { PrismaService } from "../../common/prisma/prisma.service";
import { runTenantTx } from "../../common/prisma/tenant-tx";
import { AuditService } from "../audit/audit.service";
import type { AuthenticatedCompanyUser } from "../company-auth/strategies/company-jwt.strategy";
import { UpsertBankAccountDto } from "./dto/company-bank-account.dto";

/**
 * Banka hesabı defteri (adres defteri deseni) — sipariş kabulünde IBAN elle
 * yazılmaz, buradan seçilir. Tek varsayılan hesap.
 *
 * INV-AUDIT-1: IBAN değişikliği dolandırıcılık delilidir → CRUD critical audit
 * izi bırakır (kim/ne zaman/hangi hesap). Ham IBAN metadata'ya YAZILMAZ —
 * maskeli referans (maskIban) yeter. log() fail-safe: işlem asla bloklanmaz.
 */
@Injectable()
export class CompanyBankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(companyId: string, canSeeFullIban = true) {
    const rows = await this.prisma.companyBankAccount.findMany({
      where: { companyId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });
    if (canSeeFullIban) return rows;
    return rows.map((r) => ({ ...r, iban: maskIban(r.iban) }));
  }

  async create(user: AuthenticatedCompanyUser, dto: UpsertBankAccountDto) {
    const iban = this.validateIban(dto.iban);
    const created = await runTenantTx(this.prisma, async (tx) => {
      const row = await tx.companyBankAccount.create({
        data: {
          companyId: user.companyId,
          title: dto.title.trim(),
          accountHolder: dto.accountHolder.trim(),
          iban,
          bankName: dto.bankName?.trim() || null,
          isDefault: dto.isDefault ?? false,
        },
      });
      if (row.isDefault) {
        await this.clearOtherDefaults(tx, user.companyId, row.id);
      }
      return row;
    });
    await this.audit.log({
      action: "company.bank_account.created",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_bank_account",
      entityId: created.id,
      metadata: {
        title: created.title,
        bankName: created.bankName,
        isDefault: created.isDefault,
        ibanMasked: maskIban(created.iban),
      },
      critical: true,
    });
    return created;
  }

  async update(
    user: AuthenticatedCompanyUser,
    id: string,
    dto: UpsertBankAccountDto,
  ) {
    const before = await this.requireOwn(user.companyId, id);
    const iban = this.validateIban(dto.iban);
    const updated = await runTenantTx(this.prisma, async (tx) => {
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
    const changedFields = (
      ["title", "accountHolder", "iban", "bankName", "isDefault"] as const
    ).filter((k) => before[k] !== updated[k]);
    const ibanChanged = changedFields.includes("iban");
    await this.audit.log({
      action: "company.bank_account.updated",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_bank_account",
      entityId: updated.id,
      metadata: {
        title: updated.title,
        bankName: updated.bankName,
        isDefault: updated.isDefault,
        ibanMasked: maskIban(updated.iban),
        changedFields,
        // IBAN değişimi = dolandırıcılık delili: eski+yeni maskeli referans.
        ...(ibanChanged
          ? {
              ibanMaskedBefore: maskIban(before.iban),
              ibanMaskedAfter: maskIban(updated.iban),
            }
          : {}),
      },
      critical: true,
    });
    return updated;
  }

  async remove(user: AuthenticatedCompanyUser, id: string) {
    const before = await this.requireOwn(user.companyId, id);
    await this.prisma.companyBankAccount.delete({ where: { id } });
    await this.audit.log({
      action: "company.bank_account.deleted",
      actorType: "company",
      actorId: user.userId,
      actorEmail: user.email,
      tenantId: user.companyId,
      entityType: "company_bank_account",
      entityId: id,
      metadata: {
        title: before.title,
        bankName: before.bankName,
        isDefault: before.isDefault,
        ibanMasked: maskIban(before.iban),
      },
      critical: true,
    });
    return { ok: true };
  }

  /** TR IBAN katı doğrulanır; yabancı IBAN gevşek (uzunluk + format DTO'da). */
  private validateIban(raw: string): string {
    const iban = normalizeIban(raw.trim());
    if (iban.startsWith("TR")) {
      if (!isValidIbanTr(iban)) {
        throw new BadRequestException("Geçerli bir TR IBAN giriniz");
      }
      return iban;
    }
    // Dalga B (P3): yabancı IBAN eskiden YALNIZ şekil kontrolünden geçiyordu —
    // tek hane yanlış yazılmış bir DE/NL IBAN kabul edilip siparişe ödeme
    // hesabı olarak damgalanıyordu (hata ancak bankada ortaya çıkar). mod-97
    // ülke bağımsızdır; artık o da uygulanıyor.
    if (!ibanChecksumOk(iban)) {
      throw new BadRequestException(
        "Geçerli bir IBAN giriniz — kontrol hanesi tutmuyor, lütfen yeniden kontrol edin",
      );
    }
    return iban;
  }

  /** Firma-sahipliği doğrular; audit metadata'sı (before) için tam satır döner. */
  private async requireOwn(companyId: string, id: string) {
    const a = await this.prisma.companyBankAccount.findUnique({
      where: { id },
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
