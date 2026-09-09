"use client";

import { useSaveAddress } from "@/hooks/use-company-addresses";
import { TR_PROVINCES } from "@rothern/shared";
import { useState } from "react";
import { toast } from "sonner";

const INPUT = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15";

/**
 * SATIR İÇİ ADRES EKLEME — Ayarlar'a gitmeden (2026-09-09, kesinti giderme).
 * Üç alan (başlık, il, adres); kayıt TESLİMAT tipiyle açılır ve seçili gelir.
 */
export function AddressInline({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const save = useSaveAddress();
  const [title, setTitle] = useState("Depo");
  const [city, setCity] = useState("");
  const [line, setLine] = useState("");

  const submit = async () => {
    if (!title.trim() || !line.trim()) {
      toast.error("Başlık ve adres zorunlu");
      return;
    }
    try {
      const created = (await save.mutateAsync({ type: "TESLIMAT", title: title.trim(), city: city || undefined, addressLine: line.trim(), country: "TR" })) as { id: string };
      onCreated(created.id);
      toast.success("Adres eklendi");
    } catch {
      toast.error("Adres kaydedilemedi");
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Başlık (Depo, Şantiye…)" aria-label="Adres başlığı" className={INPUT} />
        <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="İl" className={INPUT}>
          <option value="">İl seçin</option>
          {TR_PROVINCES.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
      </div>
      <input value={line} onChange={(e) => setLine(e.target.value)} placeholder="Açık adres" aria-label="Açık adres" className={INPUT} />
      <div className="flex gap-2">
        <button type="button" onClick={() => void submit()} disabled={save.isPending} className="rounded-full bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
          Adresi kaydet
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900">
          Vazgeç
        </button>
      </div>
    </div>
  );
}
