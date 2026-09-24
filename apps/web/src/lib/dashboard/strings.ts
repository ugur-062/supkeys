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
 */
export const ACTION_ROWS: Record<
  "satinalma" | "satis",
  Record<string, { textKey: string; href: string }>
> = {
  satinalma: {
    overduePayments: {
      textKey: "satinalma.overduePayments",
      href: "/company/satinalma/siparisler",
    },
    overdueDeliveries: {
      textKey: "satinalma.overdueDeliveries",
      href: "/company/satinalma/siparisler",
    },
    zeroBidClosingSoon: {
      textKey: "satinalma.zeroBidClosingSoon",
      href: "/company/satinalma/taleplerim",
    },
    closingSoon: {
      textKey: "satinalma.closingSoon",
      href: "/company/satinalma/taleplerim",
    },
    awaitingDecision: {
      textKey: "satinalma.awaitingDecision",
      href: "/company/satinalma/taleplerim",
    },
    pendingApprovals: {
      textKey: "satinalma.pendingApprovals",
      href: "/company/onaylar",
    },
    sellerApproval: {
      textKey: "satinalma.sellerApproval",
      href: "/company/satinalma/siparisler",
    },
    receiveOrders: {
      textKey: "satinalma.receiveOrders",
      href: "/company/satinalma/siparisler",
    },
    paymentWindow: {
      textKey: "satinalma.paymentWindow",
      href: "/company/satinalma/siparisler",
    },
    messages: {
      textKey: "satinalma.messages",
      href: "/company/mesajlar",
    },
  },
  satis: {
    overdueDeliveries: {
      textKey: "satis.overdueDeliveries",
      href: "/company/satis/siparisler",
    },
    unansweredInvites: {
      textKey: "satis.unansweredInvites",
      href: "/company/satis#acik-talepler",
    },
    expiringBids: {
      textKey: "satis.expiringBids",
      href: "/company/satis/tekliflerim",
    },
    pendingOrders: {
      textKey: "satis.pendingOrders",
      href: "/company/satis/siparisler",
    },
    // Ürünlerime gelen, henüz yanıtlanmamış sorular — karşıda bir alıcı
    // bekliyor (uç: action-center `unansweredInquiries`).
    unansweredInquiries: {
      textKey: "satis.unansweredInquiries",
      href: "/company/satis/bilgi-talepleri",
    },
    paymentWindow: {
      textKey: "satis.paymentWindow",
      href: "/company/satis/siparisler",
    },
    messages: {
      textKey: "satis.messages",
      href: "/company/mesajlar",
    },
  },
};
