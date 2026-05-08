import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Onay Bekleyenler — Supkeys",
};

export default function OnayBekleyenlerPage() {
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="bg-brand-50 border border-brand-200 rounded-2xl p-8 text-center">
        <div className="h-16 w-16 mx-auto bg-brand-100 rounded-2xl flex items-center justify-center mb-4">
          <ClipboardCheck className="h-8 w-8 text-brand-600" />
        </div>
        <h1 className="text-2xl font-display font-bold text-brand-900">
          Onay Bekleyenler
        </h1>
        <p className="text-slate-600 mt-2 leading-relaxed">
          Bu özellik şu an geliştirilme aşamasında. Yakında onay zincirleri
          aktifleşecek; sizin onayınızı bekleyen ihale, sipariş ve tedarikçi
          başvuruları burada listelenecek.
        </p>
        <div className="mt-6">
          <Link href="/dashboard">
            <Button variant="secondary">Dashboard&apos;a Dön</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
