"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type {
  SupplierProfile,
  SupplierTenantRelation,
  SupplierUserDto,
} from "./types";

interface SupplierAuthState {
  token: string | null;
  supplierUser: SupplierUserDto | null;
  supplier: SupplierProfile | null;
  tenantRelations: SupplierTenantRelation[];
  isHydrated: boolean;

  setAuth: (data: {
    token: string;
    supplierUser: SupplierUserDto;
    supplier: SupplierProfile;
  }) => void;
  setMe: (data: {
    supplierUser: SupplierUserDto;
    supplier: SupplierProfile;
    tenantRelations: SupplierTenantRelation[];
  }) => void;
  clear: () => void;
  setHydrated: () => void;
}

export const useSupplierAuthStore = create<SupplierAuthState>()(
  persist(
    (set) => ({
      token: null,
      supplierUser: null,
      supplier: null,
      tenantRelations: [],
      isHydrated: false,
      setAuth: ({ token, supplierUser, supplier }) =>
        set({ token, supplierUser, supplier }),
      setMe: ({ supplierUser, supplier, tenantRelations }) =>
        set({ supplierUser, supplier, tenantRelations }),
      clear: () =>
        set({
          token: null,
          supplierUser: null,
          supplier: null,
          tenantRelations: [],
        }),
      setHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: "supkeys-supplier-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        token: state.token,
        supplierUser: state.supplierUser,
        supplier: state.supplier,
        tenantRelations: state.tenantRelations,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
