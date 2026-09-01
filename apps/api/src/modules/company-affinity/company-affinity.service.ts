import { Injectable, Logger } from "@nestjs/common";
import { PrismaBypassService } from "../../common/prisma/prisma.service";

/**
 * FİRMA İLGİ MOTORU — beyandan davranışa.
 *
 * SORUN: eşleştirme yalnız BEYANA bakıyordu — firma bir segmenti işaretlemiş
 * mi. 38 kova için bu neredeyse rastgele: yeni talep o segmenti işaretleyen
 * HERKESE bildirim gönderiyor, kullanıcı birkaç alakasız bildirimden sonra
 * bildirimleri kapatıyor ve ürün orada sessizce işlevini yitiriyor.
 *
 * ÇÖZÜM: firmanın GERÇEKTE ne yaptığını ölç. Kime teklif verdi, neyi kazandı,
 * kataloğunda ne var, hangi talebe davet edildi. Beyan sıfırlanmıyor — en
 * zayıf sinyal olarak kalıyor (soğuk başlangıç için gerekli).
 *
 * HESAP GECE, OKUMA CANLI: skorlar cron'da `company_affinity` tablosuna
 * yazılır; istek yolunda yalnız okunur. Aksi hâlde her liste sorgusu sipariş/
 * teklif/katalog taraması yapardı.
 */

/** Sinyal ağırlıkları — plan `docs/plan-relevance-engine.md` §3. */
const W = {
  /** Kazanılan sipariş: kanıtlanmış yetkinlik, en güçlü sinyal. */
  wonOrder: 5.0,
  /** Verilen teklif: para hesaplamış, taahhüt üretmiş. */
  bid: 3.0,
  /** Davet edildiği talep: BAŞKASI onu o işe uygun görmüş. */
  invitation: 2.0,
  /** Katalog kalemi: firmanın kendi ürün beyanı — kutu işaretlemekten dürüst. */
  catalogItem: 2.0,
  /** Yayınladığı talep (alış yönü). */
  publishedListing: 1.5,
  /** Beyan edilen kategori — yalnız ÖN KABUL. */
  declared: 1.0,
} as const;

/**
 * Zaman sönümü: 18 ay yarılanma. İki yıl önce bir kez teklif verdiği alan
 * bugünkü uzmanlığını temsil etmez.
 */
const HALF_LIFE_MONTHS = 18;

/**
 * GENİŞLİK CEZASI — asıl istismar freni.
 *
 * Her firmanın toplam skoru sabit bir bütçeye normalize edilir. 50 kategoriye
 * yayılan firma her birinde zayıf, 3 kategoriye yoğunlaşan güçlü çıkar. Kutu
 * işaretlemek böylece SIFIR TOPLAMLI olur — çok seçmek avantaj değil
 * dezavantaj. Tavan (50) tek başına yetmezdi: 50 kutu işaretleyen firma her
 * aramada çıkmaya devam ederdi.
 */
const SCORE_BUDGET = 100;

/**
 * HİYERARŞİ SIZMASI — L4'te kazanılan skorun bir kısmı üst seviyelere yayılır.
 * "M12 civata" tedarikçisi "bağlantı elemanları" talebinde de görünür; her
 * emtiayı tek tek işaretlemek zorunda kalmaz.
 */
const LEAK_PARENT = 0.5;
const LEAK_GRANDPARENT = 0.25;

/** Bir öneride kullanıcıya gösterilecek ham sinyal dökümü. */
export interface AffinityReasons {
  wonOrders?: number;
  bids?: number;
  invitations?: number;
  catalogItems?: number;
  publishedListings?: number;
  declared?: boolean;
}

type Dir = "sell" | "buy";

interface Bucket {
  sell: number;
  buy: number;
  reasons: AffinityReasons;
}

@Injectable()
export class CompanyAffinityService {
  private readonly logger = new Logger(CompanyAffinityService.name);

  constructor(private readonly prisma: PrismaBypassService) {}

  /** Olayın yaşına göre sönüm katsayısı (0..1]. */
  private decay(at: Date | null | undefined, now: number): number {
    if (!at) return 1;
    const months = (now - at.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
    if (months <= 0) return 1;
    return Math.pow(0.5, months / HALF_LIFE_MONTHS);
  }

  /** Kategori kodundan üst seviye kodlarını türetir (kod = hiyerarşi). */
  private ancestors(code: string): { parent?: string; grandparent?: string } {
    if (!/^\d{8}$/.test(code)) return {};
    const cls = code.slice(0, 6) + "00";
    const fam = code.slice(0, 4) + "0000";
    const seg = code.slice(0, 2) + "000000";
    if (code !== cls) return { parent: cls, grandparent: fam };
    if (code !== fam) return { parent: fam, grandparent: seg };
    if (code !== seg) return { parent: seg };
    return {};
  }

  private add(
    map: Map<string, Bucket>,
    code: string,
    dir: Dir,
    amount: number,
    reason?: keyof AffinityReasons,
  ) {
    if (!code || amount <= 0) return;
    let b = map.get(code);
    if (!b) {
      b = { sell: 0, buy: 0, reasons: {} };
      map.set(code, b);
    }
    b[dir] += amount;
    if (reason) {
      if (reason === "declared") b.reasons.declared = true;
      else b.reasons[reason] = (b.reasons[reason] ?? 0) + 1;
    }
  }

  /**
   * Bir sinyali kendi kategorisine VE üst seviyelerine yazar.
   * `reason` yalnız DOĞRUDAN kategoriye işlenir — "neden gösterildi" metni
   * sızan skoru sayı olarak göstermemeli (kullanıcı "3 teklif" görüp o tam
   * kategoride 3 teklif aramamalı).
   */
  private addWithLeak(
    map: Map<string, Bucket>,
    code: string,
    dir: Dir,
    amount: number,
    reason: keyof AffinityReasons,
  ) {
    this.add(map, code, dir, amount, reason);
    const { parent, grandparent } = this.ancestors(code);
    if (parent) this.add(map, parent, dir, amount * LEAK_PARENT);
    if (grandparent) this.add(map, grandparent, dir, amount * LEAK_GRANDPARENT);
  }

  /**
   * TÜM firmaların ilgi profilini yeniden hesaplar.
   *
   * Firma başına ayrı sorgu atmak yerine sinyaller TOPLU çekilip bellekte
   * gruplanır: 1000 firmada firma-başına-sorgu binlerce tur demek (uzak
   * Supabase'de tur başına ~215 ms).
   */
  async recomputeAll(): Promise<{ companies: number; rows: number }> {
    const now = Date.now();

    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: {
        id: true,
        buyerCategoryIds: true,
        sellerCategoryIds: true,
        buyerSubCategoryIds: true,
        sellerSubCategoryIds: true,
      },
    });
    if (companies.length === 0) return { companies: 0, rows: 0 };

    // İlan kategorileri tek seferde — sipariş/teklif/davet hepsi buna bakıyor.
    const listings = await this.prisma.listing.findMany({
      select: { id: true, companyId: true, type: true, categoryIds: true, createdAt: true },
    });
    const listingById = new Map(listings.map((l) => [l.id, l]));

    const [orders, bids, invitations, items] = await Promise.all([
      this.prisma.companyOrder.findMany({
        where: { listingId: { not: null } },
        select: {
          listingId: true,
          sellerCompanyId: true,
          buyerCompanyId: true,
          createdAt: true,
        },
      }),
      this.prisma.listingBid.findMany({
        select: { listingId: true, bidderCompanyId: true, createdAt: true },
      }),
      this.prisma.listingInvitation.findMany({
        select: { listingId: true, invitedCompanyId: true, createdAt: true },
      }),
      this.prisma.companyItem.findMany({
        where: { isActive: true, categoryId: { not: null } },
        select: { companyId: true, categoryId: true, createdAt: true },
      }),
    ]);

    /** companyId → (categoryId → bucket) */
    const byCompany = new Map<string, Map<string, Bucket>>();
    const bucketOf = (companyId: string) => {
      let m = byCompany.get(companyId);
      if (!m) {
        m = new Map();
        byCompany.set(companyId, m);
      }
      return m;
    };

    // 1) Kazanılan siparişler — satıcıya SATIŞ, alıcıya ALIŞ ilgisi.
    for (const o of orders) {
      const l = o.listingId ? listingById.get(o.listingId) : undefined;
      if (!l) continue;
      const w = W.wonOrder * this.decay(o.createdAt, now);
      for (const c of l.categoryIds) {
        this.addWithLeak(bucketOf(o.sellerCompanyId), c, "sell", w, "wonOrders");
        this.addWithLeak(bucketOf(o.buyerCompanyId), c, "buy", w, "wonOrders");
      }
    }

    // 2) Verilen teklifler — teklif veren SATIYOR.
    for (const b of bids) {
      const l = listingById.get(b.listingId);
      if (!l) continue;
      const w = W.bid * this.decay(b.createdAt, now);
      for (const c of l.categoryIds) {
        this.addWithLeak(bucketOf(b.bidderCompanyId), c, "sell", w, "bids");
      }
    }

    // 3) Davetler — başkası onu o iş için uygun görmüş.
    for (const i of invitations) {
      const l = listingById.get(i.listingId);
      if (!l) continue;
      const w = W.invitation * this.decay(i.createdAt, now);
      for (const c of l.categoryIds) {
        this.addWithLeak(bucketOf(i.invitedCompanyId), c, "sell", w, "invitations");
      }
    }

    // 4) Katalog kalemleri — firmanın kendi ürün beyanı.
    for (const it of items) {
      if (!it.categoryId) continue;
      const w = W.catalogItem * this.decay(it.createdAt, now);
      this.addWithLeak(bucketOf(it.companyId), it.categoryId, "sell", w, "catalogItems");
    }

    // 5) Yayınladığı ilanlar — ALIM ise alış, SATIS ise satış yönü.
    for (const l of listings) {
      const dir: Dir = l.type === "ALIM" ? "buy" : "sell";
      const w = W.publishedListing * this.decay(l.createdAt, now);
      for (const c of l.categoryIds) {
        this.addWithLeak(bucketOf(l.companyId), c, dir, w, "publishedListings");
      }
    }

    // 6) Beyan — en zayıf sinyal ama SOĞUK BAŞLANGIÇ için şart: hiç davranışı
    //    olmayan yeni firma da bir yerde görünmeli. Sönüm uygulanmaz (beyan
    //    "şu an" geçerlidir, geçmiş bir olay değil).
    for (const c of companies) {
      const m = bucketOf(c.id);
      for (const code of [...c.buyerCategoryIds, ...c.buyerSubCategoryIds]) {
        this.addWithLeak(m, code, "buy", W.declared, "declared");
      }
      for (const code of [...c.sellerCategoryIds, ...c.sellerSubCategoryIds]) {
        this.addWithLeak(m, code, "sell", W.declared, "declared");
      }
    }

    // 7) GENİŞLİK CEZASI — her firma, her yön için sabit bütçeye normalize.
    //    İki yön AYRI normalize edilir: alıcı tarafı geniş olan bir firma
    //    satıcı tarafındaki uzmanlığını kaybetmemeli.
    const rows: Array<{
      companyId: string;
      categoryId: string;
      sellScore: number;
      buyScore: number;
      reasons: AffinityReasons;
    }> = [];

    for (const [companyId, m] of byCompany) {
      let sellTotal = 0;
      let buyTotal = 0;
      for (const b of m.values()) {
        sellTotal += b.sell;
        buyTotal += b.buy;
      }
      for (const [categoryId, b] of m) {
        const sellScore = sellTotal > 0 ? (SCORE_BUDGET * b.sell) / sellTotal : 0;
        const buyScore = buyTotal > 0 ? (SCORE_BUDGET * b.buy) / buyTotal : 0;
        // Sıfır satır yazmak tabloyu şişirir, hiçbir sorguya girmez.
        if (sellScore < 0.01 && buyScore < 0.01) continue;
        rows.push({
          companyId,
          categoryId,
          sellScore: Number(sellScore.toFixed(4)),
          buyScore: Number(buyScore.toFixed(4)),
          reasons: b.reasons,
        });
      }
    }

    // 8) Yaz. deleteMany+createMany TEK işlemde: yarıda kopan koşu profili
    //    boş bırakırsa öneri yüzeyleri sessizce boşalır ve kimse fark etmez.
    //    Ölü categoryId'ler (kategori silinmişse) burada kendiliğinden düşer,
    //    çünkü tablo her koşumda sıfırdan kurulur.
    await this.prisma.$transaction(
      async (tx) => {
        await tx.companyAffinity.deleteMany({});
        const CHUNK = 2000;
        for (let i = 0; i < rows.length; i += CHUNK) {
          await tx.companyAffinity.createMany({
            data: rows.slice(i, i + CHUNK).map((r) => ({
              companyId: r.companyId,
              categoryId: r.categoryId,
              sellScore: r.sellScore,
              buyScore: r.buyScore,
              reasons: r.reasons as object,
            })),
          });
        }
      },
      { timeout: 180_000, maxWait: 30_000 },
    );

    this.logger.log(
      `İlgi profili yeniden hesaplandı: ${byCompany.size} firma / ${rows.length} satır`,
    );
    return { companies: byCompany.size, rows: rows.length };
  }

  /**
   * Bir firmanın verilen kategorilerdeki ilgi skoru (0..100).
   * Birden çok kategori verilirse EN YÜKSEĞİ alınır — talep 5 kategoriye
   * dokunuyorsa firmanın en güçlü olduğu daldan değerlendirilmeli, ortalama
   * alıp uzmanlığı seyreltmemeli.
   */
  async scoreFor(
    companyId: string,
    categoryIds: string[],
    dir: Dir,
  ): Promise<{ score: number; reasons: AffinityReasons }> {
    if (categoryIds.length === 0) return { score: 0, reasons: {} };
    const rows = await this.prisma.companyAffinity.findMany({
      where: { companyId, categoryId: { in: categoryIds } },
      select: { sellScore: true, buyScore: true, reasons: true },
    });
    let best = 0;
    let reasons: AffinityReasons = {};
    for (const r of rows) {
      const v = dir === "sell" ? r.sellScore : r.buyScore;
      if (v > best) {
        best = v;
        reasons = (r.reasons ?? {}) as AffinityReasons;
      }
    }
    return { score: best, reasons };
  }

  /**
   * Verilen firmaların skorlarını TEK sorguda getirir (liste sıralaması).
   * Liste başına firma-başına-sorgu N+1 üretirdi.
   */
  async scoresForCompanies(
    companyIds: string[],
    categoryIds: string[],
    dir: Dir,
  ): Promise<Map<string, { score: number; reasons: AffinityReasons }>> {
    const out = new Map<string, { score: number; reasons: AffinityReasons }>();
    if (companyIds.length === 0 || categoryIds.length === 0) return out;
    const rows = await this.prisma.companyAffinity.findMany({
      where: { companyId: { in: companyIds }, categoryId: { in: categoryIds } },
      select: { companyId: true, sellScore: true, buyScore: true, reasons: true },
    });
    for (const r of rows) {
      const v = dir === "sell" ? r.sellScore : r.buyScore;
      const cur = out.get(r.companyId);
      if (!cur || v > cur.score) {
        out.set(r.companyId, { score: v, reasons: (r.reasons ?? {}) as AffinityReasons });
      }
    }
    return out;
  }
}

/**
 * "Neden gösterildi" metni — KULLANICI YÜZÜ.
 *
 * Kara kutu güvensizliğinin karşılığı: her öneride neden orada olduğunu
 * söylemek zorundayız. Metin ham sinyal dökümünden türetilir; en güçlü
 * sinyal seçilir çünkü üç satırlık bir gerekçe listesi kimse okumaz.
 */
export function affinityReasonText(
  reasons: AffinityReasons | null | undefined,
): string | null {
  if (!reasons) return null;
  if (reasons.wonOrders) return "Bu alanda tamamlanmış siparişiniz var";
  if (reasons.bids) return "Bu alanda daha önce teklif verdiniz";
  if (reasons.catalogItems) return "Kataloğunuzda bu alandan kalemler var";
  if (reasons.invitations) return "Bu alandaki taleplere davet edildiniz";
  if (reasons.publishedListings) return "Bu alanda ilan yayınladınız";
  if (reasons.declared) return "Faaliyet alanlarınızda işaretli";
  return null;
}

/** Aynı metnin ÜÇÜNCÜ ŞAHIS hâli — alıcıya tedarikçi önerirken. */
export function affinityReasonTextThirdParty(
  reasons: AffinityReasons | null | undefined,
): string | null {
  if (!reasons) return null;
  if (reasons.wonOrders) return "Bu alanda tamamlanmış siparişi var";
  if (reasons.bids) return "Bu alanda daha önce teklif verdi";
  if (reasons.catalogItems) return "Kataloğunda bu alandan kalemler var";
  if (reasons.invitations) return "Bu alandaki taleplere davet edildi";
  if (reasons.publishedListings) return "Bu alanda ilan yayınladı";
  if (reasons.declared) return "Faaliyet alanlarında işaretli";
  return null;
}
