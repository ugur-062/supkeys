"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AttachmentsUploader } from "./attachments-uploader";
import { BidItemsTable } from "./bid-items-table";
import { BidTotalsCard } from "./bid-totals-card";
import { CurrencySelector } from "./currency-selector";
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
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isRevise = existingBid?.status === "SUBMITTED";

  const saveMutation = useSaveBid(tender.id);
  const submitMutation = useSubmitBid(tender.id);

  const form = useForm<BidFormValues>({
    resolver: zodResolver(bidFormSchema),
    defaultValues: {
      currency:
        existingBid?.currency ??
        (tender.allowedCurrencies.includes(tender.primaryCurrency)
          ? tender.primaryCurrency
          : tender.allowedCurrencies[0]),
      notes: existingBid?.notes ?? "",
      items: tender.items.map((ti) => {
        const existingItem = existingBid?.items?.find(
          (bi) => bi.tenderItemId === ti.id,
        );
        return {
          tenderItemId: ti.id,
          unitPrice: existingItem
            ? Number(existingItem.unitPrice)
            : null,
          customAnswer: existingItem?.customAnswer ?? "",
        };
      }),
      attachments:
        (existingBid?.attachments ?? []).map((a) => ({
          fileName: a.fileName,
          fileSize: a.fileSize,
          mimeType: a.mimeType,
          fileUrl: a.fileUrl,
        })),
    },
    mode: "onTouched",
  });

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
    })),
    attachments:
      values.attachments && values.attachments.length > 0
        ? values.attachments
        : undefined,
  });

  const handleSaveDraft = form.handleSubmit(
    async (values) => {
      try {
        await saveMutation.mutateAsync(buildPayload(values));
        toast.success("Taslak kaydedildi");
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
        await saveMutation.mutateAsync(buildPayload(values));
        await submitMutation.mutateAsync();
        toast.success(
          isRevise ? "Teklif revize edildi" : "Teklif gönderildi",
        );
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
          <span className="text-brand-700 font-medium">
            {isRevise ? "Teklifi Revize Et" : "Teklif Ver"}
          </span>
        </nav>

        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="font-display font-bold text-2xl md:text-3xl text-brand-900">
              {isRevise ? "Teklifimi Revize Et" : "Teklif Ver"}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {tender.tenderNumber} · {tender.title}
            </p>
          </div>
          {isRevise && existingBid ? (
            <span className="px-3 py-1.5 bg-brand-50 text-brand-700 text-xs font-semibold rounded-md border border-brand-200">
              Mevcut Versiyon: v{existingBid.version}
            </span>
          ) : null}
        </header>

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
              hint="Tüm kalemler için aynı para birimi kullanılır."
            >
              <CurrencySelector
                allowedCurrencies={tender.allowedCurrencies}
              />
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
              <AttachmentsUploader />
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
                  {isRevise ? "Yeni Teklifi Gönder" : "Teklifi Gönder"}
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

              {existingBid?.status === "DRAFT" ? (
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
        isRevise={isRevise}
        totalAmount={totalForDialog}
        currency={currencyForDialog}
      />
    </FormProvider>
  );
}
