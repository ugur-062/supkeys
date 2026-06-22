export type VerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";
export type OwnerType = "tenant" | "supplier";

export interface CompanyVerificationListItem {
  ownerType: OwnerType;
  id: string;
  name: string;
  status: VerificationStatus;
  verifiedAt: string | null;
  updatedAt: string;
}

export interface VerificationDoc {
  docType: string;
  uploaded: boolean;
  url: string | null;
}

export interface CompanyVerificationDetail {
  ownerType: OwnerType;
  id: string;
  name: string;
  legalName: string | null;
  companyType: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  authorizedTckn: string | null;
  authorizedTitle: string | null;
  mersisNo: string | null;
  tradeRegistryNo: string | null;
  kepAddress: string | null;
  iban: string | null;
  ibanHolder: string | null;
  companyVerificationStatus: VerificationStatus;
  companyVerifiedAt: string | null;
  docs: VerificationDoc[];
  allUploaded: boolean;
}

export interface CompanyVerificationListResponse {
  items: CompanyVerificationListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
