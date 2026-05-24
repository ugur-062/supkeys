// V2-7+ — Rapor tipleri (backend response schema'ları ile uyumlu).

export type ReportFormat = "json" | "pdf" | "xlsx";

export interface GeneralReportRow {
  id: string;
  tenderNumber: string;
  title: string;
  type: "RFQ" | "ENGLISH_AUCTION";
  status: string;
  currency: string;
  bidsCloseAt: string;
  publishedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  invitedCount: number;
  submittedBidCount: number;
  responseRate: number | null;
  estimatedTotal: number | null;
  winningTotal: number | null;
  winnerName: string | null;
  savings: number | null;
  roundNumber: number;
}

export interface GeneralReportResult {
  mode: "SINGLE" | "RANGE";
  generatedAt: string;
  rangeStart?: string;
  rangeEnd?: string;
  tenders: GeneralReportRow[];
  summary: {
    totalTenders: number;
    awardedTenders: number;
    cancelledTenders: number;
    statusBreakdown: Record<string, number>;
    totalInvited: number;
    totalSubmittedBids: number;
    overallResponseRate: number;
    avgBidsPerTender: number;
    totalEstimated: number;
    totalAwardedValue: number;
    totalSavings: number;
  };
}

export interface SavingsReportItem {
  name: string;
  unit: string;
  quantity: number;
  awardedQuantity: number | null;
  targetUnitPrice: number | null;
  winningUnitPrice: number | null;
  winnerName: string | null;
  itemTarget: number | null;
  itemActual: number | null;
  savings: number | null;
}

export interface SavingsReportRow {
  id: string;
  tenderNumber: string;
  title: string;
  currency: string;
  targetTotal: number;
  actualTotal: number;
  savings: number | null;
  savingsPct: number | null;
  winners: Array<{ name: string; total: number }>;
  items: SavingsReportItem[];
  awardedAt: string;
}

export interface SavingsReportResult {
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  currency: string | null;
  rows: SavingsReportRow[];
  summary: {
    totalTenders: number;
    grandTarget: number;
    grandActual: number;
    grandSavings: number;
    grandSavingsPct: number;
    avgSavingsPct: number;
    bestTender: {
      tenderNumber: string;
      title: string;
      savingsPct: number | null;
    } | null;
    worstTender: {
      tenderNumber: string;
      title: string;
      savingsPct: number | null;
    } | null;
    bySupplier: Array<{ name: string; awarded: number }>;
  };
}

export type ComparisonCriterion = "PRICE" | "ANSWERS" | "BOTH";

export interface BidComparisonItem {
  id: string;
  name: string;
  unit: string;
  quantity: number;
  targetUnitPrice: number | null;
  customQuestion: string | null;
  lowestUnitPrice: number | null;
  lowestSupplierId: string | null;
}

export interface BidComparisonSupplier {
  supplierId: string;
  companyName: string;
  submitted: boolean;
  status: string;
  totalAmount: number | null;
  bidCurrency: string | null;
  rank: number | null;
  savingsVsTarget: number | null;
  itemPrices: Array<{
    tenderItemId: string;
    unitPrice: number | null;
    totalPrice: number | null;
    isLowest: boolean;
    deltaVsTargetPct: number | null;
  }>;
  itemAnswers: Array<{
    tenderItemId: string;
    customAnswer: string | null;
  }>;
}

export interface BidComparisonRecommendedAward {
  tenderItemId: string;
  supplierId: string;
  supplierName: string;
  unitPrice: number;
}

export interface BidComparisonRound {
  tenderId: string;
  tenderNumber: string;
  roundNumber: number;
  title: string;
  currency: string;
  targetTotal: number;
  items: BidComparisonItem[];
  suppliers: BidComparisonSupplier[];
  recommendedAwards: BidComparisonRecommendedAward[];
}

export interface BidComparisonReportResult {
  generatedAt: string;
  includePrice: boolean;
  includeAnswers: boolean;
  includeAllRounds: boolean;
  includeNonBidders: boolean;
  showBidCurrencies: boolean;
  rounds: BidComparisonRound[];
}
