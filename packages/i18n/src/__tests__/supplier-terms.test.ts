import { describe, expect, it } from "vitest";
import { rawMessages, type MessageTree, type Namespace } from "../messages";

/**
 * CLAUDE.md § Ürün Dili: satış tarafına (tedarikçiye) "satın alma talebi"
 * denmez, "alım talebi" denir. Aşağıdaki alt ağaçlar YALNIZ tedarikçiye
 * görünür (teklif içe aktarma diyaloğu/API hataları, dış davet e-postaları,
 * davet kapatma sayfası ve satış grafik sekmeleri); TR kaynakta alıcı terimi
 * geçmemeli.
 */
const SUPPLIER_ONLY: Array<[Namespace, string]> = [
  ["web", "panel.trade.bidImportDialog"],
  ["web", "marketing.optOut"],
  // Şirketim › Grafikler › Gelir / Müşteri (satış sekmeleri; arayüz testi O-106).
  ["web", "panel.shell.satisChartTabs"],
  // Satış paneli ana sayfası ve teklif verenin talep detayı (arayüz testi O-021).
  ["web", "panel.shell.satisDashboardView"],
  ["web", "panel.requests.myBidStatusPanel"],
  ["web", "panel.requests.auctionLiveCard"],
  ["web", "panel.requests.auctionBidWorkbench"],
  // İki tarafın ortak "Genel Bilgi" kartları — nötr "talep" der.
  ["web", "panel.requests.generalInfoTab"],
  ["api", "companyListings.bidImport"],
  ["email", "tenderExternalInvite"],
  ["email", "tenderInviteDigest"],
];

function strings(node: MessageTree | string, prefix: string, out: Array<[string, string]> = []) {
  if (typeof node === "string") out.push([prefix, node]);
  else for (const [k, v] of Object.entries(node)) strings(v, `${prefix}.${k}`, out);
  return out;
}

describe("tedarikçi metinleri — alım talebi terimi", () => {
  it.each(SUPPLIER_ONLY)("%s:%s 'satın alma talebi' içermez", (ns, root) => {
    const node = root
      .split(".")
      .reduce<MessageTree | string | undefined>(
        (acc, k) => (acc && typeof acc === "object" ? acc[k] : undefined),
        rawMessages("tr", ns),
      );
    expect(node, `${ns}:${root} bulunamadı`).toBeDefined();
    const offenders = strings(node!, root).filter(([, v]) => /satın alma tale[bp]/i.test(v));
    expect(offenders).toEqual([]);
  });
});
