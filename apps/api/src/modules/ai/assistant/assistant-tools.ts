import { BUY_SEAT_PERMISSIONS, SELL_SEAT_PERMISSIONS } from "@rothern/shared";
import { hasCompanyPermission } from "../../company-auth/permissions/company-permissions.constants";
import type { AiToolDef } from "../providers/ai-provider.interface";

/**
 * Faz AI-2 — asistan OKUMA araçları (az sayı: her tanım her istekte token yer).
 * Hepsi mevcut servis metoduna köprüdür; BAĞLAYICI YAZMA ARACI YOK. Portal-yönlü
 * kısıt: SA satış verisi / ST alım verisi göremez — araç kümesi + `type` param'ı
 * kullanıcının İŞLEM izinlerinden türetilen portallara KISITLANIR (yetki
 * tablosu 2026-09-05: etiket değil izin; görüntüleme tek başına asistanı açmaz).
 */

export type Portal = "satinalma" | "satis";

/** Kullanıcının işlem izinlerinden erişebildiği portallar. */
export function allowedPortals(user: {
  isOwner: boolean;
  permissions?: readonly string[] | null;
  roles?: readonly string[] | null;
}): Set<Portal> {
  const s = new Set<Portal>();
  if (hasCompanyPermission(user, BUY_SEAT_PERMISSIONS)) s.add("satinalma");
  if (hasCompanyPermission(user, SELL_SEAT_PERMISSIONS)) s.add("satis");
  return s;
}

/**
 * Portal → izinli listeleme YÖNÜ:
 * - satinalma (SATIN_ALMACI): kendi satın alma talepleri.
 * - satis (SATISCI): açık talepler (başkalarının) + teklifler.
 * (Satış ilanı 2026-09-04'te kaldırıldı; tek yön ALIM.)
 */
export function canListMyTenders(portals: Set<Portal>, _type: "ALIM" = "ALIM"): boolean {
  return portals.has("satinalma");
}
export function canSearchOpen(portals: Set<Portal>, _type: "ALIM" = "ALIM"): boolean {
  // sellerTenders = satıcının Açık Talepler'i (teklif → satis).
  return portals.has("satis");
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
    title: { type: "string", description: "Satın Alma Talebi başlığı (3-200 karakter)" },
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
      description: "Satın Alma Talebi kalemleri (en az 1)",
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
        "Firmanın kendi açtığı satın alma taleplerini listeler (satın alma portalı).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      name: TOOL_NAMES.searchOpenTenders,
      description:
        "Piyasadaki, firmanızın görebildiği ve teklif verebileceği açık satın alma taleplerini arar (görünürlük ve maskeleme otomatik uygulanır).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      name: TOOL_NAMES.getTenderDetail,
      description:
        "Belirli bir satın alma talebi/ilanın detayını getirir (id ile). Görebildiğiniz kadarı döner; başkalarının teklifleri kapalı zarftır.",
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
      description: "Firmanızın başka satın alma taleplerine verdiği teklifleri listeler.",
      parameters: { type: "object", properties: {} },
    });
  }
  // AI-3: kullanıcı ihale açmak isterse taslak toplama (yalnız SA/ST portalında
  // anlamlı; oluşturma DEĞİL — kullanıcı formda tamamlar).
  if (portals.size > 0) {
    defs.push({
      name: TOOL_NAMES.proposeTenderDraft,
      description:
        "Kullanıcı yeni bir satın alma talebi/ilan açmak istediğinde, o ana kadar topladığın TÜM alanları buraya ver (her çağrıda tam taslak — önceki + yeni). Satın Alma Talebini OLUŞTURMAZ; yalnız taslağı kaydeder. Kategori ve adres SORMA (kullanıcı formda seçer).",
      parameters: TENDER_DRAFT_PARAMS as unknown as object,
    });
    // AI-4: aksiyon önerileri — kullanıcı AÇIKÇA isteyince çağrılır; yürütmez,
    // onay kartı üretir. Onayı kullanıcı verir; sen verildiğini VARSAYAMAZSIN.
    defs.push({
      name: TOOL_NAMES.requestSendInvites,
      description:
        "Kullanıcı kendi satın alma talebine firma davet etmek İSTEDİĞİNDE çağır. Yürütmez: kullanıcıya onay kartı çıkarır, davet ancak kullanıcı onaylarsa gönderilir. listingId = kullanıcının kendi satın alma talebi; rothernIds = davet edilecek firmaların Rothern kodları (bağlantı listesinden bulunabilir).",
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
        "Kullanıcı, bu sohbette biriken satın alma talebi taslağını YAYINLAMAK istediğini AÇIKÇA söylediğinde çağır. Yürütmez: doğrulanmış özetle onay kartı çıkarır; satın alma talebi ancak kullanıcı onaylarsa yayınlanır. Davetli (kapalı) yayınlanır: davet edilecek en az bir BAĞLANTILI firmanın Rothern kodu gerekir — kullanıcıya kimleri davet edeceğini sor (bağlantı listesinden bulabilirsin). Taslakta eksik zorunlu alan varsa araç sana eksikleri söyler — önce onları tamamla.",
      parameters: {
        type: "object",
        properties: {
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
        "Kullanıcı bir açık satın alma talebine TEKLİF VERMEK istediğini AÇIKÇA söylediğinde çağır. Yürütmez: kritik onay kartı çıkarır — gönderilen teklif GERİ ÇEKİLEMEZ. TÜM kalemler için birim fiyatı kullanıcıdan iste (itemId'leri get_tender_detail'den al). Belge veya zorunlu soru isteyen satın alma talebinde araç seni sayfaya yönlendirmeni söyler. Fiyatları SEN UYDURAMAZSIN; yalnız kullanıcının verdiği fiyatlar.",
      parameters: {
        type: "object",
        properties: {
          listingId: { type: "string" },
          currency: { type: "string", description: "Boşsa satın alma talebinin ana para birimi" },
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
          deliveryTime: {
            type: "string",
            enum: ["STOKTAN", "W1_2", "W3_4", "W5_8", "M2_3", "M3_PLUS"],
            description:
              "Taahhüt edilen teslim SÜRESİ — ZORUNLU, kullanıcıya sor. STOKTAN=stoktan hemen, W1_2=1-2 hafta, W3_4=3-4 hafta, W5_8=5-8 hafta, M2_3=2-3 ay, M3_PLUS=3+ ay",
          },
          note: { type: "string" },
          validityDays: { type: "number", description: "Teklif geçerlilik günü (ops.)" },
        },
        required: ["listingId", "items", "deliveryTime"],
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
        "Kullanıcı kendi satın alma talebindeki bir teklifi ELEMEK istediğinde çağır. Yürütmez: onay kartı çıkarır. bidId'yi get_tender_detail sonucundan al; kullanıcı tedarikçi adıyla söylediyse önce detaydan eşleştir. Elenen tedarikçi yeniden teklif verebilir.",
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
        "Kullanıcı kendi satın alma talebini bir teklife (TOPLU — tüm kalemler tek tedarikçi) KAZANDIRMAK istediğini AÇIKÇA söylediğinde çağır. Yürütmez: kritik onay kartı çıkarır; işlem GERİ ALINAMAZ (sipariş oluşur). KARARI SEN VERME: hangi teklifin kazanacağını kullanıcı söyler; sen ancak istenirse teklifleri karşılaştırıp bilgi verirsin. Kalem-bazlı (her kaleme ayrı tedarikçi) kazandırma için satın alma talebi sayfasına yönlendir.",
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
