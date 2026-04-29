import { cn } from "@/lib/utils";

export function SupkeysLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-brand-600 text-white font-display font-bold text-lg">
        S
      </div>
      <div className="flex items-baseline gap-0.5">
        <span className="font-display font-bold text-xl text-brand-900">sup</span>
        <span className="font-display font-bold text-xl text-brand-600">keys</span>
      </div>
    </div>
  );
}
