"use client";

import { RequestDefaultsForm } from "@/components/tenders/request-defaults-form";
import type { RequestDefaults } from "@rothern/shared";

/**
 * İLK TALEP KURULUMU — üç soru (kapsam · teslim · ödeme), 2026-09-09.
 * Profil de son talep de yoksa hızlı kartın üstünde bir kez sorulur; cevap
 * profile yazılır, bir daha sorulmaz. Sessiz varsayılan tuzağına karşı:
 * yanlış ödeme koşuluyla yayın olmasın.
 */
export function SetupCard({ value, onChange, onDone, saving }: { value: RequestDefaults; onChange: (v: RequestDefaults) => void; onDone: () => void; saving: boolean }) {
  return (
    <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5">
      <p className="text-sm font-semibold text-blue-950">İlk talebiniz — üç kısa soru</p>
      <p className="mt-0.5 text-xs text-blue-900/80">Bunları bir kez cevaplayın; sonraki taleplerde sormayız (Şablonlar › Talep Şartları’ndan değiştirilebilir).</p>
      <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-zinc-950/5">
        <RequestDefaultsForm value={value} onChange={onChange} compact only={["scope", "delivery", "payment"]} />
      </div>
      <button
        type="button"
        onClick={onDone}
        disabled={saving || !value.deliveryTerm}
        className="mt-3 rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "Kaydediliyor…" : "Kaydet ve devam et"}
      </button>
    </div>
  );
}
