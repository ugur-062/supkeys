import { PermissionGuard } from "@/components/auth/permission-guard";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, GitCompare, TrendingUp } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Raporlar — Supkeys",
};

const REPORTS = [
  {
    href: "/dashboard/raporlar/genel",
    label: "Genel İhale Raporu",
    description: "Tek ihale veya tarih aralığında ihalelerinizi listeleyin.",
    icon: FileText,
  },
  {
    href: "/dashboard/raporlar/tasarruf",
    label: "Tasarruf Raporu",
    description: "Hedef fiyatla kazanan teklif arasındaki tasarrufu görün.",
    icon: TrendingUp,
  },
  {
    href: "/dashboard/raporlar/teklif-karsilastirma",
    label: "Teklif Karşılaştırma Raporu",
    description: "Bir ihaleye gelen teklifleri kalem bazlı karşılaştırın.",
    icon: GitCompare,
  },
];

export default function RaporlarPage() {
  return (
    <PermissionGuard permission="reports:view">
      <div className="max-w-4xl mx-auto space-y-6">
        <header>
          <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900">
            Raporlar
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Bir rapor tipi seçin, kriterleri doldurun ve sonucu web'de
            görüntüleyin ya da Excel olarak indirin.
          </p>
        </header>

        <ul className="space-y-3">
          {REPORTS.map((r) => (
            <li key={r.href}>
              <Link
                href={r.href}
                className="card group flex items-center gap-4 p-5 hover:border-brand-300 hover:shadow-md transition-all"
              >
                <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0 group-hover:bg-brand-100">
                  <r.icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-brand-900">{r.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PermissionGuard>
  );
}
