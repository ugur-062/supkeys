import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@rothern/db";
import {
  BUYING_TIER,
  SEAT_LIMITS,
  countSeats,
  tierAtLeast,
  type SeatGroup,
} from "@rothern/shared";
import { i18nMessage } from "../i18n/http-i18n";
import { effectiveTier } from "./effective-tier";

/**
 * KOLTUK KAPISI — bağımsız yardımcı (derin denetim 2026-09-29 MU-04).
 *
 * Firma paneli (`CompanyUsersService.assertSeatAvailable`) ile BİREBİR aynı
 * kurallar: SATINALMA grubu yalnız GOLD'da verilebilir (2026-09-14 kararı;
 * paket kapısı koltuk sayımından ÖNCE), sonra (kişi, grup) bazında koltuk
 * sayımı (+ istenirse bekleyen koltuk davetleri). Admin panelinin doğrudan
 * üye ekleme ve "Aktifleştir" yolları bu kapıyı atlıyordu (5/4 koltuk,
 * ücretsiz pakette satınalma yetkisi). `db` tenant'sız da olabilir (admin
 * bypass tx'i) — sorgular hep `companyId` ile süzülür.
 *
 * YARIŞ GÜVENLİĞİ: koltuk tüketen yazım, firma satırını FOR UPDATE kilitleyen
 * aynı tx'te bu kapıdan geçmeli (`lockCompanyRow`).
 */
export async function lockCompanyRow(
  db: Prisma.TransactionClient,
  companyId: string,
): Promise<void> {
  await db.$queryRaw`SELECT id FROM companies WHERE id = ${companyId} FOR UPDATE`;
}

export async function readSeatUsage(
  db: Prisma.TransactionClient,
  companyId: string,
) {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { tier: true, membershipEndAt: true, ownerUserId: true },
  });
  if (!company) throw new NotFoundException(i18nMessage("api.companyUsers.firmaBulunamadi"));
  const tier = effectiveTier(company.tier, company.membershipEndAt);
  const [users, invites] = await Promise.all([
    db.companyUser.findMany({
      where: { companyId, deletedAt: null, isActive: true },
      select: { id: true, roles: true, permissions: true },
    }),
    db.companyUserInvitation.findMany({
      where: { companyId, status: "PENDING", expiresAt: { gt: new Date() } },
      select: { roles: true, permissions: true },
    }),
  ]);
  const active = countSeats(
    users.map((u) => ({
      isOwner: company.ownerUserId === u.id,
      permissions: u.permissions,
      roles: u.roles,
    })),
  );
  const pending = countSeats(
    invites.map((i) => ({ permissions: i.permissions, roles: i.roles })),
  );
  return {
    limit: SEAT_LIMITS[tier],
    tier,
    used: active.total,
    pendingSeatInvites: pending.total,
  };
}

export async function assertSeatAvailable(
  db: Prisma.TransactionClient,
  companyId: string,
  opts: {
    /** YENİ işgal edilecek koltuk grupları (sayı değil — buy grubu paket kapısına girer). */
    groups: ReadonlySet<SeatGroup>;
    includePending?: boolean;
    context: "invite" | "accept" | "assign";
  },
): Promise<void> {
  const need = opts.groups.size;
  if (need <= 0) return;
  const { limit, used, pendingSeatInvites, tier } = await readSeatUsage(db, companyId);
  if (opts.groups.has("buy") && !tierAtLeast(tier, BUYING_TIER)) {
    throw new BadRequestException(
      i18nMessage("api.companyUsers.satinalmaYetkisiYalnizGoldPaketteVerilebilir"),
    );
  }
  if (limit == null) return;
  const occupied = used + (opts.includePending ? pendingSeatInvites : 0);
  if (occupied + need > limit) {
    if (opts.context === "accept") {
      throw new ConflictException(i18nMessage("api.companyUsers.koltukDoluDavetSuAnKabul"));
    }
    throw new BadRequestException(
      opts.includePending && pendingSeatInvites > 0
        ? i18nMessage("api.companyUsers.koltukDoluBekleyenDahil", {
            used,
            pending: pendingSeatInvites,
            limit,
          })
        : i18nMessage("api.companyUsers.koltukDoluIslemYetkisi", { used, limit }),
    );
  }
}
