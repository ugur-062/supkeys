/**
 * V2-6 Dashboard mock data — gerçekçi rakamlar. Sonradan API'ye bağlanırken
 * bu dosya silinip her tab kendi hook'undan veriyi alacak şekilde değişir;
 * IhaleTab/TasarrufTab/TedarikciTab `data` prop'u üzerinden tüketir.
 */
import type { IhaleTabData } from "./ihale-tab";
import type { TasarrufTabData } from "./tasarruf-tab";
import type { TedarikciTabData } from "./tedarikci-tab";

export const MOCK_IHALE: IhaleTabData = {
  closedForBids: 63,
  inAward: 3,
  awarded: 41,
  ongoingOrders: 15,
  openTendersOwn: [],
  openTendersCompany: [],
};

export const MOCK_TASARRUF: TasarrufTabData = {
  month: {
    totalSavings: 236_035_909.5,
    totalVolume: 4_487_472_909.5,
    averageSavingsRate: 42.26,
  },
  year: {
    totalSavings: 901_808_742.27,
    totalVolume: 6_171_511_537.59,
    averageSavingsRate: 28.83,
  },
  topSavingsMonth: [
    {
      rank: 1,
      tenderNumber: "2462-1",
      title: "Oyak Enerji IT Sarf Malzeme",
      amount: 198_231_750,
    },
    {
      rank: 2,
      tenderNumber: "2407-1",
      title: "Devpan IT Sarf Malzeme",
      amount: 19_172_188,
    },
    {
      rank: 3,
      tenderNumber: "2435-1",
      title: "İÇDAŞ IT Sarf Malzeme",
      amount: 18_181_972,
    },
    {
      rank: 4,
      tenderNumber: "2453-1",
      title: "İNŞAAT MALZEMELERİ 1304 İhalesi",
      amount: 450_000,
    },
    {
      rank: 5,
      tenderNumber: "1981-1",
      title: "Kırtasiye Alımları",
      amount: 0,
    },
  ],
  topSavingsYear: [
    {
      rank: 1,
      tenderNumber: "2462-1",
      title: "Oyak Enerji IT Sarf Malzeme",
      amount: 412_584_125,
    },
    {
      rank: 2,
      tenderNumber: "2401-3",
      title: "Tekstil Hammadde Alımı",
      amount: 154_223_900,
    },
    {
      rank: 3,
      tenderNumber: "2407-1",
      title: "Devpan IT Sarf Malzeme",
      amount: 84_900_312,
    },
    {
      rank: 4,
      tenderNumber: "2435-1",
      title: "İÇDAŞ IT Sarf Malzeme",
      amount: 73_281_212,
    },
    {
      rank: 5,
      tenderNumber: "2298-2",
      title: "Lojistik Hizmet Alımı",
      amount: 26_400_500,
    },
  ],
  categoryMonth: [
    {
      label: "Endüstriyel İmalat ve İşleme Makineleri ve Aksesuarları",
      percent: 97.78,
    },
    {
      label: "Yapı, Bina, İnşaat ve İmalat Bileşenleri ve Malzemeleri",
      percent: 97.78,
    },
    {
      label: "Bilgi Teknolojileri Yayıncılığı ve Telekomünikasyon",
      percent: 61.53,
    },
  ],
  categoryYear: [
    {
      label: "Endüstriyel İmalat ve İşleme Makineleri ve Aksesuarları",
      percent: 78.12,
    },
    {
      label: "Yapı, Bina, İnşaat ve İmalat Bileşenleri ve Malzemeleri",
      percent: 64.05,
    },
    {
      label: "Bilgi Teknolojileri Yayıncılığı ve Telekomünikasyon",
      percent: 38.4,
    },
    { label: "Lojistik ve Nakliye Hizmetleri", percent: 22.7 },
  ],
  currencyMonth: [
    { label: "TRY", percent: 42.25 },
    { label: "Ana Para Birimi 2" },
    { label: "Ana Para Birimi 3" },
  ],
  currencyYear: [
    { label: "TRY", percent: 28.83 },
    { label: "USD", percent: 14.2 },
    { label: "Ana Para Birimi 3" },
  ],
};

export const MOCK_TEDARIKCI: TedarikciTabData = {
  uniqueBiddersMonth: { fromPool: 0, totalLabel: "Toplam Teklif Veren: 3" },
  uniqueBiddersYear: { fromPool: 4, totalLabel: "Toplam Teklif Veren: 27" },
  bidsCountMonth: { fromPool: 0, totalLabel: "Toplam Teklif: 22" },
  bidsCountYear: { fromPool: 18, totalLabel: "Toplam Teklif: 184" },
  averageBidsMonth: {
    fromPool: 0,
    totalLabel: "Tüm Tekliflerin Ortalaması: 2,20",
  },
  averageBidsYear: {
    fromPool: 0,
    totalLabel: "Tüm Tekliflerin Ortalaması: 2,84",
  },
  topSuppliersMonth: [
    {
      rank: 1,
      shortName: "CLE...",
      tendersBidOn: 7,
      averageRank: 1.42,
      totalBids: 12,
    },
    {
      rank: 2,
      shortName: "KAR...",
      tendersBidOn: 6,
      averageRank: 1.4,
      totalBids: 8,
    },
    {
      rank: 3,
      shortName: "YEL...",
      tendersBidOn: 2,
      averageRank: 1.67,
      totalBids: 2,
    },
  ],
  topSuppliersYear: [
    {
      rank: 1,
      shortName: "CLE...",
      tendersBidOn: 23,
      averageRank: 1.38,
      totalBids: 41,
    },
    {
      rank: 2,
      shortName: "KAR...",
      tendersBidOn: 18,
      averageRank: 1.52,
      totalBids: 32,
    },
    {
      rank: 3,
      shortName: "YEL...",
      tendersBidOn: 11,
      averageRank: 1.81,
      totalBids: 14,
    },
    {
      rank: 4,
      shortName: "ANK...",
      tendersBidOn: 9,
      averageRank: 2.11,
      totalBids: 12,
    },
  ],
  competitiveMonth: {
    tenderNumber: "2435-2",
    title: "İÇDAŞ IT Sarf Malzeme",
    bidderCount: 2,
    distribution: [
      { id: "t1", count: 1 },
      { id: "t2", count: 1 },
      { id: "t3", count: 2, highlight: true },
      { id: "t4", count: 1 },
      { id: "t5", count: 1 },
      { id: "t6", count: 1 },
      { id: "t7", count: 1 },
    ],
  },
  competitiveYear: {
    tenderNumber: "2298-1",
    title: "Lojistik Hizmet Alımı",
    bidderCount: 5,
    distribution: [
      { id: "t1", count: 2 },
      { id: "t2", count: 3 },
      { id: "t3", count: 5, highlight: true },
      { id: "t4", count: 2 },
      { id: "t5", count: 3 },
      { id: "t6", count: 1 },
    ],
  },
};
