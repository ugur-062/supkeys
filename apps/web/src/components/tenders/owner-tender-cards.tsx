"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { EmptyState, ListSkeleton, type ListView } from "@/components/list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import {
  TenderStatusBadge,
  TenderTypeBadge,
} from "@/components/tenders/status-badge";
import { Button } from "@/components/ui/button";
import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { canManageListing } from "@/lib/tenders/can-manage-listing";
import { usePublishListing } from "@/hooks/use-company-listings";
import type { TenderListItem } from "@/hooks/use-company-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { closingUrgency } from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import {
  Calendar,
  ClipboardList,
  Eye,
  Gavel,
  Globe,
  Link2,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Rocket,
  User as UserIcon,
  Users,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

/** Sahip ihalesi kartı — Satın Al / Açık İhaleler kart dilinin sahip sürümü:
 *  numara + başlık + durum rozeti, usul/kapsam rozetleri, davet-teklif
 *  sayaçları, açan kişi, kapanış + aciliyet. */
export function OwnerTenderCard({
  t,
  listingType = "ALIM",
}: {
  t: TenderListItem;
  listingType?: "ALIM" | "SATIS";
}) {
  const isSatis = listingType === "SATIS";
  const urgency = closingUrgency(t.status, t.bidsCloseAt);
  // F7: taslak Düzenle/Yayınla yönetim aksiyonudur — backend
  // assertListingManageRole (izin ∧ oluşturan) ile birebir kapı.
  const hasManagePermission = useHasCompanyPermission(
    isSatis ? "sell:listing:manage" : "buy:listing:manage",
  );
  const { user } = useCompanyAuth();
  const canManage = canManageListing({
    hasManagePermission,
    createdById: t.createdById,
    userId: user?.id,
  });
  const publish = usePublishListing(t.id);
  const fromHref = isSatis
    ? "/company/satis/ilanlarim"
    : "/company/satinalma/ihalelerim";
  const fromLabel = isSatis ? "Satış İhalelerim" : "İhalelerim";
  const detailHref = `/company/ilan/${t.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`;
  const editHref = isSatis
    ? `/company/satis/ilanlarim/${t.id}/duzenle`
    : `/company/satinalma/ihalelerim/${t.id}/duzenle`;

  const handlePublish = async () => {
    try {
      const res = await publish.mutateAsync(undefined);
      toast.success(
        res.status === "IN_APPROVAL"
          ? "İlan yayın onayına gönderildi"
          : "İhale yayınlandı",
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Yayınlanamadı"));
    }
  };

  // P2 (denetim §10.2): kart <a> DEĞİL — başlıktaki stretched-link kartı
  // tıklanabilir kılar, kebab/aksiyon butonları relative z-10 ile üstünde
  // kalır (iç içe interaktif eleman / stopPropagation hack'i biter).
  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-950/10 bg-white p-5 pl-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        isSatis ? "hover:border-emerald-300" : "hover:border-blue-300",
      )}
    >
        {/* Sol aksan şeridi — portal rengi */}
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1",
            isSatis
              ? "bg-gradient-to-b from-emerald-500 to-emerald-300"
              : "bg-gradient-to-b from-blue-500 to-blue-300",
          )}
        />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 tabular-nums text-xs font-medium text-zinc-600">
                {t.tenderNumber || "—"}
              </span>
            </div>
            <h3
              className={cn(
                "mt-1.5 line-clamp-2 text-[15px] leading-snug font-semibold text-zinc-950 transition-colors",
                isSatis
                  ? "group-hover:text-emerald-700"
                  : "group-hover:text-blue-700",
              )}
            >
              <Link
                href={detailHref}
                aria-label={`${t.tenderNumber ?? ""} ${t.title}`.trim()}
                className="after:absolute after:inset-0 after:content-['']"
              >
                {t.title}
              </Link>
            </h3>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <TenderStatusBadge status={t.status} />
            {/* Hızlı aksiyonlar — stretched-link'in üstünde (z-10). */}
            <span className="relative z-10">
              <Dropdown>
                <DropdownButton
                  plain
                  aria-label="Hızlı aksiyonlar"
                  className="!p-1.5"
                >
                  <MoreVertical className="size-4 text-zinc-400" />
                </DropdownButton>
                <DropdownMenu anchor="bottom end">
                  <DropdownItem href={detailHref}>
                    <Eye data-slot="icon" />
                    <DropdownLabel>Görüntüle</DropdownLabel>
                  </DropdownItem>
                  {/* P2 (denetim §10.2): tek "Görüntüle"lik menü bitti —
                      gerçek aksiyon: paylaşılabilir detay bağlantısı. */}
                  <DropdownItem
                    onClick={() => {
                      navigator.clipboard
                        .writeText(
                          `${window.location.origin}/company/ilan/${t.id}`,
                        )
                        .then(() => toast.success("Bağlantı kopyalandı"))
                        .catch(() => toast.error("Kopyalanamadı"));
                    }}
                  >
                    <Link2 data-slot="icon" />
                    <DropdownLabel>Bağlantıyı Kopyala</DropdownLabel>
                  </DropdownItem>
                  {canManage && t.status === "DRAFT" ? (
                    <>
                      <DropdownItem href={editHref}>
                        <Pencil data-slot="icon" />
                        <DropdownLabel>Düzenle</DropdownLabel>
                      </DropdownItem>
                      <DropdownItem
                        onClick={handlePublish}
                        disabled={publish.isPending}
                      >
                        <Rocket data-slot="icon" />
                        <DropdownLabel>
                          {publish.isPending ? "Yayınlanıyor…" : "Yayınla"}
                        </DropdownLabel>
                      </DropdownItem>
                    </>
                  ) : null}
                </DropdownMenu>
              </Dropdown>
            </span>
          </div>
        </div>

        {/* Rozetler + sayaç çipleri */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TenderTypeBadge format={t.format} listingType={t.type} />
          <Badge color="zinc">
            {t.isInternational ? (
              <Globe className="size-3" aria-hidden="true" />
            ) : (
              <MapPin className="size-3" aria-hidden="true" />
            )}
            {t.isInternational ? "Uluslararası" : "Yurtiçi"}
          </Badge>
          <span className="inline-flex items-center gap-2 rounded-lg bg-zinc-50 px-2.5 py-1 text-xs text-zinc-600 ring-1 ring-zinc-950/5">
            <Users className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            <strong className="font-semibold text-zinc-800">
              {t.invitationCount}
            </strong>
            davetli
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-2.5 py-1 text-xs ring-1",
              t.bidCount > 0
                ? isSatis
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-100"
                  : "bg-blue-50 text-blue-700 ring-blue-100"
                : "bg-zinc-50 text-zinc-600 ring-zinc-950/5",
            )}
          >
            <Gavel className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
            <strong className="font-semibold">{t.bidCount}</strong>
            teklif
          </span>
        </div>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-xs">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-zinc-500">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            <span>
              {t.bidsCloseAt
                ? `Kapanış ${format(new Date(t.bidsCloseAt), "dd MMM HH:mm", { locale: tr })}`
                : "Kapanış belirlenmedi"}
            </span>
            <span className="mx-1 text-zinc-300" aria-hidden>
              ·
            </span>
            <UserIcon className="h-3 w-3 text-zinc-400" aria-hidden="true" />
            <span className="truncate">
              {t.createdBy.firstName} {t.createdBy.lastName}
            </span>
            {urgency ? (
              <span
                className={cn(
                  "ml-1 rounded-full bg-current/10 px-2.5 py-1 font-semibold whitespace-nowrap",
                  urgency.className,
                )}
              >
                {urgency.text}
              </span>
            ) : null}
          </div>
          {/* P2 (denetim §10.2): duruma göre TEK kart aksiyonu — 3 tık biter. */}
          <Link
            href={canManage && t.status === "DRAFT" ? editHref : detailHref}
            className="relative z-10 inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 font-semibold text-zinc-700 ring-1 ring-zinc-950/10 transition hover:bg-zinc-50"
          >
            {canManage && t.status === "DRAFT"
              ? "Düzenle"
              : t.status === "AWARDED"
                ? "Sonucu Gör"
                : t.bidCount > 0
                  ? "Teklifleri Gör"
                  : "Detaya Git"}
            <ArrowRightIcon className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
    </div>
  );
}

/** Kart listesi + yükleniyor/hata/boş durumları (Satın Al görünüm dili). */
export function OwnerTenderList({
  items,
  isLoading,
  isError,
  onRetry,
  listingType = "ALIM",
  emptyCtaLabel = "Yeni İhale Aç",
  view = "cards",
}: {
  items: TenderListItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  listingType?: "ALIM" | "SATIS";
  emptyCtaLabel?: string;
  /** P2 (denetim §10.2): kart (tarama) / yoğun tablo (karşılaştırma). */
  view?: ListView;
}) {
  // F7: boş-durum CTA'sı da ilan-açma iznine bağlı (yalnız SA/ST).
  const canCreate = useHasCompanyPermission(
    listingType === "SATIS" ? "sell:listing:create" : "buy:listing:create",
  );
  if (isError) {
    return (
      <div className="space-y-3">
        <EmptyState
          icon={ClipboardList}
          title="Veri alınamadı."
          description="Bir hata oluştu — tekrar deneyin."
          variant="no-results"
        />
        <div className="text-center">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Tekrar dene
          </Button>
        </div>
      </div>
    );
  }
  if (isLoading && items.length === 0) {
    return <ListSkeleton rows={5} />;
  }
  if (items.length === 0) {
    const createHref =
      listingType === "SATIS"
        ? "/company/satis/ilanlarim/yeni"
        : "/company/satinalma/ihalelerim/yeni";
    return (
      <EmptyState
        icon={ClipboardList}
        title="Henüz ihale yok"
        description={
          canCreate
            ? "İlk ihaleni birkaç dakikada oluşturabilirsin — davetlileri seç, kalemleri gir, yayınla."
            : "İhale açma işlem rolü (Satın Almacı/Satışçı) gerektirir."
        }
        variant="no-data"
        action={
          canCreate ? (
            <Link
              href={createHref}
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              <Plus className="size-4" aria-hidden />
              {emptyCtaLabel}
            </Link>
          ) : undefined
        }
      />
    );
  }
  if (view === "table") {
    return (
      <div className="rounded-2xl border border-zinc-950/5 bg-white px-2 shadow-sm [--gutter:--spacing(4)]">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>No</TableHeader>
              <TableHeader>İhale</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader className="text-right">Teklif</TableHeader>
              <TableHeader className="text-right">Davetli</TableHeader>
              <TableHeader className="text-right">Kapanış</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((t) => {
              const fromHref =
                listingType === "SATIS"
                  ? "/company/satis/ilanlarim"
                  : "/company/satinalma/ihalelerim";
              const fromLabel =
                listingType === "SATIS" ? "Satış İhalelerim" : "İhalelerim";
              return (
                <TableRow key={t.id}>
                  <TableCell className="font-mono text-xs text-zinc-500 tabular-nums">
                    {t.tenderNumber ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-64">
                    <Link
                      href={`/company/ilan/${t.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`}
                      title={t.title}
                      className="block truncate font-medium text-zinc-900 hover:underline"
                    >
                      {t.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TenderStatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-600">
                    {t.bidCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-zinc-600">
                    {t.invitationCount}
                  </TableCell>
                  <TableCell className="text-right text-zinc-600">
                    {t.bidsCloseAt
                      ? format(new Date(t.bidsCloseAt), "dd MMM HH:mm", {
                          locale: tr,
                        })
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  }
  // P2 (denetim §10.2): tek kolon tam-genişlik kart yerine lg'de iki kolon.
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      {items.map((t) => (
        <OwnerTenderCard key={t.id} t={t} listingType={listingType} />
      ))}
    </div>
  );
}
