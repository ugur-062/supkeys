/**
 * AKSİYON MERKEZİ SATIR HARİTASI — backend `ActionCenterService` satır
 * anahtarlarıyla BİREBİR. (Satırın tamamı tıklanabilir; ayrı CTA etiketi
 * kaldırıldı, 2026-08-03.)
 *
 * i18n Faz 2: cümle KATALOGDA (`web.panel.shell.actionRows.<portal>.<anahtar>`),
 * burada yalnız anahtar + hedef rota var; metni çizen bileşen `t(textKey)` ile
 * basar (Şirketim › Bekleyen İşler ve eski Aksiyon Merkezi AYNI haritayı okur).
 * Haritada olmayan satır anahtarı ÇİZİLMEZ (bilinmeyen backend anahtarı
 * kullanıcıya ham görünmesin).
 *
 * Hedef = satırın kümesine SÜZÜLMÜŞ liste (arayüz testi O-035): listeler
 * `?status=` (virgüllü çoklu) okur; durum kümesi `ActionCenterService`'teki
 * satır süzgeciyle aynı. Gecikme/kapanış yaklaşan gibi türetilmiş kümeler
 * kendi parametresiyle süzülür (`?due=overdue`, `?closing=nobids|soon` —
 * tanımlar `derived-filters.ts`'te, backend satırıyla birebir).
 */
export const ACTION_ROWS: Record<
  "satinalma" | "satis",
  Record<string, { textKey: string; href: string }>
> = {
  satinalma: {
    overduePayments: {
      textKey: "satinalma.overduePayments",
      href: "/company/satinalma/siparisler?status=DELIVERED,COMPLETED",
    },
    overdueDeliveries: {
      textKey: "satinalma.overdueDeliveries",
      href: "/company/satinalma/siparisler?due=overdue",
    },
    zeroBidClosingSoon: {
      textKey: "satinalma.zeroBidClosingSoon",
      href: "/company/satinalma/taleplerim?closing=nobids",
    },
    closingSoon: {
      textKey: "satinalma.closingSoon",
      href: "/company/satinalma/taleplerim?closing=soon",
    },
    aiSuggestions: {
      textKey: "satinalma.aiSuggestions",
      href: "/company/satinalma/taleplerim?status=OPEN",
    },
    awaitingDecision: {
      textKey: "satinalma.awaitingDecision",
      href: "/company/satinalma/taleplerim?status=OPEN,IN_AWARD",
    },
    pendingApprovals: {
      textKey: "satinalma.pendingApprovals",
      href: "/company/onaylar",
    },
    sellerApproval: {
      textKey: "satinalma.sellerApproval",
      href: "/company/satinalma/siparisler?status=PENDING",
    },
    receiveOrders: {
      textKey: "satinalma.receiveOrders",
      href: "/company/satinalma/siparisler?status=IN_DELIVERY",
    },
    paymentWindow: {
      textKey: "satinalma.paymentWindow",
      href: "/company/satinalma/siparisler?status=DELIVERED,COMPLETED",
    },
    messages: {
      textKey: "satinalma.messages",
      href: "/company/mesajlar",
    },
  },
  satis: {
    overdueDeliveries: {
      textKey: "satis.overdueDeliveries",
      href: "/company/satis/siparisler?due=overdue",
    },
    unansweredInvites: {
      textKey: "satis.unansweredInvites",
      href: "/company/satis#acik-talepler",
    },
    expiringBids: {
      textKey: "satis.expiringBids",
      href: "/company/satis/tekliflerim?pending=1",
    },
    pendingOrders: {
      textKey: "satis.pendingOrders",
      href: "/company/satis/siparisler?status=PENDING",
    },
    // Ürünlerime gelen, henüz yanıtlanmamış sorular — karşıda bir alıcı
    // bekliyor (uç: action-center `unansweredInquiries`).
    unansweredInquiries: {
      textKey: "satis.unansweredInquiries",
      href: "/company/satis/bilgi-talepleri",
    },
    paymentWindow: {
      textKey: "satis.paymentWindow",
      href: "/company/satis/siparisler?status=DELIVERED",
    },
    messages: {
      textKey: "satis.messages",
      href: "/company/mesajlar",
    },
  },
};

/**
 * Alış siparişi listesinin KPI hedefleri — sayımla AYNI durum kümesi
 * (liste `?status=` virgüllü okur).
 * - delivered: "Teslim Aldım" siparişi doğrudan COMPLETED yapar; huni, vade
 *   ve nakit takvimi DELIVERED + COMPLETED'i birlikte sayar (arayüz testi
 *   O-032; eskiden yalnız DELIVERED → "0 sipariş").
 * - ongoing: `CompanyDashboardService.satinalma().ongoingOrders` (O-035).
 */
export const BUYER_ORDER_HREF = {
  delivered: "/company/satinalma/siparisler?status=DELIVERED,COMPLETED",
  ongoing: "/company/satinalma/siparisler?status=PENDING,ACCEPTED,IN_DELIVERY,DELIVERED",
} as const;

/**
 * Satış siparişi listesinin KPI hedefi — "Aktif Sipariş" sayısıyla AYNI küme
 * (`kpi-selectors.ts` `ORDER_ACTIVE`; listede seçilemeyen eski CREATED
 * dışarıda kalır). Eskiden süzgeçsiz listeye gidiyordu (O-035).
 */
export const SELLER_ORDER_HREF = {
  active: "/company/satis/siparisler?status=PENDING,ACCEPTED,IN_DELIVERY,DELIVERED",
} as const;

/**
 * Taleplerim KPI hedefleri. "Gelen Teklifler" teklif SAYAR, hedefi teklif
 * gelmiş açık talepler (`?status=OPEN&bids=1`) — "Açık Taleplerim"den ayrı
 * küme (O-035; eskiden ikisi aynı adresteydi).
 */
export const BUYER_TENDER_HREF = {
  open: "/company/satinalma/taleplerim?status=OPEN",
  bidsReceived: "/company/satinalma/taleplerim?status=OPEN&bids=1",
  awarded: "/company/satinalma/taleplerim?status=AWARDED",
} as const;
