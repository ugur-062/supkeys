"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input, InputGroup } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { ErrorState } from "@/components/ui/error-state";
import { useReportListingOptions } from "@/hooks/use-company-reports";

/** Arama kutusu yazımı bitince sunucuya gider (her tuşta istek yok). */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * RAPOR TALEP SEÇİCİSİ — Genel (tekil) ve Teklif Karşılaştırma raporları.
 *
 * Sunucu en yeni N talebi döner; eskiden liste sessizce 500'de kesiliyor,
 * 505 talepli firmada en eski talepler hiç seçilemiyordu (arayüz testi
 * webB-1:NEW-1). Artık:
 *  - numara/başlık araması sunucuda yapılır → her talep seçilebilir;
 *  - liste kesildiğinde bu açıkça yazılır ("en yeni N / toplam M");
 *  - seçili talep (URL'den geri yüklenen ya da aramadan önce seçilen)
 *    pencere dışında kalsa da listede tutulur (sunucu `selected`);
 *  - seçenekler OKUNAMADIYSA bu söylenir ve yeniden deneme sunulur (son canlı
 *    kontrol 2026-10-10, OUTF-5): eskiden kesintide kutu yalnız "— Seçin —"
 *    ile sessizce boş kalıyor, firmanın hiç talebi yokmuş gibi okunuyordu.
 */
export function ReportListingPicker({
  value,
  onChange,
  label,
  placeholder,
  excludeDrafts = false,
}: {
  value: string;
  onChange: (listingId: string) => void;
  label: string;
  placeholder: string;
  /** Taslakları sunucuda ele (Teklif Karşılaştırma). */
  excludeDrafts?: boolean;
}) {
  const t = useTranslations("web.panel.reports.listingPicker");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    const h = setTimeout(() => setQ(search.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(h);
  }, [search]);

  const options = useReportListingOptions({ q, selected: value, excludeDrafts });
  const page = options.data;
  const items = page?.items ?? [];
  // Okunamadı: gösterilecek seçenek yok ve istek düştü (boş liste DEĞİL).
  const failed = page === undefined && options.isError;

  let hint: string | null = null;
  if (page) {
    if (q && page.total === 0) {
      hint = t("eslesenYok");
    } else if (page.total > page.limit) {
      hint = q
        ? t("aramaKesildi", { shown: page.limit, total: page.total })
        : t("enYeniListeleniyor", { shown: page.limit, total: page.total });
    }
  }

  return (
    <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[minmax(0,1fr)_16rem]">
      <Field>
        <Label>{label}</Label>
        <Select value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{placeholder}</option>
          {items.map((o) => (
            <option key={o.id} value={o.id}>
              {o.tenderNumber} — {o.title}
            </option>
          ))}
        </Select>
      </Field>
      <InputGroup>
        <Search data-slot="icon" aria-hidden="true" />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          maxLength={120}
          // Erişilebilir ad: yer tutucu ad değildir (arayüz testi D-267).
          aria-label={t("aramaEtiketi")}
          placeholder={t("aramaYerTutucu")}
        />
      </InputGroup>
      {failed ? (
        <ErrorState
          compact
          className="sm:col-span-2"
          message={t("taleplerYuklenemedi")}
          onRetry={() => void options.refetch()}
        />
      ) : hint ? (
        <p role="status" className="text-xs text-zinc-500 sm:col-span-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
