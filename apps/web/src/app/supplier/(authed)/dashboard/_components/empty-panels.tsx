import { Activity, Calendar } from "lucide-react";

interface EmptyPanelProps {
  title: string;
  message: string;
  hint: string;
  Icon: React.ComponentType<{ className?: string }>;
}

function EmptyPanel({ title, message, hint, Icon }: EmptyPanelProps) {
  return (
    <section className="card p-6 flex flex-col items-center text-center min-h-[220px] justify-center">
      <div className="h-14 w-14 rounded-full bg-surface-muted flex items-center justify-center mb-3">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="font-display font-bold text-brand-900 text-base">
        {title}
      </h3>
      <p className="text-sm text-slate-700 mt-1 font-medium">{message}</p>
      <p className="text-xs text-slate-500 mt-1 max-w-xs leading-relaxed">
        {hint}
      </p>
    </section>
  );
}

export function SupplierEmptyPanels() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <EmptyPanel
        title="Bekleyen İhaleler"
        message="Henüz davet edildiğin ihale yok"
        hint="Bağlı olduğun alıcılar ihale açtığında burada görünecek."
        Icon={Calendar}
      />
      <EmptyPanel
        title="Son Aktiviteler"
        message="Henüz aktivite yok"
        hint="Teklifler, siparişler ve mesajlar burada listelenecek."
        Icon={Activity}
      />
    </div>
  );
}
