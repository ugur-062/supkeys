"use client";

import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import { MEMBERSHIP_LABEL } from "@/lib/supplier/membership";
import { cn } from "@/lib/utils";
import { Award, Building2 } from "lucide-react";

interface CompanyCardProps {
  collapsed: boolean;
}

export function CompanyCard({ collapsed }: CompanyCardProps) {
  const { supplier } = useSupplierAuth();

  if (!supplier) {
    return (
      <div className="px-4 py-5 border-b border-surface-border">
        <div className="h-12 w-12 rounded-xl bg-slate-100 mx-auto flex items-center justify-center">
          <Building2 className="h-6 w-6 text-slate-400" />
        </div>
      </div>
    );
  }

  const isPremium = supplier.membership === "PREMIUM";

  if (collapsed) {
    return (
      <div
        className="px-2 py-4 border-b border-surface-border flex flex-col items-center gap-2"
        title={`${supplier.companyName} — ${MEMBERSHIP_LABEL[supplier.membership]}`}
      >
        <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center">
          <Building2 className="h-5 w-5 text-slate-400" />
        </div>
        <span
          className={cn(
            "inline-flex items-center justify-center w-7 h-5 rounded-md text-[10px] font-bold",
            isPremium
              ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
              : "bg-slate-100 text-slate-600 border border-slate-200",
          )}
        >
          <Award className="h-3 w-3" />
        </span>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 border-b border-surface-border">
      <div className="h-12 w-12 rounded-xl bg-slate-100 mx-auto flex items-center justify-center mb-2">
        <Building2 className="h-6 w-6 text-slate-400" />
      </div>
      <p className="text-center font-bold text-brand-900 text-sm truncate">
        {supplier.companyName}
      </p>
      <div className="flex justify-center mt-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide",
            isPremium
              ? "bg-yellow-50 text-yellow-700 border border-yellow-200"
              : "bg-slate-100 text-slate-600 border border-slate-200",
          )}
        >
          <Award className="h-3 w-3" />
          {MEMBERSHIP_LABEL[supplier.membership]}
        </span>
      </div>
    </div>
  );
}
