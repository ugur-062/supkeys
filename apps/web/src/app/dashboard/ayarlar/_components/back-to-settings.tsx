import { ChevronLeft } from "lucide-react";
import Link from "next/link";

export function BackToSettings() {
  return (
    <Link
      href="/dashboard/ayarlar"
      className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
    >
      <ChevronLeft className="h-4 w-4" />
      Ayarlar
    </Link>
  );
}
