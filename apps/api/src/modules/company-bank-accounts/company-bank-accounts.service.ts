import { i18nMessage } from "../../common/i18n/http-i18n";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { maskIban, normalizeIban, normalizeSwift } from "@rothern/shared";
import { assertBankDetails } from "../../common/company/bank-details";
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
    return rows.map((r) => ({
      ...r,
      iban: r.iban ? maskIban(r.iban) : null,
      accountNumber: r.accountNumber ? maskIban(r.accountNumber) : null,
    }));
  }

  async create(user: AuthenticatedCompanyUser, dto: UpsertBankAccountDto) {
    const bank = await this.resolveDetails(user.companyId, dto);
    const created = await runTenantTx(this.prisma, async (tx) => {
      const row = await tx.companyBankAccount.create({
        data: {
          companyId: user.companyId,
          title: dto.title.trim(),
          accountHolder: dto.accountHolder.trim(),
          ...bank,
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
        ibanMasked: maskRef(created),
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
    const bank = await this.resolveDetails(user.companyId, dto);
    const updated = await runTenantTx(this.prisma, async (tx) => {
      const u = await tx.companyBankAccount.update({
        where: { id },
        data: {
          title: dto.title.trim(),
          accountHolder: dto.accountHolder.trim(),
          ...bank,
          isDefault: dto.isDefault ?? false,
        },
      });
      if (u.isDefault) {
        await this.clearOtherDefaults(tx, user.companyId, u.id);
      }
      return u;
    });
    const changedFields = (
      ["title", "accountHolder", "iban", "accountNumber", "swiftBic", "bankCountry", "bankName", "isDefault"] as const
    ).filter((k) => before[k] !== updated[k]);
    const ibanChanged = changedFields.some((k) => k === "iban" || k === "accountNumber" || k === "swiftBic");
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
        ibanMasked: maskRef(updated),
        changedFields,
        // Hesap değişimi = dolandırıcılık delili: eski+yeni maskeli referans.
        ...(ibanChanged
          ? {
              ibanMaskedBefore: maskRef(before),
              ibanMaskedAfter: maskRef(updated),
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
        ibanMasked: maskRef(before),
      },
      critical: true,
    });
    return { ok: true };
  }

  /**
   * Banka bilgisi ülkeye göre (2026-09-27): IBAN ülkesinde IBAN (mod-97, TR
   * katı); değilse hesap no + SWIFT/BIC + banka adı — kural tek kaynak
   * `assertBankDetails`. Bankanın ülkesi verilmezse: IBAN varsa IBAN'ın ülkesi,
   * yoksa firmanın ülkesi.
   */
  private async resolveDetails(companyId: string, dto: UpsertBankAccountDto) {
    const iban = normalizeIban(dto.iban?.trim() ?? "");
    let bankCountry = dto.bankCountry?.trim().toUpperCase() || (iban ? iban.slice(0, 2) : "");
    if (!bankCountry) {
      const c = await this.prisma.company.findUnique({ where: { id: companyId }, select: { country: true } });
      bankCountry = c?.country ?? "TR";
    }
    const input = {
      country: bankCountry,
      iban: iban || null,
      accountNumber: dto.accountNumber?.trim() || null,
      swiftBic: normalizeSwift(dto.swiftBic) || null,
      bankName: dto.bankName?.trim() || null,
    };
    assertBankDetails(input);
    // IBAN verildiyse hesap no/SWIFT boşalır (tek kimlik); yoksa IBAN boş.
    return iban
      ? { iban, accountNumber: null, swiftBic: input.swiftBic, bankCountry, bankName: input.bankName }
      : { iban: null, accountNumber: input.accountNumber, swiftBic: input.swiftBic, bankCountry, bankName: input.bankName };
  }

  /** Firma-sahipliği doğrular; audit metadata'sı (before) için tam satır döner. */
  private async requireOwn(companyId: string, id: string) {
    const a = await this.prisma.companyBankAccount.findUnique({
      where: { id },
    });
    if (!a || a.companyId !== companyId) {
      throw new NotFoundException(i18nMessage("api.companyBankAccounts.bankaHesabiBulunamadi"));
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

/** Denetim kaydı için maskeli hesap referansı (IBAN ya da hesap no). */
function maskRef(a: { iban: string | null; accountNumber: string | null }): string | null {
  const ref = a.iban ?? a.accountNumber;
  return ref ? maskIban(ref) : null;
}
