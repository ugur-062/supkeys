/**
 * Panel metinleri — TEK modül. Projede i18n altyapısı henüz yok (next-intl
 * greenfield, ayrı iş); tüm panel metinleri burada toplanır ki i18n geçişinde
 * tek noktadan taşınsın. Bileşen içine serbest metin YAZMA.
 */
import { numberPossessive } from "@/lib/turkish";

export const DASH = {
  // Zaman tasarrufu şeridi/bölümü/kriter penceresi metinleri KALDIRILDI
  // (2026-09-10, kullanıcı kararı: Şirketim'de gerek yok). API ucu duruyor.
  heroWinTitle: (pct: string) => `%${pct} kazanma oranı`,
  heroWinSupport: (won: number, total: number) =>
    `karara bağlanan ${total} teklifin ${won}${numberPossessive(won)} kazandı`,
  heroWinEmptyTitle: "Kazanma oranınız burada görünecek",
  heroWinEmptyBody:
    "Açık satın alma taleplerine teklif verip sonuç aldıkça kazanma oranınız ve trendiniz burada birikecek.",
  heroWinEmptyCta: "Açık Taleplere Göz At",
  quarterCostNote:
    "Maliyet kırılımında çeyrek dönemi henüz yok — yıl verisi gösteriliyor.",
  actionTitle: "Bekleyen İşler",
  actionEmpty: "Bekleyen bir işiniz yok.",
  actionShowAll: (n: number) => `Tümünü gör (${n})`,
  actionShowLess: "Daha az göster",
} as const;

/** Aksiyon Merkezi satır metin haritası — anahtarlar backend
 * ActionCenterService satır key'leriyle birebir. (Satırın tamamı
 * tıklanabilir; ayrı CTA etiketi kaldırıldı, 2026-08-03.) */
export const ACTION_ROWS: Record<
  "satinalma" | "satis",
  Record<string, { text: string; href: string }>
> = {
  satinalma: {
    overduePayments: {
      text: "siparişin ödemesi gecikti",
      href: "/company/satinalma/siparisler",
    },
    overdueDeliveries: {
      text: "siparişin teslim tarihi geçti",
      href: "/company/satinalma/siparisler",
    },
    zeroBidClosingSoon: {
      text: "satın alma talebiniz teklifsiz kapanmak üzere",
      href: "/company/satinalma/taleplerim",
    },
    closingSoon: {
      text: "satın alma talebiniz kapanmak üzere",
      href: "/company/satinalma/taleplerim",
    },
    awaitingDecision: {
      text: "satın alma talebinizde karar bekleyen teklif var",
      href: "/company/satinalma/taleplerim",
    },
    pendingApprovals: {
      text: "kazandırma onay bekliyor",
      href: "/company/onaylar",
    },
    sellerApproval: {
      text: "sipariş satıcı onayında",
      href: "/company/satinalma/siparisler",
    },
    receiveOrders: {
      text: "sipariş teslim almanızı bekliyor",
      href: "/company/satinalma/siparisler",
    },
    paymentWindow: {
      text: "siparişin ödemesi bekleniyor",
      href: "/company/satinalma/siparisler",
    },
    messages: {
      text: "okunmamış mesajınız var",
      href: "/company/mesajlar",
    },
  },
  satis: {
    overdueDeliveries: {
      text: "siparişin teslim tarihi geçti",
      href: "/company/satis/siparisler",
    },
    unansweredInvites: {
      text: "davete henüz teklif vermediniz",
      href: "/company/satis#acik-talepler",
    },
    expiringBids: {
      text: "teklifinizin geçerliliği dolmak üzere",
      href: "/company/satis/tekliflerim",
    },
    pendingOrders: {
      text: "sipariş onayınızı bekliyor",
      href: "/company/satis/siparisler",
    },
    // Ürünlerime gelen, henüz yanıtlanmamış sorular — karşıda bir alıcı
    // bekliyor (uç: action-center `unansweredInquiries`).
    unansweredInquiries: {
      text: "bilgi talebi yanıtınızı bekliyor",
      href: "/company/satis/bilgi-talepleri",
    },
    paymentWindow: {
      text: "siparişin ödemesi bekleniyor",
      href: "/company/satis/siparisler",
    },
    messages: {
      text: "okunmamış mesajınız var",
      href: "/company/mesajlar",
    },
  },
};
