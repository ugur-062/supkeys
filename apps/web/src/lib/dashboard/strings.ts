/**
 * Panel metinleri — TEK modül. Projede i18n altyapısı henüz yok (next-intl
 * greenfield, ayrı iş); tüm panel metinleri burada toplanır ki i18n geçişinde
 * tek noktadan taşınsın. Bileşen içine serbest metin YAZMA.
 */
import { numberPossessive } from "@/lib/turkish";

export const DASH = {
  heroSavedTitle: (hours: string) => `~${hours} saat kazandınız`,
  heroWorkDays: (d: string) => `≈ ${d} iş günü`,
  heroPeriod: { month: "bu ay", quarter: "bu çeyrek", year: "bu yıl" } as const,
  heroValue: (v: string) => `${v} değerinde`,
  heroEstimatedNote: "Tahmini değerdir — muhafazakâr hesaplanır.",
  heroHow: "Nasıl hesaplanıyor?",
  heroEmptyTitle: "Zaman tasarrufu burada birikecek",
  heroEmptyBody:
    "İlk satın alma talebinizi açıp teklif topladığınızda, mail'le yürütmeye kıyasla kazandığınız süreyi burada göreceksiniz.",
  heroEmptyCta: "Satın Alma Talebi Aç",
  heroWinTitle: (pct: string) => `%${pct} kazanma oranı`,
  heroWinSupport: (won: number, total: number) =>
    `karara bağlanan ${total} teklifin ${won}${numberPossessive(won)} kazandı`,
  heroWinEmptyTitle: "Kazanma oranınız burada görünecek",
  heroWinEmptyBody:
    "Açık satın alma taleplerine teklif verip sonuç aldıkça kazanma oranınız ve trendiniz burada birikecek.",
  heroWinEmptyCta: "Açık Taleplere Göz At",
  periodLabels: { month: "Bu Ay", quarter: "Bu Çeyrek", year: "Bu Yıl" },
  savingsTabCost: "Maliyet",
  savingsTabTime: "Zaman",
  timeBreakdownTitle: "Zaman kırılımı — adım bazında",
  timeBreakdownHint:
    "“Mail ile yapılsaydı” tahmini süre; sistemde geçen süre düşülmüş NET dakikalar. En az değerlerdir.",
  timeMeasuredTitle: "Ölçülen gerçek süreler (medyan)",
  timeMeasuredInvite: "Davet → ilk teklif",
  timeMeasuredAward: "Kapanış → karar",
  timeMeasuredOrder: "Karar → sipariş",
  criteriaTitle: "Nasıl hesaplanıyor?",
  criteriaIntro:
    "Zaman tasarrufu = “mail ile yürütülseydi” tahmini süresi − sistemde fiilen geçen süre. Yalnız gerçekleşen işler sayılır (gönderilmiş teklif, verilmiş karar, oluşmuş sipariş) ve sonuç aşağı yuvarlanır — bu yüzden “~” ve “en az” diliyle sunulur.",
  criteriaParamsTitle: "Birim süre parametreleri (dk)",
  criteriaParamNote:
    "Parametreler platform yönetiminden düzenlenebilir; firma bazında özelleştirilebilir. Hatırlatma parametresi, hatırlatma kaydı tutulmadığı için hesaba katılmaz.",
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
      href: "/company/satinalma/ihalelerim",
    },
    closingSoon: {
      text: "satın alma talebiniz kapanmak üzere",
      href: "/company/satinalma/ihalelerim",
    },
    awaitingDecision: {
      text: "satın alma talebinizde karar bekleyen teklif var",
      href: "/company/satinalma/ihalelerim",
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
      href: "/company/satis/acik-ihaleler",
    },
    expiringBids: {
      text: "teklifinizin geçerliliği dolmak üzere",
      href: "/company/satis/tekliflerim",
    },
    pendingOrders: {
      text: "sipariş onayınızı bekliyor",
      href: "/company/satis/siparisler",
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

export const PARAM_LABELS: Record<string, string> = {
  rfqMailPrepMin: "RFQ maili hazırlama (× davet)",
  followupMin: "Takip/hatırlatma (hesaba katılmaz)",
  bidToExcelMin: "Teklifi Excel'e işleme (× teklif)",
  bidItemFactor: "Kalem katsayısı",
  comparisonTableMin: "Karşılaştırma tablosu (× satın alma talebi)",
  revisionRoundMin: "Revizyon/pazarlık turu (× tur)",
  approvalLoopMin: "Onay mail döngüsü (× onay)",
  poPrepMin: "Sipariş (PO) hazırlama (× sipariş)",
};
