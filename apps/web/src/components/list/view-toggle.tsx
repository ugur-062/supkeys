"use client";

import { cn } from "@/lib/utils";
import { LayoutGrid, Table2 } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * P2 (frontend denetimi §10.2) — liste sayfalarında kart/tablo görünüm
 * anahtarı. Az kayıtta kart (tarama), çok kayıtta yoğun tablo (karşılaştırma).
 * Tercih localStorage'da liste-başına saklanır (SSR-güvenli: ilk render kart,
 * mount'ta okunur).
 */
export type ListView = "cards" | "table";

export function useListView(storageKey: string) {
  const [view, setView] = useState<ListView>("cards");
  useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "table") setView("table");
    } catch {
      /* gizli mod vb. — varsayılan kart */
    }
  }, [storageKey]);
  const set = (v: ListView) => {
    setView(v);
    try {
      localStorage.setItem(storageKey, v);
    } catch {
      /* kalıcılık olmadan devam */
    }
  };
  return [view, set] as const;
}

export function ViewToggle({
  view,
  onChange,
  className,
}: {
  view: ListView;
  onChange: (v: ListView) => void;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label="Görünüm"
      className={cn("flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5", className)}
    >
      {(
        [
          ["cards", "Kart görünümü", LayoutGrid],
          ["table", "Tablo görünümü", Table2],
        ] as const
      ).map(([key, label, Icon]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-label={label}
          aria-pressed={view === key}
          title={label}
          className={cn(
            "flex size-7 items-center justify-center rounded-md transition",
            view === key
              ? "bg-white text-zinc-900 shadow-sm"
              : "text-zinc-400 hover:text-zinc-700",
          )}
        >
          <Icon className="size-4" aria-hidden />
        </button>
      ))}
    </div>
  );
}
