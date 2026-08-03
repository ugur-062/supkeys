/**
 * Panel metinleri — TEK modül. Projede i18n altyapısı henüz yok (next-intl
 * greenfield, ayrı iş); tüm panel metinleri burada toplanır ki i18n geçişinde
 * tek noktadan taşınsın. Bileşen içine serbest metin YAZMA.
 */
export const DASH = {
  heroSavedTitle: (hours: string) => `~${hours} saat kazandın`,
  heroWorkDays: (d: string) => `≈ ${d} iş günü`,
  heroPeriod: { month: "bu ay", quarter: "bu çeyrek", year: "bu yıl" } as const,
  heroValue: (v: string) => `${v} değerinde`,
  heroEstimatedNote: "Tahmini değerdir — muhafazakâr hesaplanır.",
  heroHow: "Nasıl hesaplanıyor?",
  heroEmptyTitle: "Zaman tasarrufu burada birikecek",
  heroEmptyBody:
    "İlk ihaleni açıp teklif topladığında, mail'le yürütmeye kıyasla kazandığın süreyi burada göreceksin.",
  heroEmptyCta: "İhale Aç",
  heroWinTitle: (pct: string) => `%${pct} kazanma oranı`,
  heroWinSupport: (won: number, total: number) =>
    `karara bağlanan ${total} teklifin ${won}'i kazandı`,
  heroWinEmptyTitle: "Kazanma oranın burada görünecek",
  heroWinEmptyBody:
    "Açık ihalelere teklif verip sonuç aldıkça kazanma oranın ve trendin burada birikecek.",
  heroWinEmptyCta: "Açık İhalelere Göz At",
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
  actionEmpty: "Bekleyen bir işin yok.",
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
      text: "ihalen teklifsiz kapanmak üzere",
      href: "/company/satinalma/ihalelerim",
    },
    closingSoon: {
      text: "ihalen kapanmak üzere",
      href: "/company/satinalma/ihalelerim",
    },
    awaitingDecision: {
      text: "ihalende karar bekleyen teklif var",
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
      text: "sipariş teslim almanı bekliyor",
      href: "/company/satinalma/siparisler",
    },
    paymentWindow: {
      text: "siparişin ödemesi bekleniyor",
      href: "/company/satinalma/siparisler",
    },
    messages: {
      text: "okunmamış mesajın var",
      href: "/company/mesajlar",
    },
  },
  satis: {
    overdueDeliveries: {
      text: "siparişin teslim tarihi geçti",
      href: "/company/satis/siparisler",
    },
    unansweredInvites: {
      text: "davete henüz teklif vermedin",
      href: "/company/satis/acik-ihaleler",
    },
    expiringBids: {
      text: "teklifinin geçerliliği dolmak üzere",
      href: "/company/satis/tekliflerim",
    },
    pendingOrders: {
      text: "sipariş onayını bekliyor",
      href: "/company/satis/siparisler",
    },
    paymentWindow: {
      text: "siparişin ödemesi bekleniyor",
      href: "/company/satis/siparisler",
    },
    messages: {
      text: "okunmamış mesajın var",
      href: "/company/mesajlar",
    },
  },
};

export const PARAM_LABELS: Record<string, string> = {
  rfqMailPrepMin: "RFQ maili hazırlama (× davet)",
  followupMin: "Takip/hatırlatma (hesaba katılmaz)",
  bidToExcelMin: "Teklifi Excel'e işleme (× teklif)",
  bidItemFactor: "Kalem katsayısı",
  comparisonTableMin: "Karşılaştırma tablosu (× ihale)",
  revisionRoundMin: "Revizyon/pazarlık turu (× tur)",
  approvalLoopMin: "Onay mail döngüsü (× onay)",
  poPrepMin: "Sipariş (PO) hazırlama (× sipariş)",
};
