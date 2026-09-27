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
  // Çeviriyazısı olmayan ad (Çince, Arapça …) boş slug üretir → Türkçe
  // "firma" yerine Rothern ID'ye düş: dilden bağımsız, tekil ve anlamlı.
  const base = trimSlug(generateSlug(name).slice(0, 60)) || (await fallbackBase(db, selfId));
  return pickFreeSlug(base, async (candidates) => {
    const rows = await db.company.findMany({
      where: { slug: { in: candidates }, id: { not: selfId } },
      select: { slug: true },
    });
    return rows.map((r) => r.slug).filter((s): s is string => !!s);
  });
}

/** Kesimden sonra uçta kalan tireyi atar ("abc-" → "abc"). */
function trimSlug(s: string): string {
  return s.replace(/-+$/, "");
}

async function fallbackBase(db: Prisma.TransactionClient | PrismaService, selfId: string): Promise<string> {
  const row = await db.company.findUnique({ where: { id: selfId }, select: { rothernId: true } });
  const code = generateSlug(row?.rothernId ?? "") || selfId.slice(-8).toLowerCase();
  return `company-${code}`;
}

/**
 * ÇAKIŞMASIZ SLUG — TEK SORGU. `base`, `base-2` … `base-50` adaylarının
 * doluluğu tek `IN` sorgusuyla okunur (eskiden aday başına bir sorgu, en
 * kötü 48 gidiş-dönüş). Hepsi doluysa zamana düşülür.
 */
export async function pickFreeSlug(
  base: string,
  takenAmong: (candidates: string[]) => Promise<string[]>,
): Promise<string> {
  const candidates = [base, ...Array.from({ length: 49 }, (_, i) => `${base}-${i + 2}`)];
  const taken = new Set(await takenAmong(candidates));
  const free = candidates.find((c) => !taken.has(c));
  // Tükendiyse ada değil zamana düş — kullanıcıyı hata ile karşılamaktan
  // iyidir, slug zaten kalıcı ve görünürlüğü düşük.
  return free ?? `${base}-${Date.now().toString(36)}`;
}
