"use client";

// V2-7 — "Yeni Tur Oluştur" sayfası.
// Görseldeki 3 ana kart: Yeni Tur Özellikleri / İhale Tipi / İhale Zaman Seçimi.

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateNextRound,
  useTenderDetail,
} from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ChevronRight,
  Gavel,
  Info,
  Loader2,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  previousTenderId: string;
}

type CarryMode = "AUTO" | "LAZY";

export function NewRoundView({ previousTenderId }: Props) {
  const router = useRouter();
  const detail = useTenderDetail(previousTenderId);
  const mutation = useCreateNextRound(previousTenderId);

  // Form state
  const [carryEnabled, setCarryEnabled] = useState<boolean>(false);
  const [carryMode, setCarryMode] = useState<CarryMode>("AUTO");
  const [eliminateNonBidders, setEliminateNonBidders] =
    useState<boolean>(false);
  const [type, setType] = useState<"RFQ" | "ENGLISH_AUCTION">(
    "ENGLISH_AUCTION",
  );
  const [openImmediately, setOpenImmediately] = useState<boolean>(true);
  const [bidsOpenAt, setBidsOpenAt] = useState<string>("");
  const [bidsCloseAt, setBidsCloseAt] = useState<string>("");
  const [previewBeforeOpen, setPreviewBeforeOpen] = useState<boolean>(false);
  const [autoExtendOnLateBid, setAutoExtendOnLateBid] =
    useState<boolean>(false);

  if (detail.isLoading && !detail.data) {
    return (
      <div className="max-w-4xl mx-auto py-16 flex flex-col items-center text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm mt-2">Yükleniyor…</p>
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="max-w-2xl mx-auto py-12 card p-8 text-center text-slate-500">
        İhale bulunamadı.
      </div>
    );
  }

  const previous = detail.data;
  const canCreate =
    bidsCloseAt.length > 0 &&
    new Date(bidsCloseAt).getTime() > Date.now() &&
    (openImmediately ||
      (bidsOpenAt.length > 0 &&
        new Date(bidsOpenAt).getTime() > Date.now() &&
        new Date(bidsOpenAt).getTime() < new Date(bidsCloseAt).getTime()));

  const handleSubmit = async () => {
    if (!canCreate) return;
    try {
      const res = await mutation.mutateAsync({
        type,
        carryBids: carryEnabled ? carryMode : "NONE",
        eliminateNonBidders,
        openImmediately,
        bidsOpenAt:
          !openImmediately && bidsOpenAt
            ? new Date(bidsOpenAt).toISOString()
            : undefined,
        bidsCloseAt: new Date(bidsCloseAt).toISOString(),
        previewBeforeOpen,
        autoExtendOnLateBid:
          type === "ENGLISH_AUCTION" ? autoExtendOnLateBid : undefined,
      });
      toast.success(
        `Tur #${res.roundNumber} oluşturuldu: ${res.tenderNumber}`,
      );
      router.push(`/dashboard/ihaleler/${res.id}`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yeni tur oluşturulamadı"));
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <nav className="flex items-center gap-1.5 text-sm text-slate-500">
        <Link
          href={`/dashboard/ihaleler/${previousTenderId}`}
          className="hover:text-brand-700 hover:underline inline-flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          {previous.tenderNumber}
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="font-semibold text-brand-900">Yeni Tur Oluştur</span>
      </nav>

      <header className="card p-5">
        <h1 className="font-display font-bold text-2xl text-brand-900">
          Yeni Tur Oluştur
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          <span className="font-semibold">{previous.title}</span> ihalesi için
          tur #{previous.roundNumber + 1} oluşturuyorsunuz.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CARD 1 — Yeni Tur Özellikleri */}
        <section className="card p-5 space-y-3">
          <h2 className="font-display font-bold text-base text-brand-900">
            Yeni Tur Özellikleri<span className="text-danger-500">*</span>
          </h2>
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={carryEnabled}
              onChange={(e) => setCarryEnabled(e.target.checked)}
            />
            <div className="flex-1">
              <p className="text-sm font-semibold text-brand-900 flex items-center gap-1.5">
                Tedarikçilerin son tekliflerini taşı
                <Info className="w-3.5 h-3.5 text-slate-400" />
              </p>
            </div>
          </label>
          {carryEnabled ? (
            <div className="ml-7 space-y-2">
              <label
                className={cn(
                  "flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors",
                  carryMode === "AUTO"
                    ? "border-brand-500 bg-brand-50/40"
                    : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name="carry-mode"
                  value="AUTO"
                  checked={carryMode === "AUTO"}
                  onChange={() => setCarryMode("AUTO")}
                  className="mt-0.5"
                />
                <span className="text-sm text-brand-900 flex items-center gap-1.5">
                  Otomatik olarak taşınsın
                  <AlertTriangle className="w-3.5 h-3.5 text-warning-500" />
                </span>
              </label>
              <label
                className={cn(
                  "flex items-start gap-2 p-2 rounded-md border cursor-pointer transition-colors",
                  carryMode === "LAZY"
                    ? "border-brand-500 bg-brand-50/40"
                    : "border-slate-200 hover:bg-slate-50",
                )}
              >
                <input
                  type="radio"
                  name="carry-mode"
                  value="LAZY"
                  checked={carryMode === "LAZY"}
                  onChange={() => setCarryMode("LAZY")}
                  className="mt-0.5"
                />
                <span className="text-sm text-brand-900 flex items-center gap-1.5">
                  Teklif verdiğinde taşınsın
                  <Info className="w-3.5 h-3.5 text-slate-400" />
                </span>
              </label>
            </div>
          ) : null}

          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={eliminateNonBidders}
              onChange={(e) => setEliminateNonBidders(e.target.checked)}
            />
            <p className="text-sm font-semibold text-brand-900 flex items-center gap-1.5">
              Önceki turda teklif vermeyen tedarikçileri ele
              <Info className="w-3.5 h-3.5 text-slate-400" />
            </p>
          </label>
        </section>

        {/* CARD 2 — İhale Tipi */}
        <section className="card p-5 space-y-3">
          <h2 className="font-display font-bold text-base text-brand-900 flex items-center gap-2">
            <Gavel className="w-4 h-4 text-brand-600" />
            İhale Tipi<span className="text-danger-500">*</span>
          </h2>
          <div className="space-y-2">
            <label
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors",
                type === "ENGLISH_AUCTION"
                  ? "border-brand-500 bg-brand-50/40"
                  : "border-slate-200 hover:bg-slate-50",
              )}
            >
              <input
                type="radio"
                name="round-type"
                value="ENGLISH_AUCTION"
                checked={type === "ENGLISH_AUCTION"}
                onChange={() => setType("ENGLISH_AUCTION")}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-semibold text-brand-900">
                  İngiliz Usulü
                </p>
                <ul className="text-xs text-slate-600 mt-1 space-y-0.5 list-disc list-inside">
                  <li>Bu süreç fiyat azaltmayı hedefler.</li>
                  <li>
                    Tedarikçilerin teklif ve sıralama görünürlüğüne karar
                    verilebilir.
                  </li>
                </ul>
              </div>
            </label>
            <label
              className={cn(
                "flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors",
                type === "RFQ"
                  ? "border-brand-500 bg-brand-50/40"
                  : "border-slate-200 hover:bg-slate-50",
              )}
            >
              <input
                type="radio"
                name="round-type"
                value="RFQ"
                checked={type === "RFQ"}
                onChange={() => setType("RFQ")}
                className="mt-0.5"
              />
              <div>
                <p className="text-sm font-semibold text-brand-900">
                  RFQ (Teklif Talebi)
                </p>
                <ul className="text-xs text-slate-600 mt-1 space-y-0.5 list-disc list-inside">
                  <li>Bu süreç teklif toplamayı hedefler.</li>
                  <li>Tedarikçiler yalnızca kendi tekliflerini görüntüler.</li>
                  <li>
                    Teklif toplarken dilerseniz kapalı zarf ile de
                    ilerleyebilirsiniz.
                  </li>
                </ul>
              </div>
            </label>
          </div>
        </section>
      </div>

      {/* CARD 3 — İhale Zaman Seçimi */}
      <section className="card p-5 space-y-4">
        <h2 className="font-display font-bold text-base text-brand-900 flex items-center gap-2">
          <Calendar className="w-4 h-4 text-brand-600" />
          İhale Zaman Seçimi
        </h2>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={openImmediately}
            onChange={(e) => setOpenImmediately(e.target.checked)}
          />
          <p className="text-sm font-semibold text-brand-900">
            İhaleyi hemen aç.
          </p>
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field>
            <Label htmlFor="bidsOpenAt" required>
              Açılış Tarihi
            </Label>
            {openImmediately ? (
              <Input
                id="bidsOpenAt"
                type="text"
                value="Hemen"
                disabled
                className="!bg-slate-100 !text-slate-400"
              />
            ) : (
              <Input
                id="bidsOpenAt"
                type="datetime-local"
                value={bidsOpenAt}
                onChange={(e) => setBidsOpenAt(e.target.value)}
              />
            )}
          </Field>
          <Field>
            <Label htmlFor="bidsCloseAt" required>
              Kapanış Tarihi
            </Label>
            <Input
              id="bidsCloseAt"
              type="datetime-local"
              value={bidsCloseAt}
              onChange={(e) => setBidsCloseAt(e.target.value)}
            />
          </Field>
          <Field>
            <Label htmlFor="previewBeforeOpen">İhale Ön İzlenebilsin</Label>
            <label className="flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-surface-border bg-white text-sm">
              <input
                id="previewBeforeOpen"
                type="checkbox"
                checked={previewBeforeOpen}
                onChange={(e) => setPreviewBeforeOpen(e.target.checked)}
              />
              <span className="text-slate-700">
                Açılışa kadar tedarikçi görebilsin
              </span>
            </label>
          </Field>
        </div>

        {type === "ENGLISH_AUCTION" ? (
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={autoExtendOnLateBid}
              onChange={(e) => setAutoExtendOnLateBid(e.target.checked)}
            />
            <p className="text-sm font-semibold text-brand-900 flex items-center gap-1.5">
              En iyi teklif geçildiğinde, ihalenin kapanış saati otomatik olarak
              uzasın.
              <Info className="w-3.5 h-3.5 text-slate-400" />
            </p>
          </label>
        ) : null}
      </section>

      <footer className="flex items-center justify-end gap-2">
        <Link href={`/dashboard/ihaleler/${previousTenderId}`}>
          <Button variant="secondary">Vazgeç</Button>
        </Link>
        <Button
          variant="primary"
          disabled={!canCreate || mutation.isPending}
          onClick={handleSubmit}
        >
          {mutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {mutation.isPending ? "Oluşturuluyor…" : "Yeni Tur Oluştur"}
        </Button>
      </footer>
    </div>
  );
}
