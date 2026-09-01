import { BadRequestException } from "@nestjs/common";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Birleşik kategori seçimi doğrulaması (alıcı + tedarikçi ortak).
 * - main: 1-3 ANA kategori (segment, level 1)
 * - sub: 0-sınırsız ALT kategori (level 2-4 — family/class/commodity)
 * Hepsi mevcut + aktif olmalı. mainNames, ana kategori sırasıyla döner.
 *
 * `inDiscovery` SÜZGECİ YOK — bilinçli. Firmanın "hangi alandayım" beyanı TAM
 * Ariba kataloğundan yapılır; talep/ilan kategorisi ise Discovery alt
 * kümesinden (`company-listings.service.ts` `inDiscovery: true` şart koşar).
 * Fark 13 yaprak: firma onları beyan edebilir, kimse o kodla talep açamaz.
 */
export async function validateCategorySelection(
  prisma: PrismaService,
  mainRaw: string[],
  subRaw: string[],
): Promise<{ mainIds: string[]; subIds: string[]; mainNames: string[] }> {
  const mainIds = Array.from(new Set((mainRaw ?? []).filter(Boolean)));
  const subIds = Array.from(new Set((subRaw ?? []).filter(Boolean)));

  if (mainIds.length < 1 || mainIds.length > 3) {
    throw new BadRequestException("1-3 arası ana kategori seçmelisiniz");
  }

  const mains = await prisma.category.findMany({
    where: { id: { in: mainIds }, level: 1, isActive: true },
    select: { id: true, nameTr: true },
  });
  if (mains.length !== mainIds.length) {
    throw new BadRequestException(
      "Geçersiz ana kategori (yalnızca segment seçilebilir)",
    );
  }

  if (subIds.length > 0) {
    const subCount = await prisma.category.count({
      where: { id: { in: subIds }, level: { gt: 1 }, isActive: true },
    });
    if (subCount !== subIds.length) {
      throw new BadRequestException("Geçersiz alt kategori seçimi");
    }
  }

  const nameById = new Map(mains.map((c) => [c.id, c.nameTr]));
  return {
    mainIds,
    subIds,
    mainNames: mainIds.map((id) => nameById.get(id) ?? ""),
  };
}
