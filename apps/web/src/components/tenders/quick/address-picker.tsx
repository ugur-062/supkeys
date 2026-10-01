"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { foldSearchText } from "@rothern/shared";
import type { CompanyAddress } from "@/hooks/use-company-addresses";
import { cn } from "@/lib/utils";
import { usePlaceLabel } from "@/i18n/domain";
import { CheckCircleIcon, MapPinIcon } from "@heroicons/react/20/solid";

/**
 * Kapalı görünümde en fazla bu kadar kart (seçili adres dahil). Sınırsız kart
 * listesi yüzlerce adresli firmada mobil sayfayı 31.000 px'e uzatıyordu
 * (arayüz testi D-150); fazlası "Tüm adresler" ile aranabilir, kaydırılabilir
 * listede.
 */
const COLLAPSED_LIMIT = 4;

/** Teslimat adresi — kart seçimi (select yerine): başlık, il, açık adres okunur. */
export function AddressPicker({
  addresses,
  value,
  onChange,
  onAdd,
  canAdd = true,
}: {
  addresses: CompanyAddress[];
  value: string;
  onChange: (id: string) => void;
  onAdd: () => void;
  /** Adres ekleme API'de `addresses:manage` ister — izinsiz kullanıcıya düğme çizilmez (D-042). */
  canAdd?: boolean;
}) {
  const t = useTranslations("web.panel.requests.addressPicker");
  const placeLabel = usePlaceLabel();
  const [expanded, setExpanded] = useState(false);
  const [q, setQ] = useState("");
  const list = addresses.filter((a) => a.type !== "FATURA");
  const many = list.length > COLLAPSED_LIMIT;

  let shown: CompanyAddress[];
  if (!many) {
    shown = list;
  } else if (expanded) {
    const needle = foldSearchText(q.trim());
    shown = needle
      ? list.filter((a) => foldSearchText([a.title, placeLabel(a), a.addressLine].filter(Boolean).join(" ")).includes(needle))
      : list;
  } else {
    // Seçili adres her zaman görünür kalır (listenin sonlarında olsa da).
    const selected = list.find((a) => a.id === value);
    const rest = list.filter((a) => a.id !== value).slice(0, selected ? COLLAPSED_LIMIT - 1 : COLLAPSED_LIMIT);
    shown = selected ? [selected, ...rest] : rest;
  }

  const pick = (id: string) => {
    onChange(id);
    if (expanded) {
      setExpanded(false);
      setQ("");
    }
  };

  return (
    <div className="space-y-2">
      {many && expanded ? (
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("adresAra")}
          aria-label={t("adresAra")}
          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
        />
      ) : null}
      <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", many && expanded && "max-h-96 overflow-y-auto p-0.5")}>
        {shown.map((a) => {
          const on = value === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => pick(a.id)}
              aria-pressed={on}
              className={cn("flex items-start gap-2.5 rounded-xl border p-3 text-left transition", on ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600" : "border-zinc-300 hover:bg-zinc-50")}
            >
              {on ? <CheckCircleIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-blue-600" /> : <MapPinIcon aria-hidden className="mt-0.5 size-5 shrink-0 text-zinc-400" />}
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-zinc-950">
                  {a.title}
                  {a.isDefault ? <span className="ml-1.5 rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium text-zinc-600">{t("varsayilan")}</span> : null}
                </span>
                <span className="block truncate text-xs text-zinc-600">{placeLabel(a) || "—"}</span>
                <span className="block truncate text-xs text-zinc-500">{a.addressLine}</span>
              </span>
            </button>
          );
        })}
        {many && expanded && shown.length === 0 ? <p className="px-1 py-2 text-sm text-zinc-500">{t("eslesenAdresYok")}</p> : null}
        {canAdd ? (
          <button type="button" onClick={onAdd} className="flex items-center justify-center rounded-xl border border-dashed border-zinc-300 p-3 text-sm font-medium text-zinc-700 hover:border-zinc-900 hover:text-zinc-900">
            {t("yeniAdres")}
          </button>
        ) : null}
      </div>
      {many ? (
        <button
          type="button"
          onClick={() => {
            setExpanded((v) => !v);
            setQ("");
          }}
          aria-expanded={expanded}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          {expanded ? t("dahaAzGoster") : t("tumAdresler", { n: list.length })}
        </button>
      ) : null}
    </div>
  );
}
