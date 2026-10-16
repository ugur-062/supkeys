"use client";

import { useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/catalyst/badge";
import { SelectMenu } from "@/components/ui/select-menu";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import {
  LISTING_DOC_KINDS,
  useDeleteListingDoc,
  useListingDocuments,
  useUploadListingDoc,
  type ListingDocKind,
} from "@/hooks/use-listing-documents";
import { formatDate } from "@/lib/tenders/date";
import { extractErrorMessage } from "@/lib/tenders/error";
import { FileText, Paperclip, Trash2 } from "lucide-react";
import { useState } from "react";
import { useEntityLabels } from "@/i18n/domain";
import { useListingDocKindFieldLabel, useListingDocKindLabel } from "@/components/tenders/use-listing-doc-kind-label";
import { toast } from "sonner";

export function FilesTab({
  listingId,
  isOwner,
  canEdit = false,
  manageHint = false,
  embedded = false,
}: {
  listingId: string;
  isOwner: boolean;
  // İhale belgeleri yalnızca ilan düzenlenebilirken (TASLAK / teklifsiz AÇIK)
  // değiştirilebilir; kapandıktan sonra salt-okunur.
  canEdit?: boolean;
  /** Burada düzenlenmiyor ama Düzenle ekranından yönetilebilir — ipucu yalnız
   *  o zaman (arayüz testi D-250: teklif almış talepte de basılıyordu). */
  manageHint?: boolean;
  /** Başka bir kartın içinde (talep formunun 4. bölümü): telefonda kendi
   *  çerçevesini ve dolgusunu çizmez — kart içinde kart iki kez 20 px dolgu
   *  yiyordu (mobil denetim 2026-10, g06-request-create#new1; yeni talepteki
   *  `StagedDocuments` ile aynı kural). */
  embedded?: boolean;
}) {
  const t = useTranslations("web.panel.requests.filesTab");
  const locale = useLocale();
  const L = useEntityLabels();
  // Belge bölümü adları tek sözlükten — yeni talepteki StagedDocuments ile
  // aynı (mobil denetim fix3 r5-requests#new2: iki ayrı sözlük RU'da ayrışıyordu).
  const docKindLabel = useListingDocKindLabel();
  const docKindFieldLabel = useListingDocKindFieldLabel();
  const confirm = useConfirm();
  const docs = useListingDocuments(listingId, true);
  const upload = useUploadListingDoc(listingId);
  const del = useDeleteListingDoc(listingId);
  // Yükleme öncesi seçilen bölüm — dosya bu kategoriye kaydedilir.
  const [kind, setKind] = useState<ListingDocKind>("IDARI_SARTNAME");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    // 50MB ön-kontrolü — R2 PUT'ta patlamadan anlaşılır mesaj.
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t("n50mbSiniriniAsiyor", { name: file.name }));
      return;
    }
    try {
      await upload.mutateAsync({ file, kind });
      toast.success(t("dosyaYuklendi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("yuklenemedi")));
    }
  };

  const handleDelete = async (docId: string) => {
    if (
      !(await confirm({
        title: t("dosyayiSil"),
        description: t("dosyaSilinsinMi"),
        confirmLabel: t("sil"),
        destructive: true,
      }))
    )
      return;
    try {
      await del.mutateAsync(docId);
      toast.success(t("dosyaSilindi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("silinemedi")));
    }
  };

  const rows = docs.data ?? [];
  // Bölümlere göre grupla; yalnızca dosyası olan bölümler gösterilir.
  const grouped = LISTING_DOC_KINDS.map((k) => ({
    kind: k,
    label: docKindLabel(k),
    items: rows.filter((d) => d.kind === k),
  })).filter((g) => g.items.length > 0);

  return (
    <section className={`card p-5 md:p-6${embedded ? " max-sm:p-0 max-sm:shadow-none max-sm:ring-0" : ""}`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100">
            <FileText className="h-4 w-4 text-zinc-700" />
          </div>
          {/* Başlık yeni talepteki belgeler bölümüyle aynı ad ("Talep
              Dokümanları" / "Документы запроса"; fix3 #new2). */}
          <h3 className="font-semibold text-zinc-900">{L.docs}</h3>
        </div>
        {isOwner && canEdit ? (
          // Telefonda seçici satırın tamamını alır, uzun bölüm adı kırpılır
          // (RU 360: "Административная спецификация" 283 px ile kartı
          // aşıyordu); dosya düğmesi altına iner. sm'den eski dizilim.
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="sr-only" htmlFor="listing-doc-kind">
              {docKindFieldLabel}
            </label>
            <SelectMenu
              id="listing-doc-kind"
              value={kind}
              onChange={(v) => setKind(v as ListingDocKind)}
              className="w-full min-w-0 sm:w-auto sm:min-w-44"
              options={LISTING_DOC_KINDS.map((k) => ({
                value: k,
                label: docKindLabel(k),
              }))}
            />
            <Button as="label" outline>
              <Paperclip data-slot="icon" />
              {upload.isPending ? t("yukleniyor") : t("dosyaEkle")}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls"
                aria-label={t("bolumuneDosyaEkle", { item: docKindLabel(kind) })}
                onChange={handleUpload}
                disabled={upload.isPending}
              />
            </Button>
          </div>
        ) : isOwner && manageHint ? (
          <Text className="text-xs text-zinc-500">
            {t("dosyalarDuzenleEkranindanYonetilir")}
          </Text>
        ) : null}
      </div>

      {/* LİSTE DURUMLARI: `isPending` bekleme (çevrimdışı duraklamada "dosya
          eklenmemiş" çizilmesin); hata dalı yalnız hiç veri yokken. */}
      {docs.isPending ? (
        <Text className="text-sm text-zinc-500">{t("yukleniyor")}</Text>
      ) : docs.isError && docs.data === undefined ? (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Text className="text-sm text-red-600">{t("dosyalarYuklenemedi")}</Text>
          <Button outline onClick={() => docs.refetch()}>
            {t("tekrarDene")}
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100">
            <FileText className="h-6 w-6 text-zinc-400" />
          </div>
          <p className="mt-3 text-sm text-zinc-500">
            {isOwner && canEdit
              ? t("henuzDosyaEklenmemisBolumSecip")
              : t("buDosyaEklenmemis", { dat: L.dat })}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.kind}>
              <div className="mb-2 flex items-center gap-2">
                <h4 className="text-sm font-semibold text-zinc-800">
                  {g.label}
                </h4>
                <Badge color="zinc">{g.items.length}</Badge>
              </div>
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-100">
                {g.items.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate text-sm font-medium text-blue-600 hover:underline"
                    >
                      {d.fileName}
                    </a>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-zinc-500">
                        {formatDate(d.createdAt, locale)}
                      </span>
                      {isOwner && canEdit && d.mine ? (
                        <button
                          type="button"
                          onClick={() => handleDelete(d.id)}
                          aria-label={t("dosyasiniSil", { fileName: d.fileName })}
                          // Dokunma alanı ~36 px (dolgu + eksi kenar boşluğu;
                          // yazı yerinde) — yeni talepteki "Kaldır" ile aynı.
                          className="-mx-2 -my-2.5 inline-flex items-center gap-1 rounded-lg px-2 py-2.5 text-xs text-zinc-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          {t("sil")}
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
