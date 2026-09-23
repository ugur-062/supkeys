"use client";

import { ScopeChip } from "@/components/tenders/scope-chip";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { usePortalStore } from "@/lib/company/portal-store";
import { useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { Text } from "@/components/catalyst/text";
import { CompanyProfileView } from "@/components/company/company-profile-view";
import { ProductCard } from "@/components/marketplace/product-card";
import { ListingCard, type ListingCardData } from "@/components/marketplace/listing-card";
import { STATE_LABEL, publicState } from "@/lib/public/marketplace";
import { closingUrgency, daysUntil } from "@/lib/tenders/seller-state";
import { useActivePortal } from "@/hooks/use-active-portal";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import {
  useBlockCompany,
  useDisconnect,
  useInviteConnection,
} from "@/hooks/use-company-connections";
import { useFileComplaint } from "@/hooks/use-company-complaints";
import { useCompanyProfile } from "@/hooks/use-company-directory";
import { extractErrorMessage } from "@/lib/tenders/error";
import { ArrowLeft, Ban, Flag, Lock, MoreVertical, Unlink } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function CompanyProfilePage() {
  const params = useParams<{ id: string }>();
  const rothernId = params.id;
  const { data, isLoading } = useCompanyProfile(rothernId);
  const invite = useInviteConnection();
  const block = useBlockCompany();
  const complaint = useFileComplaint();
  const disconnect = useDisconnect();
  const confirmDialog = useConfirm();
  const activePortal = useActivePortal();
  const [blockOpen, setBlockOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  const lastPortal = usePortalStore((st) => st.lastPortal);
  // Bağlantı/engelleme/şikayet = "Bağlantılar" yetkisi (API aynası; Bağlantılar sayfasıyla aynı kural).
  const canManageConn = useHasCompanyPermission("connections:manage");

  if (isLoading) {
    return (
      <div className="space-y-4" aria-hidden>
        <div className="h-5 w-28 animate-pulse rounded bg-zinc-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <Text className="mt-6 text-sm text-zinc-500">
          Firma profili bulunamadı.
        </Text>
      </div>
    );
  }

  const { profile: p, connectionStatus, connectionId, connected, listings, products, productCount } =
    data;

  const handleConnect = async () => {
    if (!p.rothernId) return;
    try {
      await invite.mutateAsync(p.rothernId);
      toast.success("Bağlantı isteği gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İstek gönderilemedi"));
    }
  };

  const submitBlock = async (reason: string) => {
    if (!p.rothernId) return;
    try {
      await block.mutateAsync({
        rothernId: p.rothernId,
        reason: reason.trim() || undefined,
      });
      toast.success("Firma engellendi");
      setBlockOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Engellenemedi"));
    }
  };

  const handleDisconnect = async () => {
    if (!connectionId) return;
    const ok = await confirmDialog({
      title: "Bağlantı kaldırılsın mı?",
      description: `"${p.name}" ile bağlantınız kaldırılacak; davetli satın alma taleplerini artık göremezsiniz.`,
      confirmLabel: "Kaldır",
      destructive: true,
    });
    if (!ok) return;
    try {
      await disconnect.mutateAsync(connectionId);
      toast.success("Bağlantı kaldırıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Bağlantı kaldırılamadı"));
    }
  };

  const submitComplaint = async (reason: string) => {
    if (!p.rothernId || reason.trim().length < 3) return;
    try {
      await complaint.mutateAsync({
        rothernId: p.rothernId,
        reason: reason.trim(),
      });
      toast.success("Şikayet gönderildi");
      setComplaintOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şikayet gönderilemedi"));
    }
  };

  const actions = (
    <>
      {connectionStatus === "active" ? (
        <Badge color="green">Bağlısınız</Badge>
      ) : connectionStatus === "pending" ? (
        <Badge color="amber">İstek gönderildi</Badge>
      ) : connectionStatus === "incoming" ? (
        <Button href={connectionsPathFor(lastPortal)} outline>
          Size istek gönderdi — Yanıtla
        </Button>
      ) : connectionStatus === "none" && canManageConn ? (
        /* MAVİ: bu sayfaya satınalma pazarından geliniyor ve orada birincil
           eylem rengi mavi (kullanıcı kuralı: satınalmada siyah yok). */
        <Button color="blue" onClick={handleConnect} disabled={invite.isPending}>
          Bağlantı İsteği Gönder
        </Button>
      ) : null}

      {connectionStatus !== "self" && canManageConn ? (
        <Dropdown>
          <DropdownButton plain aria-label="Daha fazla">
            <MoreVertical className="h-5 w-5" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            {connectionStatus === "active" ? (
              <DropdownItem
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
              >
                <Unlink data-slot="icon" />
                Bağlantıyı Kaldır
              </DropdownItem>
            ) : null}
            <DropdownItem
              onClick={() => setBlockOpen(true)}
              disabled={block.isPending}
            >
              <Ban data-slot="icon" />
              Engelle
            </DropdownItem>
            <DropdownItem
              onClick={() => setComplaintOpen(true)}
              disabled={complaint.isPending}
            >
              <Flag data-slot="icon" />
              Şikayet Et
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      ) : null}
    </>
  );

  // ÜRÜNLER — herkese açık profildeki ızgarayla AYNI kart ve kapı; üye fiyatı görür.
  const productsBlock =
    products.length > 0 ? (
      <section id="urunler" className="scroll-mt-24">
        <div className="flex flex-wrap items-end justify-between gap-3">
          {/* Başlık ve ızgara herkese açık profille AYNI (kaynak kalıp):
              sayı parantezde, dört sütun, tam genişlik. */}
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950">
            Tüm Ürünler ve Hizmetler ({productCount.toLocaleString("tr-TR")})
          </h2>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((pr) => (
            <ProductCard
              key={pr.slug}
              product={pr}
              href={`/company/satinalma/urunler/${pr.company.slug}/${pr.slug}`}
              cta="Bilgi iste"
              accent="blue"
            />
          ))}
        </div>
        {/* Panel ucu ilk 24 ürünü döner (sayfalama yok). Sayı büyükse bunu
            AÇIKÇA yazıyoruz — "hepsi bu kadar" izlenimi vermek yanlış olurdu;
            sahte bir "daha fazla" düğmesi de basmıyoruz (hedefi yok). */}
        {productCount > products.length ? (
          <p className="tnum mt-4 text-sm text-zinc-500">
            {products.length.toLocaleString("tr-TR")} / {productCount.toLocaleString("tr-TR")} ürün gösteriliyor.
          </p>
        ) : null}
      </section>
    ) : null;

  const tenders = (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">Açık Satın Alma Talepleri</h2>
        {!connected ? (
          <span className="inline-flex items-center gap-2 text-xs text-zinc-400">
            <Lock className="h-3.5 w-3.5" />
            Sadece herkese açık
          </span>
        ) : null}
      </div>

      {!connected ? (
        <Text className="mt-1 text-xs text-zinc-500">
          Bağlanırsanız bu firmanın davetli satın alma taleplerini de görürsünüz.
        </Text>
      ) : null}

      {listings.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center text-sm text-zinc-500">
          Şu an açık satın alma talebi yok.
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {/* SATIR KARTI (2026-09-17, kullanıcı: "satınalma talebi boxları çok
              düz"): Açık Talepler / herkese açık dizinle AYNI `ListingCard row`
              — kategori tonlu ikon, sol renk şeridi, sütunlar (Format · Kalem ·
              Kapsam · Kapanış + kalan süre) ve satış portalında "Teklif ver". */}
          {listings.map((l) => {
            const state = publicState(l.status);
            const urgency = closingUrgency(l.status, l.closesAt);
            const days = daysUntil(l.closesAt) ?? 99;
            const href = `/company/ilan/${l.id}?from=${encodeURIComponent(
              `/company/firma/${rothernId}`,
            )}&fromLabel=${encodeURIComponent(p.name)}`;
            const data: ListingCardData = {
              id: l.id,
              href,
              number: l.number,
              title: l.title,
              kind: "talep",
              categoryIds: l.categoryIds ?? [],
              status: {
                label: STATE_LABEL[state],
                className:
                  state === "open"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : state === "evaluating"
                      ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-slate-200 bg-slate-50 text-slate-600",
              },
              strip: state === "open" ? "border-l-emerald-500" : "border-l-slate-400",
              facts: [
                {
                  label: "Format",
                  value: (
                    <span className="font-medium text-slate-800">
                      {l.format === "ENGLISH_AUCTION" ? "Pazarlık (Eksiltme)" : "Teklif Toplama"}
                    </span>
                  ),
                },
                {
                  label: "Kalem",
                  value:
                    typeof l.itemCount === "number" ? (
                      <span className="flex items-baseline gap-1">
                        <span className="font-semibold tabular-nums text-slate-900">{l.itemCount}</span>
                        <span className="text-[11px] text-slate-500">kalem</span>
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    ),
                },
                {
                  label: "Görünürlük",
                  value: <ScopeChip targetCountries={l.targetCountries} />,
                },
                {
                  label: "Kapanış",
                  value: (
                    <span title={l.closesAt ? formatDate(l.closesAt, "datetime") : undefined}>
                      <span className={cn("font-semibold", urgency && days <= 3 ? urgency.className : "text-slate-900")}>
                        {l.closesAt ? formatDate(l.closesAt, "short") : "—"}
                      </span>
                      {urgency ? (
                        <span className="mt-1 block">
                          <span
                            className={cn(
                              "inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1",
                              days <= 1
                                ? "bg-rose-50 text-rose-700 ring-rose-200"
                                : days <= 3
                                  ? "bg-amber-50 text-amber-700 ring-amber-200"
                                  : "bg-slate-50 text-slate-600 ring-slate-200",
                            )}
                          >
                            {urgency.text}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  ),
                },
              ],
              action:
                activePortal === "satis" && state === "open"
                  ? { label: "Teklif ver", href }
                  : null,
            };
            return <ListingCard key={l.id} variant="row" data={data} />;
          })}
        </div>
      )}
    </section>
  );

  return (
    <div className="space-y-6">
      <BackLink />
      {/* Herkese açık `/firma/<slug>` ile AYNI düzen (tek bileşen): kimlik →
          Hakkında → ürünler → açık talepler (üyeye özel) · sağda hizmet,
          sertifika, değerlendirmeler. Üye ek olarak Rothern ID, iletişim ve
          puan dağılımını görür. */}
      <CompanyProfileView
        profile={p}
        actions={actions}
        main={
          <>
            {productsBlock}
            {tenders}
          </>
        }
      />

      <ReasonDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onSubmit={submitBlock}
        title="Firmayı Engelle"
        description={`"${p.name}" sizi göremez ve sizinle işlem yapamaz; mevcut bağlantı kaldırılır. Gerekçe kayda geçer.`}
        confirmLabel="Engelle"
        destructive
        pending={block.isPending}
      />
      <ReasonDialog
        open={complaintOpen}
        onClose={() => setComplaintOpen(false)}
        onSubmit={submitComplaint}
        title="Şikayet Et"
        description={`"${p.name}" hakkındaki şikayetiniz platform yönetimine iletilir.`}
        confirmLabel="Şikayeti Gönder"
        minLength={3}
        destructive
        pending={complaint.isPending}
      />
    </div>
  );
}

/** Bulunulan portalın Bağlantılar sayfası (satış koltuklu kullanıcı satınalmaya düşmesin). */
function connectionsPathFor(portal: "satinalma" | "satis" | null): string {
  return portal === "satis" ? "/company/satis/musterilerim" : "/company/satinalma/tedarikcilerim";
}

/**
 * GERİ (2026-09-10, kullanıcı): sayfaya anasayfadaki firma listesinden,
 * dizinden ya da Bağlantılar'dan gelinebilir — eskiden hep Bağlantılar'a
 * dönüyordu. Uygulama içinden gelindiyse tarayıcı geçmişine döner (geldiği
 * yer neyse oraya); doğrudan açıldıysa (yeni sekme, e-posta) portalın
 * Bağlantılar sayfasına düşer.
 */
function BackLink() {
  const router = useRouter();
  const lastPortal = usePortalStore((st) => st.lastPortal);
  const fallback = connectionsPathFor(lastPortal);
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    try {
      const sameOrigin = document.referrer ? new URL(document.referrer).origin === window.location.origin : false;
      setCanGoBack(window.history.length > 1 && sameOrigin);
    } catch {
      setCanGoBack(false);
    }
  }, []);
  const cls = "inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700";
  if (canGoBack) {
    return (
      <button type="button" onClick={() => router.back()} className={cls}>
        <ArrowLeft className="h-4 w-4" />
        Geri
      </button>
    );
  }
  return (
    <Link href={fallback} className={cls}>
      <ArrowLeft className="h-4 w-4" />
      Bağlantılar
    </Link>
  );
}
