"use client";

import { useCompanyProfile, useUpdateCompanyProfile } from "@/hooks/use-company-profile";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { EyeIcon } from "@heroicons/react/20/solid";
import { toast } from "sonner";

/**
 * "ZİYARETLERİM KARŞI TARAFA GÖRÜNSÜN" — Ziyaret Edenler sayfasının başında
 * (2026-09-19, kullanıcı: Profilim'deki yeri "saçma duruyor"). Ayar, tam da
 * ilgili olduğu yerde: başkalarının ziyaretini burada görüyorsunuz, sizin
 * ziyaretinizin onlara nasıl göründüğü de burada ayarlanır. Anında kaydeder
 * (Profilim'deki "Kaydet" çubuğuna bağlı değil).
 */
export function VisitsVisibilityCard({ className }: { className?: string }) {
  const profile = useCompanyProfile();
  const update = useUpdateCompanyProfile();
  const on = profile.data?.visitsVisible ?? true;
  const busy = profile.isLoading || update.isPending;

  const toggle = async () => {
    try {
      await update.mutateAsync({ visitsVisible: !on });
      toast.success(!on ? "Ziyaretleriniz artık adınızla görünür" : "Ziyaretleriniz artık yalnız sayı olarak görünür");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Ayar kaydedilemedi"));
    }
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-4 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-zinc-950/5", className)}>
      <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-700">
        <EyeIcon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-950">Ziyaretlerim karşı tarafa görünsün</p>
        <p className="text-xs/5 text-zinc-500">
          İncelediğiniz firmalar, kendi Ziyaret Edenler listesinde firmanızı adıyla görür. Kapatırsanız ziyaretiniz yalnız sayı olarak kalır.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Ziyaretlerim karşı tarafa görünsün"
        disabled={busy}
        onClick={() => void toggle()}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50",
          on ? "bg-blue-600" : "bg-zinc-300",
        )}
      >
        <span aria-hidden className={cn("inline-block size-5 rounded-full bg-white shadow transition", on ? "translate-x-5.5" : "translate-x-0.5")} />
      </button>
    </div>
  );
}
