import { CompanyRole } from "@rothern/db";
import { SEAT_ROLES } from "@rothern/shared";
import type { AiToolDef } from "../providers/ai-provider.interface";

/**
 * Faz AI-2 — asistan OKUMA araçları (az sayı: her tanım her istekte token yer).
 * Hepsi mevcut servis metoduna köprüdür; BAĞLAYICI YAZMA ARACI YOK. Portal-yönlü
 * kısıt: SA satış verisi / ST alım verisi göremez — araç kümesi + `type` param'ı
 * kullanıcının rollerinden türetilen izinli portallara KISITLANIR.
 */

export type Portal = "satinalma" | "satis";

/** Kullanıcının rollerinden erişebildiği portallar (SEAT rolleri; etiket AI'ya girmez). */
export function allowedPortals(roles: CompanyRole[]): Set<Portal> {
  const s = new Set<Portal>();
  if (roles.includes(CompanyRole.SATIN_ALMACI)) s.add("satinalma");
  if (roles.includes(CompanyRole.SATISCI)) s.add("satis");
  return s;
}

export function hasSeatRole(roles: CompanyRole[]): boolean {
  return roles.some((r) => (SEAT_ROLES as readonly string[]).includes(r));
}

/**
 * Portal → izinli listeleme YÖNÜ:
 * - satinalma (SATIN_ALMACI): kendi ALIM ihaleleri; açık SATIŞ ilanları (Satın Al).
 * - satis (SATISCI): kendi SATIŞ ilanları; açık ALIM ihaleleri (Açık İhaleler) + teklifler.
 */
export function canListMyTenders(portals: Set<Portal>, type: "ALIM" | "SATIS"): boolean {
  return type === "ALIM" ? portals.has("satinalma") : portals.has("satis");
}
export function canSearchOpen(portals: Set<Portal>, type: "ALIM" | "SATIS"): boolean {
  // sellerTenders(ALIM) = satıcının Açık İhaleler'i (teklif → satis);
  // sellerTenders(SATIS) = alıcının Satın Al'ı (→ satinalma).
  return type === "ALIM" ? portals.has("satis") : portals.has("satinalma");
}
export function canListMyBids(portals: Set<Portal>): boolean {
  return portals.has("satis"); // teklif verme satış operasyonu
}

/** Araç adları (beyaz-liste — bunun dışında hiçbir araç yürütülmez). */
export const TOOL_NAMES = {
  listMyTenders: "list_my_tenders",
  listMyBids: "list_my_bids",
  searchOpenTenders: "search_open_tenders",
  getTenderDetail: "get_tender_detail",
  listMyOrders: "list_my_orders",
  getOrderDetail: "get_order_detail",
  listMyConnections: "list_my_connections",
  /** AI-3 — konuşarak ihale taslağı toplama (BAĞLAYICI DEĞİL; ihale açmaz). */
  proposeTenderDraft: "propose_tender_draft",
  /**
   * AI-4 — AKSİYON ÖNERİLERİ: yürütmez, yalnız kullanıcıya onay kartı çıkarır.
   * Gerçek yürütme kullanıcının confirm endpoint'ine basmasıyla olur.
   */
  requestSendInvites: "request_send_invites",
  requestPublishTender: "request_publish_tender",
  requestEliminateBid: "request_eliminate_bid",
  requestAwardTender: "request_award_tender",
  requestPlaceBid: "request_place_bid",
  requestMarkOrderReceived: "request_mark_order_received",
} as const;

/** Currency/enum listeleri (sanitizer + DTO ile birebir; modele rehber). */
const CURRENCY_ENUM = ["TRY", "USD", "EUR", "GBP", "CHF", "JPY", "AED", "CNY", "RUB"];
const DELIVERY_ENUM = [
  "DOMESTIC_DELIVERED", "DOMESTIC_PICKUP", "DOMESTIC_CARRIER_COLLECT",
  "DOMESTIC_ON_VEHICLE", "EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP",
  "FAS", "FOB", "CFR", "CIF",
];
const PAYMENT_ENUM = [
  "ADVANCE", "DEFERRED", "OPEN_ACCOUNT", "MAL_MUKABILI", "CHEQUE", "SENET",
  "LETTER_OF_CREDIT", "CASH_AGAINST_DOCS", "CUSTOM",
];

/** propose_tender_draft parametreleri = AiTenderDraft alanları (JSON Schema). */
const TENDER_DRAFT_PARAMS = {
  type: "object",
  properties: {
    title: { type: "string", description: "İhale başlığı (3-200 karakter)" },
    description: { type: "string" },
    primaryCurrency: { type: "string", enum: CURRENCY_ENUM },
    deliveryTerm: { type: "string", enum: DELIVERY_ENUM, description: "Teslim şekli" },
    paymentCategory: { type: "string", enum: PAYMENT_ENUM, description: "Ödeme şekli" },
    paymentDays: { type: "number", description: "Vade günü (1-365) — vadeli/çek/senet/usance" },
    advancePercent: { type: "number", description: "Peşin yüzdesi (1-100) — yalnız ADVANCE" },
    bidsCloseAt: { type: "string", description: "Teklif kapanış tarihi (ISO, gelecekte)" },
    isInternational: { type: "boolean" },
    termsAndConditions: { type: "string" },
    keywords: { type: "array", items: { type: "string" } },
    items: {
      type: "array",
      description: "İhale kalemleri (en az 1)",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string", description: "adet, kg, m, paket…" },
          materialCode: { type: "string" },
          requiredByDate: { type: "string" },
          targetUnitPrice: { type: "number" },
        },
      },
    },
  },
} as const;

/**
 * Kullanıcının portallarına göre modele sunulacak araç tanımları. SA-only
 * kullanıcıya list_my_bids sunulmaz (satış aracı); ama type-param'lı araçlar tek
 * tanım kalır ve yürütücü yönü ayrıca doğrular (defense-in-depth).
 */
export function toolDefsForUser(portals: Set<Portal>): AiToolDef[] {
  const defs: AiToolDef[] = [
    {
      name: TOOL_NAMES.listMyTenders,
      description:
        "Firmanın kendi açtığı ihale/ilanları listeler. type=ALIM: satın alma ihaleleriniz; type=SATIS: satış ilanlarınız. Yalnız erişiminiz olan tarafı sorun.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["ALIM", "SATIS"] },
        },
        required: ["type"],
      },
    },
    {
      name: TOOL_NAMES.searchOpenTenders,
      description:
        "Piyasadaki, firmanızın görebildiği açık ihale/ilanları arar (görünürlük ve maskeleme otomatik uygulanır). type=ALIM: teklif verebileceğiniz açık alım ihaleleri; type=SATIS: satın alabileceğiniz satış ilanları.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["ALIM", "SATIS"] },
        },
        required: ["type"],
      },
    },
    {
      name: TOOL_NAMES.getTenderDetail,
      description:
        "Belirli bir ihale/ilanın detayını getirir (id ile). Görebildiğiniz kadarı döner; başkalarının teklifleri kapalı zarftır.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    {
      name: TOOL_NAMES.listMyOrders,
      description: "Firmanızın taraf olduğu siparişleri listeler (alım ve satış).",
      parameters: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.getOrderDetail,
      description: "Belirli bir siparişin detayını getirir (id ile).",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    {
      name: TOOL_NAMES.listMyConnections,
      description: "Firmanızın aktif iş bağlantılarını listeler.",
      parameters: { type: "object", properties: {} },
    },
  ];
  if (canListMyBids(portals)) {
    defs.push({
      name: TOOL_NAMES.listMyBids,
      description: "Firmanızın başka ihalelere verdiği teklifleri listeler.",
      parameters: { type: "object", properties: {} },
    });
  }
  // AI-3: kullanıcı ihale açmak isterse taslak toplama (yalnız SA/ST portalında
  // anlamlı; oluşturma DEĞİL — kullanıcı formda tamamlar).
  if (portals.size > 0) {
    defs.push({
      name: TOOL_NAMES.proposeTenderDraft,
      description:
        "Kullanıcı yeni bir ihale/ilan açmak istediğinde, o ana kadar topladığın TÜM alanları buraya ver (her çağrıda tam taslak — önceki + yeni). İhaleyi OLUŞTURMAZ; yalnız taslağı kaydeder. Kategori ve adres SORMA (kullanıcı formda seçer).",
      parameters: TENDER_DRAFT_PARAMS as unknown as object,
    });
    // AI-4: aksiyon önerileri — kullanıcı AÇIKÇA isteyince çağrılır; yürütmez,
    // onay kartı üretir. Onayı kullanıcı verir; sen verildiğini VARSAYAMAZSIN.
    defs.push({
      name: TOOL_NAMES.requestSendInvites,
      description:
        "Kullanıcı kendi ihalesine firma davet etmek İSTEDİĞİNDE çağır. Yürütmez: kullanıcıya onay kartı çıkarır, davet ancak kullanıcı onaylarsa gönderilir. listingId = kullanıcının kendi ihalesi; rothernIds = davet edilecek firmaların Rothern kodları (bağlantı listesinden bulunabilir).",
      parameters: {
        type: "object",
        properties: {
          listingId: { type: "string" },
          rothernIds: { type: "array", items: { type: "string" } },
        },
        required: ["listingId", "rothernIds"],
      },
    });
    defs.push({
      name: TOOL_NAMES.requestPublishTender,
      description:
        "Kullanıcı, bu sohbette biriken ihale taslağını YAYINLAMAK istediğini AÇIKÇA söylediğinde çağır. Yürütmez: doğrulanmış özetle onay kartı çıkarır; ihale ancak kullanıcı onaylarsa yayınlanır. Davetli (kapalı) yayınlanır: davet edilecek en az bir BAĞLANTILI firmanın Rothern kodu gerekir — kullanıcıya kimleri davet edeceğini sor (bağlantı listesinden bulabilirsin). Taslakta eksik zorunlu alan varsa araç sana eksikleri söyler — önce onları tamamla.",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["ALIM", "SATIS"], description: "İhale yönü" },
          rothernIds: {
            type: "array",
            items: { type: "string" },
            description: "Davet edilecek bağlantılı firmaların Rothern kodları (en az 1)",
          },
        },
        required: ["type", "rothernIds"],
      },
    });
  }
  if (portals.has("satis")) {
    // Faz 3 — satış tarafı: teklif verme (kritik; kapalı zarf, geri çekilemez).
    defs.push({
      name: TOOL_NAMES.requestPlaceBid,
      description:
        "Kullanıcı bir açık ihaleye TEKLİF VERMEK istediğini AÇIKÇA söylediğinde çağır. Yürütmez: kritik onay kartı çıkarır — gönderilen teklif GERİ ÇEKİLEMEZ. TÜM kalemler için birim fiyatı kullanıcıdan iste (itemId'leri get_tender_detail'den al). Belge veya zorunlu soru isteyen ihalede araç seni sayfaya yönlendirmeni söyler. Fiyatları SEN UYDURAMAZSIN; yalnız kullanıcının verdiği fiyatlar.",
      parameters: {
        type: "object",
        properties: {
          listingId: { type: "string" },
          currency: { type: "string", description: "Boşsa ihalenin ana para birimi" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                itemId: { type: "string" },
                unitPrice: { type: "number" },
              },
              required: ["itemId", "unitPrice"],
            },
            description: "HER kalem için birim fiyat",
          },
          deliveryDate: {
            type: "string",
            description: "Taahhüt edilen teslim tarihi (ISO, gelecekte) — ZORUNLU, kullanıcıya sor",
          },
          note: { type: "string" },
          validityDays: { type: "number", description: "Teklif geçerlilik günü (ops.)" },
        },
        required: ["listingId", "items", "deliveryDate"],
      },
    });
  }
  if (portals.has("satinalma")) {
    // Faz 3 — alıcı tarafı: teslim alındı işareti (IN_DELIVERY→DELIVERED).
    defs.push({
      name: TOOL_NAMES.requestMarkOrderReceived,
      description:
        "Kullanıcı, alıcısı olduğu YOLDAKİ bir siparişi TESLİM ALDIĞINI söylediğinde çağır. Yürütmez: onay kartı çıkarır. Diğer sipariş adımları (gönderim, ödeme işaretleme, tamamlama, iptal) için Siparişler sayfasına yönlendir.",
      parameters: {
        type: "object",
        properties: {
          orderId: { type: "string" },
          note: { type: "string", description: "Opsiyonel teslim notu" },
        },
        required: ["orderId"],
      },
    });
  }
  if (portals.size > 0) {
    // Faz 2 — ihale sahibi tarafı: eleme (normal) + toplu kazandırma (kritik).
    defs.push({
      name: TOOL_NAMES.requestEliminateBid,
      description:
        "Kullanıcı kendi ihalesindeki bir teklifi ELEMEK istediğinde çağır. Yürütmez: onay kartı çıkarır. bidId'yi get_tender_detail sonucundan al; kullanıcı tedarikçi adıyla söylediyse önce detaydan eşleştir. Elenen tedarikçi yeniden teklif verebilir.",
      parameters: {
        type: "object",
        properties: {
          listingId: { type: "string" },
          bidId: { type: "string" },
          reason: { type: "string", description: "Opsiyonel eleme gerekçesi (tedarikçi görür)" },
        },
        required: ["listingId", "bidId"],
      },
    });
    defs.push({
      name: TOOL_NAMES.requestAwardTender,
      description:
        "Kullanıcı kendi ihalesini bir teklife (TOPLU — tüm kalemler tek tedarikçi) KAZANDIRMAK istediğini AÇIKÇA söylediğinde çağır. Yürütmez: kritik onay kartı çıkarır; işlem GERİ ALINAMAZ (sipariş oluşur). KARARI SEN VERME: hangi teklifin kazanacağını kullanıcı söyler; sen ancak istenirse teklifleri karşılaştırıp bilgi verirsin. Kalem-bazlı (her kaleme ayrı tedarikçi) kazandırma için ihale sayfasına yönlendir.",
      parameters: {
        type: "object",
        properties: {
          listingId: { type: "string" },
          bidId: { type: "string" },
          note: { type: "string", description: "Opsiyonel not (onay akışı varsa onaycılara iletilir)" },
        },
        required: ["listingId", "bidId"],
      },
    });
  }
  return defs;
}

/** Büyük liste sonuçlarını buda: ilk N kayıt + toplam sayaç (token tavanı). */
export function trimList<T>(rows: T[], max = 30): { items: T[]; total: number; truncated: boolean } {
  return {
    items: rows.slice(0, max),
    total: rows.length,
    truncated: rows.length > max,
  };
}
