export type AddressType = "FATURA" | "ILETISIM" | "TESLIMAT";

export interface TenantAddress {
  id: string;
  tenantId: string;
  type: AddressType;
  title: string;
  country: string;
  state: string | null;
  city: string;
  district: string;
  fullAddress: string;
  postalCode: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  isActive: boolean;
  isDefault: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddressSnapshot {
  id: string;
  type: AddressType;
  title: string;
  country: string;
  state: string | null;
  city: string;
  district: string;
  fullAddress: string;
  postalCode: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  snapshotAt: string;
}

export interface CreateAddressPayload {
  type: AddressType;
  title: string;
  country: string;
  state?: string;
  city: string;
  district: string;
  fullAddress: string;
  postalCode?: string;
  taxOffice?: string;
  taxNumber?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  isDefault?: boolean;
  notes?: string;
}

export type UpdateAddressPayload = Partial<
  Omit<CreateAddressPayload, "type">
> & {
  isActive?: boolean;
};

export interface AddressTypeMeta {
  label: string;
  shortLabel: string;
  description: string;
  emoji: string;
  pillClass: string;
}

export const ADDRESS_TYPE_META: Record<AddressType, AddressTypeMeta> = {
  FATURA: {
    label: "Fatura Adresleri",
    shortLabel: "Fatura",
    description:
      "Tedarikçilerin fatura keseceği adresler. Vergi Dairesi + VKN zorunlu.",
    emoji: "📄",
    pillClass: "bg-purple-50 text-purple-700 border-purple-200",
  },
  ILETISIM: {
    label: "İletişim Adresleri",
    shortLabel: "İletişim",
    description: "Genel iletişim ve yazışma adresleri.",
    emoji: "✉️",
    pillClass: "bg-brand-50 text-brand-700 border-brand-200",
  },
  TESLIMAT: {
    label: "Teslimat Adresleri",
    shortLabel: "Teslimat",
    description:
      "Tedarikçilerin malları teslim edeceği adresler. İhalede dropdown'da kullanılır.",
    emoji: "📦",
    pillClass: "bg-success-50 text-success-700 border-success-200",
  },
};
