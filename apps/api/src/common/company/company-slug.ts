import { Prisma } from "@rothern/db";
import { generateSlug } from "@rothern/shared";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * FİRMA PROFİL SLUG'I — TEK KAYNAK.
 *
 * İki çağıran var ve ayrışmaları SESSİZ olurdu:
 *  · kayıt tamamlanırken (profil otomatik yayına alınır, 2026-09-15)
 *  · Profilim'den profil ilk kez açılırken (`company-profile.service.ts`)
 * Biri çakışma denetimini atlarsa unique kısıtı P2002 ile patlar ve kullanıcı
 * anlamsız bir hata görür.
 *
 * `selfId` HARİÇ tutulur: kendi slug'ını koruyan bir güncelleme kendini
 * çakışma sanmasın.
 */
export async function ensureUniqueCompanySlug(
  db: Prisma.TransactionClient | PrismaService,
  name: string,
  selfId: string,
): Promise<string> {
  const base = generateSlug(name).slice(0, 60) || "firma";
  let candidate = base;
  for (let i = 2; i < 50; i++) {
    const clash = await db.company.findFirst({
      where: { slug: candidate, id: { not: selfId } },
      select: { id: true },
    });
    if (!clash) return candidate;
    candidate = `${base}-${i}`;
  }
  // 48 deneme tükendiyse ada değil zamana düş — kullanıcıyı hata ile
  // karşılamaktan iyidir, slug zaten kalıcı ve görünürlüğü düşük.
  return `${base}-${Date.now().toString(36)}`;
}
