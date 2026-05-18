import { Eye } from "lucide-react";

interface Props {
  ownerName: string;
  context: "tender" | "order";
}

/**
 * Creator-based ACL banner — kullanıcı ihalenin/siparişin sahibi
 * değilse aksiyon yetkisinin olmadığını net şekilde belirtir.
 */
export function ReadOnlyBanner({ ownerName, context }: Props) {
  const noun = context === "tender" ? "ihale" : "sipariş";
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-slate-200">
        <Eye className="h-4 w-4 text-slate-500" />
      </div>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-700">
          Görüntüleme modu — bu {noun}{" "}
          <span className="text-brand-700">{ownerName}</span> tarafından
          yürütülüyor.
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          Detayları izleyebilir ve mesajlaşabilirsiniz, ancak işlem yetkiniz yoktur.
        </p>
      </div>
    </div>
  );
}
