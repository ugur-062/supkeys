"use client";

import { useLocale, useTranslations } from "next-intl";
import { ScopeChip } from "@/components/tenders/scope-chip";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { tierAtLeast } from "@rothern/shared";
import { buyingGate, memberProductHref } from "@/lib/public/member-gate";
import { PRICING_HREF, SilverLockCard } from "@/components/company/silver-lock-card";
import { cameFromInApp } from "@/lib/nav-history";
import { useRouter } from "@/i18n/navigation";
import { formatDate } from "@/lib/format-date";
import { formatNumber } from "@/i18n/format";
import { useClosingUrgency } from "@/i18n/domain";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { Text } from "@/components/catalyst/text";
import { ErrorState } from "@/components/ui/error-state";
import { CompanyProfileView } from "@/components/company/company-profile-view";
import { ProductCard } from "@/components/marketplace/product-card";
import { ListingCard, type ListingCardData } from "@/components/marketplace/listing-card";
import { publicState } from "@/lib/public/marketplace";
import { daysUntil } from "@/lib/tenders/seller-state";
import { useActivePortal } from "@/hooks/use-active-portal";
import { accessiblePortals, type PortalKey } from "@/lib/company/portals";
import { userHasPermission } from "@/lib/company/permissions";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import {
  BLOCK_REASON_MAX,
  COMPLAINT_DETAIL_MAX,
  complaintPayload,
} from "@/lib/company/complaint-payload";
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
  const t = useTranslations("web.panel.company.firmaIdPage");
  const ts = useTranslations("web.marketplace.state");
  const locale = useLocale();
  const closingUrgency = useClosingUrgency();
  const params = useParams<{ id: string }>();
  const rothernId = params.id;
  const { data, isLoading, isError, error, refetch } = useCompanyProfile(rothernId);
  const invite = useInviteConnection();
  const block = useBlockCompany();
  const complaint = useFileComplaint();
  const disconnect = useDisconnect();
  const confirmDialog = useConfirm();
  const activePortal = useActivePortal();
  const [blockOpen, setBlockOpen] = useState(false);
  const [complaintOpen, setComplaintOpen] = useState(false);
  // Bağlantı/engelleme/şikayet = "Bağlantılar" yetkisi (API aynası; Bağlantılar sayfasıyla aynı kural).
  const canManageConn = useHasCompanyPermission("connections:manage");
  // Bağlantı daveti Silver+ (API invite aynası; connections-view `isPaid` ile
  // aynı kural) — ücretsiz pakette düğme yerine Paketler'e giden kilitli CTA.
  const { user: me, company: myCompany } = useCompanyAuth();
  // Ürün kartının "Bilgi iste" düğmesi yalnız eylem gerçekten açıksa (Gold ∧
  // buy:inquiry:send); kart her pakette üyenin ürün sayfasını açar — Gold
  // olmayana orada Gold uyarısı (arayüz testi Y-03, D-038).
  const canInquire = buyingGate(me, myCompany, "inquiry") === "ok";
  const isPaid = tierAtLeast(myCompany?.tier ?? "STANDART", "SILVER");
  // Bu firmanın açık talepleri bizim SATIŞ tarafımızın işidir (davetli
  // olduğumuz alım talepleri): bölüm satış görüntüleme izniyle, "Teklif ver"
  // teklif verme izniyle çizilir. Yalnız satınalma izinli üye kartı açınca
  // talep 404'üne düşüyordu (arayüz testi T3).
  const canSeeSellSide = userHasPermission(me, "sell:view");
  const canSubmitBid = userHasPermission(me, "sell:bid:submit");
  const router = useRouter();

  if (isLoading) {
    return (
      <div className="space-y-4" aria-hidden>
        <div className="h-5 w-28 animate-pulse rounded bg-zinc-100" />
        <div className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />
      </div>
    );
  }
  // Kesinti ≠ yok (arayüz testi D-070): ağ hatası/5xx/429'da "Firma profili
  // bulunamadı" yanıltıyordu; yalnız 4xx (404/403) gerçek "yok"tur.
  const status = (error as { response?: { status?: number } } | null)?.response?.status;
  if (!data && isError && (!status || status >= 500 || status === 429)) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <ErrorState className="mt-6" onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl">
        <BackLink />
        <Text className="mt-6 text-sm text-zinc-500">
          {t("firmaProfiliBulunamadi")}
        </Text>
      </div>
    );
  }

  const { profile: p, connectionStatus, connectionId, connected, listings, products, productCount } =
    data;
  // Ücretsiz izleyen bağsız firmanın herkese açık taleplerini görmez (paket
  // kuralı, kasıtlı) — kaç tane gizlendiğini API söyler (arayüz testi D-329).
  const lockedListingCount = data.lockedListingCount ?? 0;
  // "Bağlanırsanız…" ipucu ve "Sadece herkese açık" etiketi yalnız herkese açık
  // talepleri GÖREN (Silver+) bağsız izleyene doğru; ücretsiz izleyen bağlantı
  // isteği de gönderemez.
  const showPublicOnlyHint = !connected && isPaid;

  const handleConnect = async () => {
    if (!p.rothernId) return;
    try {
      await invite.mutateAsync(p.rothernId);
      toast.success(t("baglantiIstegiGonderildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("istekGonderilemedi")));
    }
  };

  const submitBlock = async (reason: string) => {
    if (!p.rothernId) return;
    try {
      await block.mutateAsync({
        rothernId: p.rothernId,
        reason: reason.trim() || undefined,
      });
      toast.success(t("firmaEngellendi"));
      setBlockOpen(false);
      // Engellenen firmanın profili artık 404 döner; react-query hata alan
      // yeniden çekimde eski veriyi koruduğu için sayfa profil + eylemlerle
      // kalıyordu → Bağlantılar'a çık.
      router.replace(connectionsPathFor(activePortal));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("engellenemedi")));
    }
  };

  const handleDisconnect = async () => {
    if (!connectionId) return;
    const ok = await confirmDialog({
      title: t("baglantiKaldirilsinMi"),
      description: t("ileBaglantinizKaldirilacakDavetliSatin", { name: p.name }),
      confirmLabel: t("kaldir"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await disconnect.mutateAsync(connectionId);
      toast.success(t("baglantiKaldirildi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("baglantiKaldirilamadi")));
    }
  };

  const submitComplaint = async (reason: string) => {
    if (!p.rothernId || reason.trim().length < 3) return;
    try {
      await complaint.mutateAsync({
        rothernId: p.rothernId,
        ...complaintPayload(reason),
      });
      toast.success(t("sikayetGonderildi"));
      setComplaintOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, t("sikayetGonderilemedi")));
    }
  };

  const actions = (
    <>
      {connectionStatus === "active" ? (
        <Badge color="green">{t("baglisiniz")}</Badge>
      ) : connectionStatus === "pending" ? (
        <Badge color="amber">{t("istekGonderildi")}</Badge>
      ) : connectionStatus === "incoming" ? (
        // Gelen istekler görünümü doğrudan açılır (arayüz testi D-328).
        // Yanıtlamak "Bağlantılar" yetkisi ister — yetkisiz üyeye eylem değil
        // durum rozeti (Kabul/Ret orada çizilmiyor, API 403; arayüz testi T3).
        canManageConn ? (
          <Button href={`${connectionsPathFor(activePortal)}?view=incoming`} outline>
            {t("sizeIstekGonderdiYanitla")}
          </Button>
        ) : (
          <Badge color="amber">{t("sizeIstekGonderdi")}</Badge>
        )
      ) : connectionStatus === "none" && canManageConn ? (
        isPaid ? (
          /* MAVİ: bu sayfaya satınalma pazarından geliniyor ve orada birincil
             eylem rengi mavi (kullanıcı kuralı: satınalmada siyah yok). */
          <Button color="blue" onClick={handleConnect} disabled={invite.isPending}>
            {t("baglantiIstegiGonder")}
          </Button>
        ) : (
          <Button outline href={PRICING_HREF}>
            <Lock data-slot="icon" />
            {t("baglantiIcinSilver")}
          </Button>
        )
      ) : null}

      {connectionStatus !== "self" && canManageConn ? (
        <Dropdown>
          <DropdownButton plain aria-label={t("dahaFazla")}>
            <MoreVertical className="h-5 w-5" />
          </DropdownButton>
          <DropdownMenu anchor="bottom end">
            {connectionStatus === "active" ? (
              <DropdownItem
                onClick={handleDisconnect}
                disabled={disconnect.isPending}
              >
                <Unlink data-slot="icon" />
                {t("baglantiyiKaldir")}
              </DropdownItem>
            ) : null}
            <DropdownItem
              onClick={() => setBlockOpen(true)}
              disabled={block.isPending}
            >
              <Ban data-slot="icon" />
              {t("engelle")}
            </DropdownItem>
            <DropdownItem
              onClick={() => setComplaintOpen(true)}
              disabled={complaint.isPending}
            >
              <Flag data-slot="icon" />
              {t("sikayetEt")}
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
            {t("tumUrunlerVeHizmetler", { count: formatNumber(productCount, locale) })}
          </h2>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((pr) => (
            <ProductCard
              key={pr.slug}
              product={pr}
              href={memberProductHref(me, myCompany, pr.company.slug, pr.slug)}
              cta={canInquire ? t("bilgiIste") : undefined}
              accent="blue"
            />
          ))}
        </div>
        {/* Panel ucu ilk 24 ürünü döner (sayfalama yok). Sayı büyükse bunu
            AÇIKÇA yazıyoruz — "hepsi bu kadar" izlenimi vermek yanlış olurdu;
            sahte bir "daha fazla" düğmesi de basmıyoruz (hedefi yok). */}
        {productCount > products.length ? (
          <p className="tnum mt-4 text-sm text-zinc-500">
            {t("urunGosteriliyor", { shown: products.length, total: productCount })}
          </p>
        ) : null}
      </section>
    ) : null;

  const tenders = (
    <section className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">{t("acikSatinAlmaTalepleri")}</h2>
        {showPublicOnlyHint ? (
          <span className="inline-flex items-center gap-2 text-xs text-zinc-500">
            <Lock className="h-3.5 w-3.5" />
            {t("sadeceHerkeseAcik")}
          </span>
        ) : null}
      </div>

      {showPublicOnlyHint ? (
        <Text className="mt-1 text-xs text-zinc-500">
          {t("baglanirsanizBuFirmaninDavetliSatin")}
        </Text>
      ) : null}

      {listings.length === 0 && lockedListingCount > 0 ? null : listings.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center text-sm text-zinc-500">
          {t("suAnAcikSatinAlma")}
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
                label: ts(state),
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
                  label: t("format"),
                  icon: "info",
                  value: (
                    <span className="font-medium text-slate-800">
                      {l.format === "ENGLISH_AUCTION" ? t("pazarlikEksiltme") : t("teklifToplama")}
                    </span>
                  ),
                },
                {
                  label: t("kalem"),
                  icon: "items",
                  value:
                    typeof l.itemCount === "number" ? (
                      <span className="flex items-baseline gap-1">
                        {t.rich("kalemBirimi", {
                          n: l.itemCount,
                          num: (chunks) => <span className="font-semibold tabular-nums text-slate-900">{chunks}</span>,
                          unit: (chunks) => <span className="text-[11px] text-slate-500">{chunks}</span>,
                        })}
                      </span>
                    ) : (
                      <span className="text-slate-500">—</span>
                    ),
                },
                {
                  label: t("gorunurluk"),
                  icon: "scope",
                  value: <ScopeChip targetCountries={l.targetCountries} />,
                },
                {
                  label: t("kapanis"),
                  icon: "closing",
                  value: (
                    <span title={l.closesAt ? formatDate(l.closesAt, "datetime", locale) : undefined}>
                      <span className={cn("font-semibold", urgency && days <= 3 ? urgency.className : "text-slate-900")}>
                        {l.closesAt ? formatDate(l.closesAt, "short", locale) : "—"}
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
                // Kendi profilinde kendi talebine teklif verilmez; teklif
                // verme izni yoksa CTA yok (talep detayı rol notunu söyler).
                activePortal === "satis" &&
                state === "open" &&
                connectionStatus !== "self" &&
                canSubmitBid
                  ? { label: t("teklifVer"), href }
                  : null,
            };
            return <ListingCard key={l.id} variant="row" data={data} />;
          })}
        </div>
      )}
      {lockedListingCount > 0 ? (
        <SilverLockCard
          className="mt-4"
          title={t("kilitliTaleplerBaslik")}
          meta={t("kilitliTaleplerSayi", { n: lockedListingCount })}
          description={t("kilitliTaleplerAciklama")}
        />
      ) : null}
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
            {canSeeSellSide ? tenders : null}
          </>
        }
      />

      <ReasonDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        onSubmit={submitBlock}
        title={t("firmayiEngelle")}
        description={t("siziGoremezVeSizinleIslem", { name: p.name })}
        confirmLabel={t("engelle")}
        maxLength={BLOCK_REASON_MAX}
        destructive
        pending={block.isPending}
      />
      <ReasonDialog
        open={complaintOpen}
        onClose={() => setComplaintOpen(false)}
        onSubmit={submitComplaint}
        title={t("sikayetEt")}
        description={t("hakkindakiSikayetinizPlatformYonetimineIleti", { name: p.name })}
        confirmLabel={t("sikayetiGonder")}
        minLength={3}
        maxLength={COMPLAINT_DETAIL_MAX}
        destructive
        pending={complaint.isPending}
      />
    </div>
  );
}

/**
 * Bulunulan portalın Bağlantılar sayfası. Portal `useActivePortal`dan gelir
 * (adres → son portal YALNIZ erişilebilirse → erişilebilir ilk portal): satış
 * koltuklu kullanıcının son portal bilgisi boşken satınalma ret ekranına
 * düşüyordu (arayüz testi D-069).
 */
function connectionsPathFor(portal: PortalKey): string {
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
  const t = useTranslations("web.panel.company.firmaIdPage");
  const router = useRouter();
  const portal = useActivePortal();
  const { user, company } = useCompanyAuth();
  // Bağlantılar yalnız açılabilen portala; hiçbiri açılmıyorsa (ör. Gold
  // altındaki yalnız satınalma görüntüleyicisi) panel köküne "Geri" — eskiden
  // açamadığı /company/satis/musterilerim'e götürüyordu (arayüz testi T3).
  const reachable = accessiblePortals(user, company?.tier).includes(portal);
  const fallback = reachable ? connectionsPathFor(portal) : "/company";
  const [canGoBack, setCanGoBack] = useState(false);
  useEffect(() => {
    try {
      const sameOrigin = document.referrer ? new URL(document.referrer).origin === window.location.origin : false;
      // Referrer istemci tarafı gezinmede değişmez → uygulama içi iz de
      // sayılır (arayüz testi D-156).
      setCanGoBack(window.history.length > 1 && (sameOrigin || cameFromInApp()));
    } catch {
      setCanGoBack(false);
    }
  }, []);
  const cls = "inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700";
  if (canGoBack) {
    return (
      <button type="button" onClick={() => router.back()} className={cls}>
        <ArrowLeft className="h-4 w-4" />
        {t("geri")}
      </button>
    );
  }
  return (
    <Link href={fallback} className={cls}>
      <ArrowLeft className="h-4 w-4" />
      {reachable ? t("baglantilar") : t("geri")}
    </Link>
  );
}
