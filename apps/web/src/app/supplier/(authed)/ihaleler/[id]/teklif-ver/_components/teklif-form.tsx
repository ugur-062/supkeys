"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUploadAttachment } from "@/hooks/use-attachments";
import { useSaveBid, useSubmitBid } from "@/hooks/use-supplier-bid";
import {
  bidFormSchema,
  type BidFormValues,
} from "@/lib/tenders/bid-form-schema";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { MyBidDetail, SupplierTenderDetail } from "@/lib/tenders/types";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  FileText,
  Info,
  List,
  Lock,
  MessageSquare,
  Paperclip,
  Save,
  Send,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AttachmentList } from "@/components/attachments/attachment-list";
import { AttachmentUpload } from "@/components/attachments/attachment-upload";
import { BidItemsTable } from "./bid-items-table";
import { BidTotalsCard } from "./bid-totals-card";
import { SubmitConfirmDialog } from "./submit-confirm-dialog";

interface Props {
  tender: SupplierTenderDetail;
  existingBid: MyBidDetail | null;
}

interface SectionProps {
  title: string;
  icon: typeof Info;
  hint?: string;
  children: React.ReactNode;
}

/**
 * V2-5 — Header'a entegre küçük deadline countdown paneli.
 * "X gün Y saat kaldı" + acil renk kodu.
 */
function DeadlineMiniPanel({ closeAt }: { closeAt: string }) {
  const ms = new Date(closeAt).getTime() - Date.now();
  const expired = ms <= 0;
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const tone = expired
    ? "bg-rose-50 border-rose-200 text-rose-700"
    : days < 1
      ? "bg-rose-50 border-rose-200 text-rose-700"
      : days < 3
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-emerald-50 border-emerald-200 text-emerald-700";
  return (
    <div className={cn("rounded-xl border px-4 py-2.5 min-w-[200px]", tone)}>
      <p className="text-[10px] uppercase tracking-wide font-semibold opacity-80">
        Son Teklif Tarihi
      </p>
      <p className="text-sm font-bold mt-0.5">
        {format(new Date(closeAt), "d MMM yyyy HH:mm", { locale: tr })}
      </p>
      <p className="text-xs font-semibold mt-0.5">
        {expired
          ? "Süre doldu"
          : days > 0
            ? `${days} gün ${hours} saat kaldı`
            : `${hours} saat kaldı`}
      </p>
    </div>
  );
}

function Section({ title, icon: Icon, hint, children }: SectionProps) {
  return (
    <section className="bg-white border border-slate-200 rounded-2xl p-5 md:p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
          <Icon className="h-4 w-4 text-brand-700" />
        </div>
        <div>
          <h3 className="font-display font-bold text-base text-brand-900">
            {title}
          </h3>
          {hint ? (
            <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function TeklifForm({ tender, existingBid }: Props) {
  // KURAL: Tüm hook'lar component'in en üstünde, erken return'lerden ÖNCE
  // çağrılmalı (React Rules of Hooks). Submit sonrası existingBid.status
  // SUBMITTED'a değişip "Teklif zaten verildi" ekranına geçtiğimizde
  // aşağıdaki hooks atlanıyor olsaydı "Rendered fewer hooks" hatası alırdık.
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  // LOST bid: alıcı eledi → fresh form. DRAFT: kaldığı yerden. Yok: temiz.
  // V2-7 — ENGLISH_AUCTION SUBMITTED: re-bid akışı, önceki teklif değerleriyle
  // form seed edilir (tedarikçi düşürür).
  // V2-7 — Yeni Tur LAZY: existingBid yok ama previousRoundBid varsa onu prefill.
  const isResubmissionAfterElimination = existingBid?.status === "LOST";
  const isAuctionRebid =
    tender.type === "ENGLISH_AUCTION" && existingBid?.status === "SUBMITTED";
  const draftBid =
    existingBid &&
    (existingBid.status === "DRAFT" || isAuctionRebid)
      ? existingBid
      : null;
  // Lazy prefill: yeni turda henüz hiç bid yok ama önceki turdan kalmış teklif var.
  const lazyPrefill =
    !existingBid && tender.previousRoundBid
      ? tender.previousRoundBid
      : null;

  const saveMutation = useSaveBid(tender.id);
  const submitMutation = useSubmitBid(tender.id);
  const uploadMutation = useUploadAttachment("supplier");

  // Taslak henüz oluşmadıysa dosyalar local'de tutulur, save sonrası bid id'ye
  // yüklenir — kullanıcı "önce taslak kaydet" zorunluluğu yaşamasın.
  const [stagedFiles, setStagedFiles] = useState<File[]>([]);
  const [isUploadingStaged, setIsUploadingStaged] = useState(false);

  const uploadStagedToBid = async (bidId: string): Promise<number> => {
    if (stagedFiles.length === 0) return 0;
    setIsUploadingStaged(true);
    try {
      const results = await Promise.allSettled(
        stagedFiles.map((file) =>
          uploadMutation.mutateAsync({
            scope: "BID_RESPONSE",
            scopeRefId: bidId,
            file,
          }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        toast.error(
          `${failed} dosya yüklenemedi. Detay sayfasından tekrar deneyebilirsiniz.`,
        );
      }
      const ok = stagedFiles.length - failed;
      setStagedFiles([]);
      return ok;
    } finally {
      setIsUploadingStaged(false);
    }
  };

  const form = useForm<BidFormValues>({
    resolver: zodResolver(bidFormSchema),
    defaultValues: {
      // V2-3 — bid.currency artık tender.primaryCurrency'den sabit;
      // tedarikçi seçim yapamaz.
      currency: tender.primaryCurrency,
      notes: draftBid?.notes ?? lazyPrefill?.notes ?? "",
      items: tender.items.map((ti) => {
        // V2-7+ — kalemin sorularına göre answers dizisini hazırla (mevcut
        // cevap varsa değerini taşı, yoksa boş).
        const buildAnswers = (
          existing?: Array<{ questionId: string; value: string }> | null,
        ) =>
          (ti.questions ?? []).map((q) => ({
            questionId: q.id,
            value:
              existing?.find((a) => a.questionId === q.id)?.value ?? "",
          }));
        const draftItem = draftBid?.items?.find(
          (bi) => bi.tenderItemId === ti.id,
        );
        if (draftItem) {
          return {
            tenderItemId: ti.id,
            unitPrice: draftItem ? Number(draftItem.unitPrice) : null,
            customAnswer: draftItem?.customAnswer ?? "",
            answers: buildAnswers(draftItem.answers),
          };
        }
        // V2-7 LAZY prefill — önceki tur bid item'ı varsa kullan
        const lazyItem = lazyPrefill?.items.find(
          (bi) => bi.tenderItemId === ti.id,
        );
        return {
          tenderItemId: ti.id,
          unitPrice: lazyItem?.unitPrice ? Number(lazyItem.unitPrice) : null,
          customAnswer: lazyItem?.customAnswer ?? "",
          answers: buildAnswers(null),
        };
      }),
      attachments:
        (draftBid?.attachments ?? []).map((a) => ({
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          fileUrl: a.fileUrl,
        })),
    },
    mode: "onTouched",
  });

  // Erken render kararları — tüm hook'lar çağrıldıktan SONRA.
  // RFQ: SUBMITTED bid form sayfasına gelinmesi engellenir.
  // V2-7 — ENGLISH_AUCTION: SUBMITTED bid yine editlenebilir (re-bid akışı);
  //   ayrı banner göstermeyiz, form çalışsın.
  if (
    existingBid?.status === "SUBMITTED" &&
    tender.type !== "ENGLISH_AUCTION"
  ) {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-warning-50 flex items-center justify-center">
            <Lock className="w-6 h-6 text-warning-600" />
          </div>
          <p className="font-display font-bold text-brand-900 text-lg">
            Teklif zaten verildi
          </p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Bu ihaleye teklifinizi gönderdiniz (v{existingBid.version}).
            Değişiklik için alıcıyla iletişime geçin. Alıcı teklifinizi elerse
            yeniden teklif verebilirsiniz.
          </p>
          <div className="pt-2">
            <Link
              href={`/supplier/ihaleler/${tender.id}`}
              className="inline-block"
            >
              <Button variant="secondary">
                <ArrowLeft className="w-4 h-4" />
                İhale Detayına Dön
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (existingBid?.status === "WITHDRAWN") {
    return (
      <div className="max-w-2xl mx-auto py-12">
        <div className="card p-8 text-center space-y-4">
          <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
            <AlertCircle className="w-6 h-6 text-slate-500" />
          </div>
          <p className="font-display font-bold text-brand-900 text-lg">
            Teklif geri çekildi
          </p>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            Bu ihaleye verdiğiniz teklifi geri çektiniz. Yeniden teklif vermek
            için alıcıyla iletişime geçin.
          </p>
          <div className="pt-2">
            <Link
              href={`/supplier/ihaleler/${tender.id}`}
              className="inline-block"
            >
              <Button variant="secondary">
                <ArrowLeft className="w-4 h-4" />
                İhale Detayına Dön
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isBusy = saveMutation.isPending || submitMutation.isPending;

  const computeTotal = (): number => {
    const values = form.getValues();
    const map = new Map(tender.items.map((it) => [it.id, it]));
    return (values.items ?? []).reduce((sum, item) => {
      if (item.unitPrice == null) return sum;
      const ti = map.get(item.tenderItemId);
      if (!ti) return sum;
      return sum + item.unitPrice * Number(ti.quantity);
    }, 0);
  };

  const buildPayload = (values: BidFormValues) => ({
    currency: values.currency,
    notes: values.notes?.trim() ? values.notes.trim() : undefined,
    items: values.items.map((i) => ({
      tenderItemId: i.tenderItemId,
      unitPrice: i.unitPrice,
      customAnswer: i.customAnswer?.trim() || undefined,
      answers:
        i.answers && i.answers.length > 0
          ? i.answers
              .filter((a) => a.value != null && a.value.trim().length > 0)
              .map((a) => ({ questionId: a.questionId, value: a.value.trim() }))
          : undefined,
    })),
    attachments:
      values.attachments && values.attachments.length > 0
        ? values.attachments
        : undefined,
  });

  const handleSaveDraft = form.handleSubmit(
    async (values) => {
      try {
        const saved = await saveMutation.mutateAsync(buildPayload(values));
        const uploaded = await uploadStagedToBid(saved.id);
        toast.success(
          `Taslak kaydedildi${uploaded > 0 ? ` · ${uploaded} dosya yüklendi` : ""}`,
        );
      } catch (err) {
        toast.error(extractErrorMessage(err, "Taslak kaydedilemedi"));
      }
    },
    () => {
      toast.error("Lütfen alanları kontrol edin");
    },
  );

  const handleSubmit = form.handleSubmit(
    async (values) => {
      try {
        const saved = await saveMutation.mutateAsync(buildPayload(values));
        // Submit'ten önce staged dosyaları yükle — requireBidDocument check'i
        // bu Attachment'ları sayar.
        await uploadStagedToBid(saved.id);
        await submitMutation.mutateAsync();
        toast.success("Teklif gönderildi");
        setConfirmOpen(false);
        router.push(`/supplier/ihaleler/${tender.id}`);
      } catch (err) {
        toast.error(extractErrorMessage(err, "Teklif gönderilemedi"));
        setConfirmOpen(false);
      }
    },
    () => {
      toast.error("Teklif gönderilmeden önce alanları kontrol edin");
      setConfirmOpen(false);
    },
  );

  const totalForDialog = computeTotal();
  const currencyForDialog = form.watch("currency");

  return (
    <FormProvider {...form}>
      <div className="max-w-7xl mx-auto pb-24 space-y-5">
        <nav
          aria-label="breadcrumb"
          className="flex items-center gap-1.5 text-sm text-slate-500"
        >
          <Link
            href="/supplier/ihaleler"
            className="hover:text-brand-700 hover:underline"
          >
            İhaleler
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <Link
            href={`/supplier/ihaleler/${tender.id}`}
            className="hover:text-brand-700 hover:underline font-mono"
          >
            {tender.tenderNumber}
          </Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-brand-700 font-medium">Teklif Ver</span>
        </nav>

        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-brand-900">
              {isResubmissionAfterElimination
                ? "Yeniden Teklif Ver"
                : "Teklif Ver"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {tender.tenderNumber} · {tender.title}
            </p>
          </div>
          <DeadlineMiniPanel closeAt={tender.bidsCloseAt} />
        </header>

        {/* LOST sonrası yeniden teklif uyarısı */}
        {isResubmissionAfterElimination && existingBid?.eliminationReason ? (
          <div className="rounded-xl bg-warning-50 border border-warning-200 p-4 flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm space-y-1">
              <p className="font-bold text-warning-900">
                Önceki teklifiniz alıcı tarafından elendi.
              </p>
              <p className="text-warning-800">
                <strong>Sebep:</strong> {existingBid.eliminationReason}
              </p>
              <p className="text-warning-700 text-xs mt-1">
                Bu sebebi dikkate alarak yeni teklifinizi hazırlayabilirsiniz.
              </p>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* Tender özeti */}
            <section className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 via-white to-indigo-50/40 p-5">
              <p className="text-xs text-slate-500 uppercase tracking-wide font-medium">
                Alıcı Firma
              </p>
              <p className="font-bold text-brand-900 mt-1">
                {tender.tenant.name}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-500">Kapanış</p>
                  <p className="font-semibold text-brand-900 mt-0.5">
                    {format(
                      new Date(tender.bidsCloseAt),
                      "d MMM yyyy HH:mm",
                      { locale: tr },
                    )}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Kalem</p>
                  <p className="font-semibold text-brand-900 mt-0.5">
                    {tender.items.length} adet
                  </p>
                </div>
              </div>
            </section>

            <Section
              title="Para Birimi"
              icon={Wallet}
              hint="Bu ihalenin para birimi alıcı tarafından belirlendi; değiştirilemez."
            >
              <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-brand-100 text-brand-700 font-bold">
                  {tender.primaryCurrency === "TRY"
                    ? "₺"
                    : tender.primaryCurrency === "USD"
                      ? "$"
                      : "€"}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-brand-900">
                    {tender.primaryCurrency}
                  </p>
                  <p className="text-xs text-slate-500">
                    Tüm kalem fiyatları {tender.primaryCurrency} cinsinden girilir.
                  </p>
                </div>
              </div>
            </Section>

            <Section
              title="Kalem Fiyatları"
              icon={List}
              hint="Teklif vermek istemediğiniz kalemleri boş bırakabilirsiniz."
            >
              {tender.requireAllItems ? (
                <div className="mb-4 rounded-lg bg-warning-50 border border-warning-200 p-3 text-xs text-warning-800 flex gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Bu ihalede <strong>tüm kalemlere</strong> teklif vermek
                    zorunludur.
                  </span>
                </div>
              ) : null}

              <BidItemsTable
                tenderItems={tender.items}
                currency={form.watch("currency")}
              />

              {form.formState.errors.items?.message ? (
                <p className="mt-3 text-sm text-danger-600">
                  {form.formState.errors.items.message}
                </p>
              ) : null}
            </Section>

            <Section
              title="Teklif Notu"
              icon={MessageSquare}
              hint="Teslim süresi, garanti şartları, ödeme önerisi vb."
            >
              <Field error={form.formState.errors.notes?.message}>
                <Label htmlFor="bid-notes">Genel Açıklama</Label>
                <Textarea
                  id="bid-notes"
                  rows={4}
                  maxLength={2000}
                  placeholder="Teklifinizle ilgili açıklayıcı bilgi…"
                  hasError={!!form.formState.errors.notes}
                  {...form.register("notes")}
                />
              </Field>
            </Section>

            <Section title="Teklif Dosyaları" icon={Paperclip}>
              {tender.requireBidDocument ? (
                <div className="mb-3 rounded-lg bg-warning-50 border border-warning-200 p-3 text-xs text-warning-800 flex gap-2">
                  <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    Bu ihalede <strong>en az 1 dosya</strong> yüklemek
                    zorunludur (örn. teklif şartnamesi, fiyat listesi).
                  </span>
                </div>
              ) : null}

              {draftBid?.id ? (
                <div className="space-y-3">
                  <AttachmentUpload
                    surface="supplier"
                    scope="BID_RESPONSE"
                    scopeRefId={draftBid.id}
                    hint="PDF, Word, Excel, görsel — tek dosya max 50 MB"
                  />
                  <AttachmentList
                    surface="supplier"
                    scope="BID_RESPONSE"
                    scopeRefId={draftBid.id}
                    canDelete={true}
                    emptyText="Henüz dosya eklenmedi"
                  />
                </div>
              ) : (
                <StagedFileUpload
                  files={stagedFiles}
                  onAdd={(files) => setStagedFiles((prev) => [...prev, ...files])}
                  onRemove={(idx) =>
                    setStagedFiles((prev) => prev.filter((_, i) => i !== idx))
                  }
                  uploading={isUploadingStaged}
                />
              )}
            </Section>
          </div>

          {/* Sticky özet + aksiyonlar */}
          <aside className="lg:col-span-1">
            <div className="sticky top-6 space-y-4">
              <BidTotalsCard tender={tender} />

              <div className="space-y-2">
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setConfirmOpen(true)}
                  disabled={isBusy}
                  className="w-full !bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
                >
                  <Send className="w-4 h-4" />
                  Teklif Gönder
                </Button>

                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => handleSaveDraft()}
                  loading={saveMutation.isPending && !submitMutation.isPending}
                  disabled={isBusy}
                  className="w-full"
                >
                  <Save className="w-4 h-4" />
                  Taslak Olarak Kaydet
                </Button>

                <Link
                  href={`/supplier/ihaleler/${tender.id}`}
                  className={cn(
                    "block w-full text-center text-sm text-slate-500 hover:text-slate-700 py-2",
                  )}
                >
                  <ArrowLeft className="w-3.5 h-3.5 inline-block mr-1" />
                  Vazgeç
                </Link>
              </div>

              <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-xs text-warning-800 flex gap-2">
                <Lock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>
                  Teklifiniz <strong>kapalı zarf</strong> altındadır. Diğer
                  tedarikçiler teklifinizi göremez.
                </span>
              </div>

              {draftBid ? (
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600 flex gap-2">
                  <FileText className="w-4 h-4 flex-shrink-0 mt-0.5 text-slate-400" />
                  <span>
                    Mevcut taslağınız yüklendi. Düzenleyip tekrar
                    kaydedebilirsiniz.
                  </span>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      <SubmitConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => handleSubmit()}
        isSubmitting={isBusy}
        isRevise={false}
        totalAmount={totalForDialog}
        currency={currencyForDialog}
      />
    </FormProvider>
  );
}

/**
 * Henüz bid kaydedilmediği için (draft yok) dosyaları client'ta tutan
 * picker. Taslak/submit sırasında bu dosyalar bid oluştuktan sonra
 * sırayla R2'ye yüklenir (uploadStagedToBid).
 */
function StagedFileUpload({
  files,
  onAdd,
  onRemove,
  uploading,
}: {
  files: File[];
  onAdd: (files: File[]) => void;
  onRemove: (idx: number) => void;
  uploading: boolean;
}) {
  return (
    <div className="space-y-3">
      <label
        className={cn(
          "block border-2 border-dashed border-slate-300 rounded-lg p-5 text-center cursor-pointer transition",
          "hover:border-brand-400 hover:bg-brand-50/30",
          uploading && "opacity-50 cursor-wait",
        )}
      >
        <input
          type="file"
          multiple
          className="hidden"
          disabled={uploading}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > 0) onAdd(picked);
            // Reset value, böylece aynı dosyayı tekrar seçebilir
            e.target.value = "";
          }}
        />
        <Upload className="w-5 h-5 mx-auto text-slate-400" />
        <p className="text-sm font-medium text-brand-900 mt-2">
          Dosya seçmek için tıklayın
        </p>
        <p className="text-xs text-slate-500 mt-1">
          PDF, Word, Excel, görsel — tek dosya max 50 MB. Dosyalar
          taslak/teklif kaydedildiğinde yüklenir.
        </p>
      </label>

      {files.length > 0 ? (
        <ul className="space-y-2">
          {files.map((f, i) => (
            <li
              key={`${f.name}-${i}`}
              className="flex items-center gap-3 p-3 bg-white border border-slate-200 rounded-lg"
            >
              <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-brand-900 truncate">
                  {f.name}
                </p>
                <p className="text-xs text-slate-500">
                  {(f.size / 1024).toFixed(1)} KB · Yüklemeye hazır
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(i)}
                disabled={uploading}
                className="p-1.5 text-slate-400 hover:text-danger-600 hover:bg-danger-50 rounded-md disabled:opacity-40"
                aria-label="Kaldır"
              >
                <X className="w-4 h-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
