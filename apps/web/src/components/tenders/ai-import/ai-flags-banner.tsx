"use client";

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

const TOP_LABELS: Record<string, string> = {
  title: "İhale başlığı",
  description: "Açıklama",
  primaryCurrency: "Para birimi",
  deliveryTerm: "Teslim şekli",
  paymentCategory: "Ödeme şekli",
  paymentDays: "Vade günü",
  advancePercent: "Peşin yüzdesi",
  bidsCloseAt: "Kapanış tarihi",
  termsAndConditions: "Şartlar",
  prices: "Fiyatlar",
  isInternational: "Kapsam (yurtiçi/uluslararası)",
};
const ITEM_FIELD_LABELS: Record<string, string> = {
  name: "ad",
  quantity: "miktar",
  unit: "birim",
  requiredByDate: "termin tarihi",
  targetUnitPrice: "hedef fiyat",
  materialCode: "malzeme kodu",
  description: "açıklama",
};
/** Kalem alanlarının doğal sırası — satırlar hep aynı düzende okunur. */
const ITEM_FIELD_ORDER = Object.keys(ITEM_FIELD_LABELS);

/**
 * İşaretli alanları okunur satırlara indirger:
 *  - üst-düzey alanlar TEKİLLEŞTİRİLİR (aynı alan birden çok gerekçeyle
 *    işaretlenebiliyor — "Para birimi" 3 kez yazılmasın),
 *  - kalem alanları gruplanır: tüm kalemler aynı setse tek satır
 *    ("Tüm kalemlerde: miktar, birim…"), değilse kalem başına bir satır.
 */
function formatCheckFlags(flags: AiFieldFlag[]): string[] {
  const top = new Set<string>();
  const byItem = new Map<number, Set<string>>();
  for (const f of flags) {
    const m = /^items\.(\d+)\.(\w+)$/.exec(f.path);
    if (m) {
      const idx = Number(m[1]);
      if (!byItem.has(idx)) byItem.set(idx, new Set());
      byItem.get(idx)!.add(m[2]!);
    } else {
      top.add(TOP_LABELS[f.path] ?? f.path);
    }
  }
  const lines = [...top];

  if (byItem.size > 0) {
    const fieldLabels = (fields: Set<string>) =>
      ITEM_FIELD_ORDER.filter((k) => fields.has(k))
        .map((k) => ITEM_FIELD_LABELS[k])
        .join(", ");
    const signatures = new Set(
      [...byItem.values()].map((s) => [...s].sort().join("|")),
    );
    if (signatures.size === 1) {
      const label = fieldLabels([...byItem.values()][0]!);
      lines.push(
        byItem.size === 1
          ? `Kalem ${[...byItem.keys()][0]! + 1}: ${label}`
          : `Tüm kalemlerde (${byItem.size} kalem): ${label}`,
      );
    } else {
      for (const [idx, fields] of [...byItem.entries()].sort((a, b) => a[0] - b[0])) {
        lines.push(`Kalem ${idx + 1}: ${fieldLabels(fields)}`);
      }
    }
  }
  return lines;
}

/** Belgeden fiilen doldurulan alanların TR özeti — kullanıcı ne geldiğini görsün. */
function filledSummary(d: AiTenderDraft): string[] {
  const out: string[] = [];
  if (d.title) out.push("başlık");
  const itemCount = d.items.filter((i) => i.name).length;
  if (itemCount > 0) out.push(`${itemCount} kalem`);
  if (d.deliveryTerm) out.push("teslim şekli");
  if (d.paymentCategory) out.push("ödeme şekli");
  if (d.bidsCloseAt) out.push("kapanış tarihi");
  if (d.primaryCurrency) out.push("para birimi");
  if (d.description) out.push("açıklama");
  if (d.termsAndConditions) out.push("şartlar");
  // Kapsam yalnız belge NET gösteriyorsa gelir (null = bilinmiyor → varsayılan
  // yurtiçi kalır ama özete yazılmaz; kullanıcı 1. adımda kendisi seçer).
  if (d.isInternational !== null)
    out.push(d.isInternational ? "kapsam (uluslararası)" : "kapsam (yurtiçi)");
  const catCount = (d.suggestedCategoryIds ?? []).length;
  if (catCount > 0) out.push(`${catCount} kategori önerisi`);
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
  const form = useFormContext<TenderFormData>();
  const refine = useAiTenderRefine();
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const vatWarned = result.flags.some((f) => f.reason === "vat_warning");
  const checkFlags = result.flags.filter(
    (f: AiFieldFlag) => f.reason !== "vat_warning",
  );

  const ask = async () => {
    const m = message.trim();
    if (!m) return;
    try {
      const updated = await refine.mutateAsync({ draft: result.draft, message: m });
      // Formu güncellenmiş taslakla yeniden doldur (kullanıcının o ana kadarki
      // el düzeltmeleri AI-taslak alanlarına göre tazelenir — banner bunu söyler).
      const listingType = form.getValues("listingType");
      form.reset(mapAiDraftToForm(updated.draft, listingType));
      onResult(updated);
      setMessage("");
      toast.success("Taslak güncellendi — alanları kontrol edin");
    } catch (err) {
      toast.error(extractErrorMessage(err, "AI yanıt veremedi"));
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-950/10 bg-zinc-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
        <Sparkles className="h-4 w-4" />
        Form AI ile belgeden dolduruldu — kontrol sizde
      </p>

      {filledSummary(result.draft).length > 0 ? (
        <p className="text-sm text-zinc-700">
          <span className="font-medium">Belgeden dolduruldu:</span>{" "}
          {filledSummary(result.draft).join(", ")}. Kalemleri
          “Kalemler” adımında kontrol edebilirsiniz.
        </p>
      ) : null}

      {(result.draft.suggestedCategoryIds ?? []).length > 0 ? (
        <p className="text-sm text-zinc-700">
          <span className="font-medium">
            Kategoriler kalemlere göre AI tarafından önerildi
          </span>{" "}
          — “Genel Bilgi” adımında kontrol edin. Teslimat adresini bu
          formda siz seçersiniz.
        </p>
      ) : (
        <p className="text-sm text-zinc-700">
          <span className="font-medium">
            Kategori ve teslimat adresi belgeden doldurulmaz
          </span>{" "}
          — bunları bu formda siz seçersiniz.
        </p>
      )}

      {result.downgraded ? (
        <p className="text-sm text-zinc-700">
          Belge karmaşık olduğu için standart modelle işlendi — sonuç eksikse
          belgeyi bölerek yeniden deneyin.
        </p>
      ) : null}

      {checkFlags.length > 0 ? (
        <div className="text-sm text-zinc-700">
          <p className="font-medium">Kontrol etmenizi önerdiğimiz alanlar (AI emin değil):</p>
          <ul className="mt-1 space-y-0.5">
            {formatCheckFlags(checkFlags).map((line) => (
              <li key={line} className="flex items-start gap-1.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-400" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.missingRequired.length > 0 ? (
        <div className="text-sm text-zinc-700">
          <p className="font-medium">Yayınlamadan önce tamamlamanız gerekenler:</p>
          <ul className="mt-1 space-y-0.5">
            {result.missingRequired.map((line) => (
              <li key={line} className="flex items-start gap-1.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                {line}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {vatWarned ? (
        <p className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800">
          Belgede fiyatlar KDV dahil görünüyor — formdaki fiyatlar KDV HARİÇ
          olmalı; fiyat alanlarını kontrol edin.
        </p>
      ) : null}

      {/* AI düzeltme composer'ı — sohbet dili: markalı hap girişi + öneri
          chip'leri (chip metni doldurur, kullanıcı sayıyı/tarihi düzeltip yollar). */}
      <div className="rounded-xl border border-brand-100 bg-white p-3">
        <p className="text-xs font-medium text-zinc-500">
          Taslakta bir şeyi değiştirmek mi istiyorsunuz? Yazın, AI formu
          güncellesin:
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            "Vadeyi 60 gün yap",
            "Kapanışı 1 hafta uzat",
            "Para birimini USD yap",
          ].map((s) => (
            <button
              key={s}
              type="button"
              disabled={refine.isPending}
              onClick={() => {
                setMessage(s);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
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
            placeholder="Örn. vadeyi 60 gün yap, kapanışı 15 Ağustos'a al…"
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
            aria-label="AI'ya gönder"
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
