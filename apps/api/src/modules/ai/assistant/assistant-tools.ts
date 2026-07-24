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
