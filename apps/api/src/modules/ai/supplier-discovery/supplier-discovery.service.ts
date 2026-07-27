import { Injectable } from "@nestjs/common";
import { deriveCategoryMatchCandidates } from "../../../common/helpers/tender-category-match.helper";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";

const MAX_CANDIDATES = 12;

export interface DiscoveryCandidate {
  companyId: string;
  name: string;
  city: string | null;
  rothernId: string | null;
  /** Eşleşen kategori adları (en fazla 3 — rozet için). */
  matchedCategories: string[];
  /** Alt-kategori (family/class) eşleşmesi mi (daha güçlü sinyal)? */
  strongMatch: boolean;
  /** Mevcut bağlantı isteği durumu — PENDING ise buton "davet gönderildi". */
  connectionStatus: "NONE" | "PENDING";
}

/**
 * "AI ile daha fazla tedarikçiye eriş" — Faz A: PLATFORM DİZİNİ keşfi.
 * Deterministik kategori eşleşmesi (notifyCategoryMatchedCompanies ile AYNI
 * helper — drift yok): ihale kategorilerinden segment+alt adayları türetilir,
 * karşı-taraf rolünün kategori alanlarıyla kesişen, dizinde görünür (BRONZ+),
 * bağlantısız firmalar dönülür. Kapalı-zarf/gizlilik etkisi yok — yalnız
 * firmaların KENDİ ilan ettiği profil alanları okunur.
 */
@Injectable()
export class SupplierDiscoveryService {
  constructor(private readonly prisma: PrismaService) {}

  async discoverRegistered(
    user: AuthenticatedCompanyUser,
    input: { type: "ALIM" | "SATIS"; categoryIds: string[] },
  ): Promise<{ candidates: DiscoveryCandidate[] }> {
    const codes = (input.categoryIds ?? []).filter((c) => /^\d{8}$/.test(c));
    if (codes.length === 0) return { candidates: [] };
    const { segmentIds, subCandidates } = deriveCategoryMatchCandidates(codes);

    // ALIM ihalesi → satıcı adayları (sellerCategoryIds); SATIS → alıcılar.
    const field = input.type === "ALIM" ? "sellerCategoryIds" : "buyerCategoryIds";

    // Bloklar (iki yön) + mevcut bağlantılar (her durumda) hariç tutulur.
    const [blocks, conns] = await Promise.all([
      this.prisma.companyBlock.findMany({
        where: {
          OR: [{ blockerCompanyId: user.companyId }, { blockedCompanyId: user.companyId }],
        },
        select: { blockerCompanyId: true, blockedCompanyId: true },
      }),
      this.prisma.companyConnection.findMany({
        where: {
          OR: [{ inviterCompanyId: user.companyId }, { inviteeCompanyId: user.companyId }],
        },
        select: { inviterCompanyId: true, inviteeCompanyId: true, status: true },
      }),
    ]);
    const excluded = new Set<string>([user.companyId]);
    for (const b of blocks) {
      excluded.add(b.blockerCompanyId);
      excluded.add(b.blockedCompanyId);
    }
    const pendingWith = new Set<string>();
    for (const c of conns) {
      const other = c.inviterCompanyId === user.companyId ? c.inviteeCompanyId : c.inviterCompanyId;
      if (c.status === "PENDING" && c.inviterCompanyId === user.companyId) {
        pendingWith.add(other); // bizim gönderdiğimiz bekleyen istek — listede kalır, etiketlenir
      } else {
        excluded.add(other); // ACTIVE/REJECTED/karşıdan-bekleyen → önermeyiz
      }
    }

    const rows = await this.prisma.company.findMany({
      where: {
        id: { notIn: [...excluded] },
        isActive: true,
        isBlocked: false,
        tier: { in: ["BRONZ", "SILVER", "GOLD"] },
        OR: [
          { [field]: { hasSome: segmentIds } },
          { [field]: { hasSome: subCandidates } },
        ],
      },
      select: {
        id: true,
        name: true,
        city: true,
        rothernId: true,
        buyerCategoryIds: true,
        sellerCategoryIds: true,
      },
      take: 60,
    });

    const subSet = new Set(subCandidates);
    const segSet = new Set(segmentIds);
    const scored = rows.map((r) => {
      const cats = input.type === "ALIM" ? r.sellerCategoryIds : r.buyerCategoryIds;
      const strong = cats.some((c) => subSet.has(c));
      const matched = cats.filter((c) => subSet.has(c) || segSet.has(c)).slice(0, 3);
      return { r, strong, matched };
    });
    scored.sort((a, b) => Number(b.strong) - Number(a.strong));
    const top = scored.slice(0, MAX_CANDIDATES);

    // Rozet için kategori adları (tek sorgu).
    const allMatchedIds = [...new Set(top.flatMap((s) => s.matched))];
    const catNames = new Map(
      (
        await this.prisma.category.findMany({
          where: { id: { in: allMatchedIds } },
          select: { id: true, nameTr: true },
        })
      ).map((c) => [c.id, c.nameTr]),
    );

    return {
      candidates: top.map(({ r, strong, matched }) => ({
        companyId: r.id,
        name: r.name,
        city: r.city,
        rothernId: r.rothernId,
        matchedCategories: matched
          .map((m) => catNames.get(m))
          .filter((n): n is string => !!n),
        strongMatch: strong,
        connectionStatus: pendingWith.has(r.id) ? "PENDING" : "NONE",
      })),
    };
  }
}
