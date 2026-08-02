"use client";

import { Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

/**
 * P2 (frontend denetimi §9) — TEK IBAN gösterimi. Varsayılan maskeli
 * (`TR17 •••• •••• 8381`), "Göster" ile 4'lü gruplu tam IBAN; yanında
 * Kopyala (toast'lı — panoya HAM değer gider, boşluksuz). Her iki hâl
 * font-mono. Zaman çizelgesi gibi log yüzeylerinde IBAN hiç yazılmaz —
 * bu bileşen yalnız hesap gösterim yüzeyleri için.
 */
function grouped(iban: string): string {
  return iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}

function maskedForm(iban: string): string {
  const raw = iban.replace(/\s+/g, "");
  if (raw.length < 8) return raw;
  return `${raw.slice(0, 4)} •••• •••• ${raw.slice(-4)}`;
}

export function Iban({
  value,
  masked = true,
  className,
}: {
  value: string;
  /** false → daima açık (ör. hesabın sahibi kendi ayar sayfasında). */
  masked?: boolean;
  className?: string;
}) {
  const [shown, setShown] = useState(!masked);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value.replace(/\s+/g, ""));
      toast.success("IBAN kopyalandı");
    } catch {
      toast.error("Kopyalanamadı");
    }
  };
  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ""}`}>
      <span className="font-mono tabular-nums">
        {shown ? grouped(value) : maskedForm(value)}
      </span>
      {masked ? (
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? "IBAN'ı gizle" : "IBAN'ı göster"}
          title={shown ? "Gizle" : "Göster"}
          className="-m-1 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
        >
          {shown ? (
            <EyeOff className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
        </button>
      ) : null}
      <button
        type="button"
        onClick={copy}
        aria-label="IBAN'ı kopyala"
        title="Kopyala"
        className="-m-1 rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
      >
        <Copy className="size-3.5" aria-hidden />
      </button>
    </span>
  );
}
