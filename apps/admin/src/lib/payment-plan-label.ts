/** Ödeme planı + teslim şekli etiketleri — admin sipariş görünümü (web ile aynı
 *  Türkçe metinler; admin @rothern/shared'a bağlı olmadığından yerel kopya). */

const PAYMENT_CATEGORY_LABELS: Record<string, string> = {
  ADVANCE: "Peşin",
  DEFERRED: "Vadeli",
  OPEN_ACCOUNT: "Açık Hesap",
  MAL_MUKABILI: "Mal Mukabili",
  CHEQUE: "Çek",
  SENET: "Senet",
  LETTER_OF_CREDIT: "Akreditif",
  CASH_AGAINST_DOCS: "Vesaik Mukabili",
  CUSTOM: "Özel",
};

/** Ödeme planını tek satır özetle. */
export function formatPaymentPlanTr(p: {
  paymentCategory?: string | null;
  advancePercent?: number | null;
  paymentDays?: number | null;
  lcType?: string | null;
  lcConfirmed?: boolean | null;
}): string {
  const cat = p.paymentCategory ?? "OPEN_ACCOUNT";
  switch (cat) {
    case "ADVANCE": {
      const pct = p.advancePercent ?? 100;
      if (pct >= 100) return "Peşin (%100)";
      return p.paymentDays
        ? `Peşin %${pct} (kalan ${p.paymentDays} gün vadeli)`
        : `Peşin %${pct} (kalan teslim sonrası)`;
    }
    case "DEFERRED":
      return p.paymentDays ? `Vadeli — ${p.paymentDays} gün` : "Vadeli";
    case "OPEN_ACCOUNT":
      return "Açık Hesap (teslim sonrası)";
    case "MAL_MUKABILI":
      return p.paymentDays
        ? `Mal Mukabili — ${p.paymentDays} gün vadeli`
        : "Mal Mukabili (teslim sonrası)";
    case "CHEQUE":
      return p.paymentDays ? `Çek — ${p.paymentDays} gün vadeli` : "Çek";
    case "SENET":
      return p.paymentDays ? `Senet — ${p.paymentDays} gün vadeli` : "Senet";
    case "CASH_AGAINST_DOCS":
      return "Vesaik Mukabili (belge karşılığı)";
    case "LETTER_OF_CREDIT": {
      const t =
        p.lcType === "USANCE"
          ? p.paymentDays
            ? `Usance ${p.paymentDays} gün`
            : "Usance"
          : "Sight";
      return `Akreditif (${t}${p.lcConfirmed ? ", Teyitli" : ""})`;
    }
    case "CUSTOM":
      return "Özel ödeme koşulu";
    default:
      return PAYMENT_CATEGORY_LABELS[cat] ?? cat;
  }
}

const DELIVERY_TERM_LABELS: Record<string, string> = {
  DOMESTIC_DELIVERED: "Adrese teslim, indirilmiş",
  DOMESTIC_PICKUP: "Fabrika/Depo teslim (alıcı alır)",
  DOMESTIC_CARRIER_COLLECT: "Ambara/kargoya teslim (nakliye alıcıya)",
  DOMESTIC_ON_VEHICLE: "Adrese teslim, araç üstü",
  EXW: "EXW — tesiste teslim",
  FCA: "FCA — taşıyıcıya teslim",
  CPT: "CPT — taşıma ödenmiş",
  CIP: "CIP — taşıma + sigorta ödenmiş",
  DAP: "DAP — belirlenen yere teslim",
  DPU: "DPU — indirilmiş teslim",
  DDP: "DDP — gümrük ödenmiş teslim",
  FAS: "FAS — gemi yanına teslim",
  FOB: "FOB — gemiye yüklenmiş",
  CFR: "CFR — mal + navlun",
  CIF: "CIF — mal + navlun + sigorta",
};

export function deliveryTermLabelTr(term?: string | null): string {
  if (!term) return "—";
  return DELIVERY_TERM_LABELS[term] ?? term;
}
