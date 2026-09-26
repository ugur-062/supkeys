"use client";

import { useTranslations } from "next-intl";
import { useSaveAddress } from "@/hooks/use-company-addresses";
import { useCityLabel } from "@/i18n/domain";
import { TR_PROVINCES } from "@rothern/shared";
import { useState } from "react";
import { toast } from "sonner";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const INPUT = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15";

/**
 * SATIR İÇİ ADRES EKLEME — Ayarlar'a gitmeden (2026-09-09, kesinti giderme).
 * Dört alan (başlık, ülke, il/şehir, adres); kayıt TESLİMAT tipiyle açılır ve
 * seçili gelir. Ülke varsayılanı firmanın ülkesi (2026-09-27: eskiden ülke
 * "TR"ye SABİTTİ — Alman alıcının deposu Türkiye adresi olarak kaydediliyordu).
 * Türkiye'de 81 il listesi, diğer ülkelerde serbest şehir.
 */
export function AddressInline({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const t = useTranslations("web.panel.requests.addressInline");
  const cityLabel = useCityLabel();
  const save = useSaveAddress();
  const [title, setTitle] = useState(() => t("depo"));
  const companyCountry = useCompanyAuthStore((st) => st.company?.country) ?? "TR";
  const [country, setCountry] = useState(companyCountry);
  const [city, setCity] = useState("");
  const [line, setLine] = useState("");

  const submit = async () => {
    if (!title.trim() || !line.trim()) {
      toast.error(t("baslikVeAdresZorunlu"));
      return;
    }
    try {
      const created = (await save.mutateAsync({ type: "TESLIMAT", title: title.trim(), city: city.trim() || undefined, addressLine: line.trim(), country })) as { id: string };
      onCreated(created.id);
      toast.success(t("adresEklendi"));
    } catch {
      toast.error(t("adresKaydedilemedi"));
    }
  };

  return (
    <div className="mt-2 space-y-2 rounded-xl bg-zinc-50 p-3 ring-1 ring-zinc-950/5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("baslikDepoSantiye")} aria-label={t("adresBasligi")} className={INPUT} />
        <CountryCombobox
          value={country}
          ariaLabel={t("ulke")}
          onChange={(c) => {
            setCountry(c);
            setCity("");
          }}
        />
      </div>
      {country === "TR" ? (
        <select value={city} onChange={(e) => setCity(e.target.value)} aria-label={t("il")} className={INPUT}>
          <option value="">{t("ilSecin")}</option>
          {TR_PROVINCES.map((p) => (
            <option key={p.name} value={p.name}>{cityLabel(p.name)}</option>
          ))}
        </select>
      ) : (
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder={t("sehir")} aria-label={t("sehir")} maxLength={80} className={INPUT} />
      )}
      <input value={line} onChange={(e) => setLine(e.target.value)} placeholder={t("acikAdres")} aria-label={t("acikAdres")} className={INPUT} />
      <div className="flex gap-2">
        <button type="button" onClick={() => void submit()} disabled={save.isPending} className="rounded-full bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {t("adresiKaydet")}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900">
          {t("vazgec")}
        </button>
      </div>
    </div>
  );
}
