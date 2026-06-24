// V2-7+ — Şablon tipleri (backend response'larıyla uyumlu).

export type QuestionAnswerType = "TEXT" | "NUMBER" | "YES_NO" | "DATE";

export interface QuestionTemplateListItem {
  id: string;
  name: string;
  isPublic: boolean;
  autoApply: boolean;
  itemCount: number;
  createdBy: { id: string; firstName: string; lastName: string };
  isOwnedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionTemplateItem {
  id: string;
  text: string;
  required: boolean;
  answerType: QuestionAnswerType;
  orderIndex: number;
}

export interface QuestionTemplateDetail {
  id: string;
  name: string;
  isPublic: boolean;
  autoApply: boolean;
  items: QuestionTemplateItem[];
  createdBy: { id: string; firstName: string; lastName: string };
  isOwnedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierTemplateListItem {
  id: string;
  name: string;
  isPublic: boolean;
  memberCount: number;
  createdBy: { id: string; firstName: string; lastName: string };
  isOwnedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierTemplateDetail {
  id: string;
  name: string;
  isPublic: boolean;
  isOwnedByMe: boolean;
  suppliers: Array<{
    id: string;
    companyName: string;
    taxNumber: string;
    city: string;
    district: string;
    membership: "STANDARD" | "PREMIUM";
  }>;
  createdBy: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

// ----------------- İHALE ŞABLONU (madde 34) -----------------

export interface TenderTemplateListItem {
  id: string;
  name: string;
  isOwnedByMe: boolean;
  createdBy: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}

export interface TenderTemplateDetail {
  id: string;
  name: string;
  /** Wizard form verisinin JSON blob'u (TenderFormData şekli). */
  data: Record<string, unknown>;
  createdBy: { id: string; firstName: string; lastName: string };
  createdAt: string;
  updatedAt: string;
}
