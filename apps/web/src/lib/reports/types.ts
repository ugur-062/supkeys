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
  winningTotal: number | null;
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
    totalAwardedValue: number;
  };
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
}

export interface BidComparisonSupplier {
  supplierId: string;
  companyName: string;
  submitted: boolean;
  status: string;
  totalAmount: number | null;
  bidCurrency: string | null;
  itemPrices: Array<{
    tenderItemId: string;
    unitPrice: number | null;
    totalPrice: number | null;
  }>;
  itemAnswers: Array<{
    tenderItemId: string;
    customAnswer: string | null;
  }>;
}

export interface BidComparisonRound {
  tenderId: string;
  tenderNumber: string;
  roundNumber: number;
  title: string;
  currency: string;
  items: BidComparisonItem[];
  suppliers: BidComparisonSupplier[];
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
