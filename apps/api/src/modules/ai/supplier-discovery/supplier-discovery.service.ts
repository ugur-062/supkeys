import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { deriveCategoryMatchCandidates } from "../../../common/helpers/tender-category-match.helper";
import { PrismaService } from "../../../common/prisma/prisma.service";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { AiService } from "../ai.service";
import { anyPackageWhere } from "../../../common/company/effective-tier";

const MAX_CANDIDATES = 12;
const MAX_EXTERNAL = 10;

export interface ExternalCandidate {
  name: string;
  city: string | null;
  website: string | null;
  /** Web'de AÇIKÇA yayınlanmış adres; yoksa null — model uyduramaz, kullanıcı doğrular. */
  email: string | null;
  reason: string;
}

const EXTERNAL_SCHEMA = {
  type: "object",
  properties: {
    companies: {
      type: "array",
      maxItems: MAX_EXTERNAL,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          city: { type: "string", nullable: true },
          website: { type: "string", nullable: true },
          email: { type: "string", nullable: true },
          reason: { type: "string" },
        },
        required: ["name", "reason"],
      },
    },
  },
  required: ["companies"],
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  /**
   * Faz B — DIŞ keşif: Google Search grounding ile web'de aday firma araması.
   * İki aşama (Gemini kısıtı: grounding + responseSchema birleşmez):
   *   1) grounding'li serbest-metin araştırma  2) ucuz şemalı JSON'a çevirme.
   * E-posta YALNIZ web'de açıkça yayınlanmışsa döner (uydurma yasak — prompt +
   * regex süzgeci); gönderim öncesi kullanıcı doğrular (Faz C).
   */
  async discoverExternal(
    user: AuthenticatedCompanyUser,
    input: {
      type: "ALIM" | "SATIS";
      categoryIds: string[];
      itemNames?: string[];
      region?: string;
    },
  ): Promise<{ companies: ExternalCandidate[] }> {
    this.ai.assertAiAccess(user);
    const catNames = (
      await this.prisma.category.findMany({
        where: { id: { in: input.categoryIds.slice(0, 10) } },
        select: { nameTr: true },
      })
    ).map((c) => c.nameTr);
    if (catNames.length === 0) return { companies: [] };
    const items = (input.itemNames ?? []).filter(Boolean).slice(0, 15);
    const role = input.type === "ALIM" ? "tedarikçi/üretici" : "kurumsal alıcı";
    const region = (input.region ?? "").trim().slice(0, 60);

    const research = await this.ai.callAi(user, {
      feature: "supplier_discovery",
      webSearch: true,
      system:
        "Bir B2B tedarik platformu için firma araştırması yaparsın. YALNIZ web aramasında gerçekten bulduğun firmaları listelersin; e-posta adresini yalnız sitede/aramada AÇIKÇA görünüyorsa yazarsın, asla tahmin etmezsin.",
      prompt: [
        `Türkiye'de${region ? ` (öncelik: ${region})` : ""} şu alanda faaliyet gösteren ${role} firmaları web'de araştır:`,
        `Kategoriler: ${catNames.join(", ")}`,
        ...(items.length > 0 ? [`İlgili ürün/kalemler: ${items.join(", ")}`] : []),
        "",
        `En fazla ${MAX_EXTERNAL} gerçek firma bul. Her biri için şu bilgileri yaz: firma adı, şehir, web sitesi, (varsa açıkça yayınlanmış iletişim e-postası), bu satın alma talebi için neden uygun olduğuna dair TEK cümle.`,
      ].join("\n"),
      metadata: { route: "external_discovery", stage: "research" },
    });

    const parsed = await this.ai.callAi(user, {
      feature: "supplier_discovery",
      responseSchema: EXTERNAL_SCHEMA as unknown as object,
      system:
        "Sana verilen araştırma metnini şemaya uygun JSON'a dönüştürürsün. Metinde açıkça yazmayan alanları null bırakırsın; firma/e-posta EKLEMEZ, uydurmazsın.",
      prompt: `<arastirma>\n${research.text.slice(0, 12000)}\n</arastirma>\n\nMetindeki firmaları JSON'a dönüştür.`,
      metadata: { route: "external_discovery", stage: "parse" },
    });

    try {
      const json = JSON.parse(parsed.text) as { companies?: unknown[] };
      const companies: ExternalCandidate[] = (json.companies ?? [])
        .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
        .slice(0, MAX_EXTERNAL)
        .map((c) => {
          const email = typeof c.email === "string" ? c.email.trim().toLowerCase() : "";
          const website = typeof c.website === "string" ? c.website.trim() : "";
          return {
            name: String(c.name ?? "").slice(0, 150),
            city: typeof c.city === "string" && c.city.trim() ? c.city.trim().slice(0, 60) : null,
            website: website ? website.slice(0, 200) : null,
            email: EMAIL_RE.test(email) ? email : null,
            reason: String(c.reason ?? "").slice(0, 200),
          };
        })
        .filter((c) => c.name);
      return { companies };
    } catch {
      throw new ServiceUnavailableException(
        "Dış arama sonuçları işlenemedi — lütfen tekrar deneyin.",
      );
    }
  }

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
        // Dalga B (P3/P4/P7'de üç kez kayıtlı INV-TIER-1 driftı): ham `tier`
        // filtresi üyelik süresi DOLMUŞ firmayı da aday çıkarıyordu — DB'de
        // hâlâ "GOLD" yazıyor ama efektif kademe STANDART. Kullanıcı bağlantı
        // daveti gönderiyor, karşı taraf paketsiz olduğu için kabul edemiyor.
        // TEK KAYNAK: anyPackageWhere (membershipEndAt farkında).
        ...anyPackageWhere(),
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
      // Dalga B: `orderBy` yoktu — `take: 60` ile hangi 60 satırın döneceği
      // Postgres'in fiziksel sırasına kalıyordu (aynı sorgu farklı sonuç).
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
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
