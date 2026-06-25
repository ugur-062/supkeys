import { PageHeader } from "@/components/list";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PublicProfileEditor } from "./_components/public-profile-editor";

export const metadata: Metadata = {
  title: "Herkese Açık Profil",
};

export default function PublicProfileEditPage() {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link
        href="/supplier/profil"
        className="text-sm text-slate-500 hover:text-zinc-600 inline-flex items-center gap-1"
      >
        <ChevronLeft className="h-4 w-4" />
        Profilime Dön
      </Link>
      <PageHeader
        title="Herkese Açık Profil"
        description="Google'da ve Rothern profilinizde görünecek bilgileri düzenleyin."
      />
      <PublicProfileEditor />
    </div>
  );
}
