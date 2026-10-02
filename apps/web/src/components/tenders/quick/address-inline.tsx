"use client";

import { useTranslations } from "next-intl";
import { useSaveAddress } from "@/hooks/use-company-addresses";
import { useCityLabel } from "@/i18n/domain";
import { TR_PROVINCES } from "@rothern/shared";
import { useState } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { toast } from "sonner";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { CityCombobox } from "@/components/ui/city-combobox";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";

const INPUT = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15";

/**
 * SATIR İÇİ ADRES EKLEME — Ayarlar'a gitmeden (2026-09-09, kesinti giderme).
 * Dört alan (başlık, ülke, il/şehir, adres); kayıt TESLİMAT tipiyle açılır ve
 * seçili gelir. Ülke varsayılanı firmanın ülkesi (2026-09-27: eskiden ülke
 * "TR"ye SABİTTİ — Alman alıcının deposu Türkiye adresi olarak kaydediliyordu).
 * Türkiye'de 81 il listesi, diğer ülkelerde dünya şehir listesinden öneri
 * (serbest yazım da açık).
 */
export function AddressInline({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const t = useTranslations("web.panel.requests.addressInline");
  const cityLabel = useCityLabel();
  const save = useSaveAddress();
  const [title, setTitle] = useState(() => t("depo"));
  const companyCountry = useCompanyAuthStore((st) => st.company?.country) ?? "TR";
  const [country, setCountry] = useState(companyCountry);
  const [city, setCity] = useState("");
  const [cityId, setCityId] = useState<number | null>(null);
  const [line, setLine] = useState("");
  // Çift tık iki aynı adres açmasın (arayüz testi FX-00 D-040).
  const lock = useSubmitLock();

  const submit = () => lock.run(doSubmit);
  const doSubmit = async () => {
    if (!title.trim() || !line.trim()) {
      toast.error(t("baslikVeAdresZorunlu"));
      return;
    }
    try {
      const created = (await save.mutateAsync({ type: "TESLIMAT", title: title.trim(), city: city.trim() || undefined, cityId: cityId ?? undefined, addressLine: line.trim(), country })) as { id: string };
      onCreated(created.id);
      toast.success(t("adresEklendi"));
    } catch (err) {
      // Sunucu nedeni (ör. 200 adres tavanı) global toast'la AYNI metinle →
      // tekilleştirici ikinciyi yutar; genel metin yalnız neden yoksa
      // (eskiden "Adres kaydedilemedi" + neden: iki toast).
      toast.error(extractErrorMessage(err, t("adresKaydedilemedi")));
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
            setCityId(null);
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
        <CityCombobox
          country={country}
          value={city}
          ariaLabel={t("sehir")}
          placeholder={t("sehir")}
          onChange={(next) => {
            setCity(next.city);
            setCityId(next.cityId);
          }}
        />
      )}
      <input value={line} onChange={(e) => setLine(e.target.value)} placeholder={t("acikAdres")} aria-label={t("acikAdres")} className={INPUT} />
      <div className="flex gap-2">
        <button type="button" onClick={() => void submit()} disabled={save.isPending || lock.locked} className="rounded-full bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {t("adresiKaydet")}
        </button>
        <button type="button" onClick={onCancel} className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 hover:text-zinc-900">
          {t("vazgec")}
        </button>
      </div>
    </div>
  );
}
