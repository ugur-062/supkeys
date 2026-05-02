"use client";

import { FileText } from "lucide-react";

interface Props {
  submitted: number;
  draft: number;
  total: number;
}

export function BidsTab({ submitted, draft, total }: Props) {
  return (
    <div className="card p-12 border border-dashed border-slate-200 text-center space-y-3">
      <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
        <FileText className="w-6 h-6 text-slate-400" />
      </div>
      <div>
        <p className="font-display font-bold text-lg text-brand-900">
          {total > 0 ? `${total} teklif alındı` : "Henüz teklif yok"}
        </p>
        <p className="text-sm text-slate-500 mt-1">
          {total > 0 ? (
            <>
              {submitted > 0 ? `${submitted} verildi` : null}
              {submitted > 0 && draft > 0 ? " · " : null}
              {draft > 0 ? `${draft} taslak` : null}
              <br />
              Detay görüntüleme E.4 sürümünde gelecek.
            </>
          ) : (
            "Tedarikçi teklifleri kapanış sonrası burada listelenecek."
          )}
        </p>
      </div>
      <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-warning-100 text-warning-700 text-xs font-semibold uppercase tracking-wide">
        Aşama E.4'te gelecek
      </span>
    </div>
  );
}
