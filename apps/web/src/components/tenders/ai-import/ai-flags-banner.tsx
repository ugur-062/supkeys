"use client";

import { useTranslations } from "next-intl";
import { useAiTenderRefine } from "@/hooks/use-ai-tender-import";
import { mapAiDraftToForm } from "@/lib/tenders/map-ai-draft-to-form";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import type {
  AiFieldFlag,
  AiTenderDraft,
  AiTenderExtractResult,
} from "@rothern/shared";
import { ArrowUp, Loader2, Sparkles } from "lucide-react";
import { useRef, useState } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";

/** Bileşenin çevirmeni — `web.panel.requests.aiFlagsBanner` ad alanı. */
type BannerT = ReturnType<typeof useTranslations<"web.panel.requests.aiFlagsBanner">>;

/** Üst düzey alan adları (`alan.<yol>`); katalogda olmayan yol olduğu gibi. */
const TOP_FIELDS = ["title", "description", "primaryCurrency", "deliveryTerm", "paymentCategory", "paymentDays", "advancePercent", "bidsCloseAt", "termsAndConditions", "prices"] as const;
/** Kalem alanlarının doğal sırası — satırlar hep aynı düzende okunur (`kalemAlani.<ad>`). */
const ITEM_FIELD_ORDER = ["name", "quantity", "unit", "requiredByDate", "targetUnitPrice", "materialCode", "description"] as const;

/**
 * İşaretli alanları okunur satırlara indirger:
 *  - üst-düzey alanlar TEKİLLEŞTİRİLİR (aynı alan birden çok gerekçeyle
 *    işaretlenebiliyor — "Para birimi" 3 kez yazılmasın),
 *  - kalem alanları gruplanır: tüm kalemler aynı setse tek satır
 *    ("Tüm kalemlerde: miktar, birim…"), değilse kalem başına bir satır.
 */
function formatCheckFlags(flags: AiFieldFlag[], t: BannerT): string[] {
  const top = new Set<string>();
  const byItem = new Map<number, Set<string>>();
  for (const f of flags) {
    const m = /^items\.(\d+)\.(\w+)$/.exec(f.path);
    if (m) {
      const idx = Number(m[1]);
      if (!byItem.has(idx)) byItem.set(idx, new Set());
      byItem.get(idx)!.add(m[2]!);
    } else {
      top.add((TOP_FIELDS as readonly string[]).includes(f.path) ? t(`alan.${f.path}` as never) : f.path);
    }
  }
  const lines = [...top];

  if (byItem.size > 0) {
    const fieldLabels = (fields: Set<string>) =>
      ITEM_FIELD_ORDER.filter((k) => fields.has(k))
        .map((k) => t(`kalemAlani.${k}` as never))
        .join(", ");
    const signatures = new Set(
      [...byItem.values()].map((s) => [...s].sort().join("|")),
    );
    if (signatures.size === 1) {
      const fields = fieldLabels([...byItem.values()][0]!);
      lines.push(
        byItem.size === 1
          ? t("kalemAlanlari", { n: [...byItem.keys()][0]! + 1, fields })
          : t("tumKalemlerdeAlanlar", { n: byItem.size, fields }),
      );
    } else {
      for (const [idx, fields] of [...byItem.entries()].sort((a, b) => a[0] - b[0])) {
        lines.push(t("kalemAlanlari", { n: idx + 1, fields: fieldLabels(fields) }));
      }
    }
  }
  return lines;
}

/** Belgeden fiilen doldurulan alanların özeti — kullanıcı ne geldiğini görsün. */
function filledSummary(d: AiTenderDraft, t: BannerT): string[] {
  const out: string[] = [];
  if (d.title) out.push(t("dolduruldu.baslik"));
  const itemCount = d.items.filter((i) => i.name).length;
  if (itemCount > 0) out.push(t("dolduruldu.kalem", { n: itemCount }));
  if (d.deliveryTerm) out.push(t("dolduruldu.teslimSekli"));
  if (d.paymentCategory) out.push(t("dolduruldu.odemeSekli"));
  if (d.bidsCloseAt) out.push(t("dolduruldu.kapanisTarihi"));
  if (d.primaryCurrency) out.push(t("dolduruldu.paraBirimi"));
  if (d.description) out.push(t("dolduruldu.aciklama"));
  if (d.termsAndConditions) out.push(t("dolduruldu.sartlar"));
  const catCount = (d.suggestedCategoryIds ?? []).length;
  if (catCount > 0) out.push(t("dolduruldu.kategoriOnerisi", { n: catCount }));
  return out;
}

/**
 * Faz AI-1 — wizard üstü AI durum bandı: işaretli (düşük güvenli) alanlar,
 * eksik zorunlular, KDV uyarısı, downgraded notu + "AI'ya sor" (refine —
 * belge yeniden okunmaz, yalnız taslak JSON gider).
 */
export function AiFlagsBanner({
  result,
  onResult,
}: {
  result: AiTenderExtractResult;
  onResult: (r: AiTenderExtractResult) => void;
}) {
  const t = useTranslations("web.panel.requests.aiFlagsBanner");
  const form = useFormContext<TenderFormData>();
  const refine = useAiTenderRefine();
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const vatWarned = result.flags.some((f) => f.reason === "vat_warning");
  const checkFlags = result.flags.filter(
    (f: AiFieldFlag) => f.reason !== "vat_warning",
  );
  const filled = filledSummary(result.draft, t);
  const strong = (c: React.ReactNode) => <span className="font-medium">{c}</span>;

  const ask = async () => {
    const m = message.trim();
    if (!m) return;
    try {
      const updated = await refine.mutateAsync({ draft: result.draft, message: m });
      // Formu güncellenmiş taslakla tazele — AMA mevcut değerler TABAN alınır:
      // AI'nın dokunmadığı alanlar (teslimat adresi, davetliler, görünürlük,
      // kalem soruları, açılış tarihi) korunur. Eskiden taban
      // DEFAULT_FORM_VALUES'tı ve bu alanlar uyarısız siliniyordu (denetim
      // 2026-08-24 Parça 6).
      const currentValues = form.getValues();
      form.reset(
        mapAiDraftToForm(updated.draft, currentValues),
      );
      onResult(updated);
      setMessage("");
      toast.success(t("taslakGuncellendiAlanlariKontrolEdin"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("aiYanitVeremedi")));
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Sparkles className="h-4 w-4" />
        {t("formAiIleBelgedenDolduruldu")}
      </p>

      {filled.length > 0 ? (
        <p className="text-sm text-zinc-700">
          {t.rich("belgedenDoldurulduKalemleriKontrol", { list: filled.join(", "), strong })}
        </p>
      ) : null}

      {(result.draft.suggestedCategoryIds ?? []).length > 0 ? (
        <p className="text-sm text-zinc-700">
          {t.rich("kategorilerAiOnerildiGenelBilgi", { strong })}
        </p>
      ) : (
        <p className="text-sm text-zinc-700">
          {t.rich("kategoriVeTeslimatAdresiBelgedenDoldurulmaz", { strong })}
        </p>
      )}

      {result.downgraded ? (
        <p className="text-sm text-zinc-700">
          {t("belgeKarmasikOlduguIcinStandart")}
        </p>
      ) : null}

      {checkFlags.length > 0 ? (
        <div className="text-sm text-zinc-700">
          <p className="font-medium">{t("kontrolEtmeniziOnerdigimizAlanlarAi")}</p>
          <ul className="mt-1 space-y-0.5">
            {formatCheckFlags(checkFlags, t).map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.missingRequired.length > 0 ? (
        <div className="text-sm text-zinc-700">
          <p className="font-medium">{t("yayinlamadanOnceTamamlamanizGerekenler")}</p>
          <ul className="mt-1 space-y-0.5">
            {result.missingRequired.map((line) => (
              <li key={line} className="flex items-start gap-2">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {vatWarned ? (
        <p className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800">
          {t("belgedeFiyatlarKdvDahilGorunuyor")}
        </p>
      ) : null}

      {/* AI düzeltme composer'ı — sohbet dili: markalı hap girişi + öneri
          chip'leri (chip metni doldurur, kullanıcı sayıyı/tarihi düzeltip yollar). */}
      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <p className="text-xs font-medium text-zinc-500">
          {t("taslaktaBirSeyiDegistirmekMi")}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {[
            t("vadeyi60GunYap"),
            t("kapanisi1HaftaUzat"),
            t("paraBiriminiUsdYap"),
          ].map((s) => (
            <button
              key={s}
              type="button"
              disabled={refine.isPending}
              onClick={() => {
                setMessage(s);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-full border border-brand-200 bg-white py-1 pl-3 pr-1.5 transition-shadow focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/20">
          <Sparkles className="h-4 w-4 shrink-0 text-brand-600" />
          <input
            ref={inputRef}
            value={message}
            disabled={refine.isPending}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t("ornVadeyi60GunYap")}
            className="flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-zinc-400"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void ask();
              }
            }}
          />
          <button
            type="button"
            aria-label={t("aiYaGonder")}
            disabled={refine.isPending || !message.trim()}
            onClick={() => void ask()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition-colors hover:bg-brand-700 disabled:bg-zinc-200 disabled:text-zinc-400"
          >
            {refine.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
