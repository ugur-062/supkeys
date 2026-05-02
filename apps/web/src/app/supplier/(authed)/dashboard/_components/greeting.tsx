"use client";

import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

export function SupplierGreeting() {
  const { supplierUser, supplier } = useSupplierAuth();
  const today = format(new Date(), "d MMMM yyyy, EEEE", { locale: tr });

  return (
    <div className="space-y-1">
      <p className="text-xs uppercase tracking-wider text-slate-400">{today}</p>
      <h1 className="text-3xl font-display font-bold text-brand-900">
        Hoş geldin, {supplierUser?.firstName ?? "—"} 👋
      </h1>
      <p className="text-slate-500">
        {supplier?.companyName
          ? `${supplier.companyName} hesabına genel bakış`
          : "Hesabınıza genel bakış"}
      </p>
    </div>
  );
}
