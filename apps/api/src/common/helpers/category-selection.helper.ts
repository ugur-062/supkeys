import { i18nMessage } from "../i18n/http-i18n";
import { BadRequestException } from "@nestjs/common";
import { hiddenCategoryWhere } from "@rothern/shared";
import {
  MAX_COMPANY_MAIN_CATEGORIES,
  MAX_COMPANY_SUB_CATEGORIES,
  MAX_COMPANY_SUB_PICKS,
  deepestCategoryPicks,
} from "@rothern/shared";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Birleşik kategori seçimi doğrulaması (alıcı + tedarikçi ortak).
 * - main: 1-N ANA kategori (segment, level 1) — tavan tek kaynak shared'de
 * - sub: 0-N ALT kategori (level 2-4 — family/class/commodity)
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

  if (mainIds.length < 1 || mainIds.length > MAX_COMPANY_MAIN_CATEGORIES) {
    throw new BadRequestException(
      i18nMessage("api.helpers.n1ArasiAnaKategoriSecmelisiniz", { MAXCOMPANYMAINCATEGORIES: MAX_COMPANY_MAIN_CATEGORIES }),
    );
  }

  // İKİ TAVAN AYRI: depolanan küme ata zincirini de taşır (seçim başına en
  // fazla L2+L3+L4), kullanıcıya gösterilen sayı ise SEÇİM sayısıdır. Tek sayı
  // kullanılsaydı 50 yaprak seçen kullanıcı genişlemeyle tavanı aşıp anlamsız
  // bir hata alırdı.
  if (subIds.length > MAX_COMPANY_SUB_CATEGORIES) {
    throw new BadRequestException(i18nMessage("api.helpers.altKategoriBeyaniFazlaGenis"));
  }
  if (deepestCategoryPicks(subIds).length > MAX_COMPANY_SUB_PICKS) {
    throw new BadRequestException(
      i18nMessage("api.helpers.enFazlaUrunHizmetSecebilirsiniz", { MAXCOMPANYSUBPICKS: MAX_COMPANY_SUB_PICKS }),
    );
  }

  const mains = await prisma.category.findMany({
    where: { id: { in: mainIds }, level: 1, isActive: true, ...hiddenCategoryWhere() },
    select: { id: true, nameTr: true },
  });
  if (mains.length !== mainIds.length) {
    throw new BadRequestException(
      i18nMessage("api.helpers.gecersizAnaKategoriYalnizcaSegmentSecilebilir"),
    );
  }

  if (subIds.length > 0) {
    const subCount = await prisma.category.count({
      where: { id: { in: subIds }, level: { gt: 1 }, isActive: true, ...hiddenCategoryWhere() },
    });
    if (subCount !== subIds.length) {
      throw new BadRequestException(i18nMessage("api.helpers.gecersizAltKategoriSecimi"));
    }
  }

  const nameById = new Map(mains.map((c) => [c.id, c.nameTr]));
  return {
    mainIds,
    subIds,
    mainNames: mainIds.map((id) => nameById.get(id) ?? ""),
  };
}
