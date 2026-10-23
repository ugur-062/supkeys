/**
 * Talep detayındaki "Gelen Teklifler" süzgeci (Tümü / Tamamına / Eksik) —
 * `?teklifler=` ile taşınır. Teklif detayına giden bağlantı ve oradan dönen
 * geri bağlantısı da aynı değeri taşır ki süzgeç uygulama içi gezinmede de
 * korunsun (arayüz testi D-109). Yalnız bilinen değerler kabul edilir.
 */
export type BidView = "all" | "complete" | "incomplete";

export function parseBidView(raw: string | null | undefined): BidView {
  return raw === "complete" || raw === "incomplete" ? raw : "all";
}

/** `?teklifler=…` sorgusu — "all" (varsayılan) için boş dize. */
export function bidViewQuery(view: BidView): string {
  return view === "all" ? "" : `?teklifler=${view}`;
}
