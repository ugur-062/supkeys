"use client";

import { Button } from "@/components/catalyst/button";
import { Input } from "@/components/catalyst/input";
import { useAiTenderRefine } from "@/hooks/use-ai-tender-import";
import { mapAiDraftToForm } from "@/lib/tenders/map-ai-draft-to-form";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import type {
  AiFieldFlag,
  AiTenderDraft,
  AiTenderExtractResult,
} from "@rothern/shared";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";
import { toast } from "sonner";

/** Alan yolu → TR etiket ("items.2.quantity" → "Kalem 3: Miktar"). */
function labelFor(path: string): string {
  const TOP: Record<string, string> = {
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
  };
  const m = /^items\.(\d+)\.(\w+)$/.exec(path);
  if (m) {
    const FIELD: Record<string, string> = {
      name: "Ad",
      quantity: "Miktar",
      unit: "Birim",
      requiredByDate: "Termin tarihi",
      targetUnitPrice: "Hedef fiyat",
      materialCode: "Malzeme kodu",
      description: "Açıklama",
    };
    return `Kalem ${Number(m[1]) + 1}: ${FIELD[m[2]!] ?? m[2]}`;
  }
  return TOP[path] ?? path;
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
          &quot;Kalemler&quot; adımında kontrol edebilirsiniz.
        </p>
      ) : null}

      <p className="text-sm text-zinc-700">
        <span className="font-medium">Kategori ve teslimat adresi belgeden doldurulmaz</span>{" "}
        — bunları bu formda siz seçersiniz.
      </p>

      {result.downgraded ? (
        <p className="text-sm text-zinc-700">
          Belge karmaşık olduğu için standart modelle işlendi — sonuç eksikse
          belgeyi bölerek yeniden deneyin.
        </p>
      ) : null}

      {checkFlags.length > 0 ? (
        <p className="text-sm text-zinc-700">
          <span className="font-medium">AI şu alanlardan emin değil, kontrol edin:</span>{" "}
          {checkFlags.map((f) => labelFor(f.path)).join(", ")}
        </p>
      ) : null}

      {result.missingRequired.length > 0 ? (
        <p className="text-sm text-zinc-700">
          <span className="font-medium">Tamamlamanız gerekenler:</span>{" "}
          {result.missingRequired.join(", ")}
        </p>
      ) : null}

      {vatWarned ? (
        <p className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800">
          Belgede fiyatlar KDV dahil görünüyor — formdaki fiyatlar KDV HARİÇ
          olmalı; fiyat alanlarını kontrol edin.
        </p>
      ) : null}

      <div className="flex gap-2">
        <Input
          value={message}
          disabled={refine.isPending}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="AI'ya sorun: örn. 'vade 60 gün olsun', 'kapanışı 15 Ağustos yap'"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void ask();
            }
          }}
        />
        <Button
          outline
          disabled={refine.isPending || !message.trim()}
          onClick={() => void ask()}
        >
          {refine.isPending ? "Yanıtlıyor…" : "Gönder"}
        </Button>
      </div>
    </div>
  );
}
