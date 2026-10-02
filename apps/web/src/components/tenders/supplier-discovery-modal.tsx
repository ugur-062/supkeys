"use client";

import { useLocale, useTranslations } from "next-intl";
import { recipientLocale, type Locale } from "@rothern/i18n";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { useInviteConnection } from "@/hooks/use-company-connections";
import { isInviteAccepted } from "@/lib/tenders/external-invite-status";
import { MAX_PENDING_EXTERNAL_INVITES } from "@/lib/tenders/quick-draft";
import {
  useExternalSupplierDiscovery,
  useExternalTenderInvite,
  useInviteDiscoveredMembers,
  useSupplierDiscovery,
  type DiscoveryCandidate,
  type ExternalCandidate,
  type ExternalInviteStatus,
  type ExternalInviteTarget,
} from "@/hooks/use-supplier-discovery";
import { InviteLocaleSelect } from "@/components/company/invite-locale-select";
import { countryDisplayName } from "@/i18n/domain";
import { useListingDetail } from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
import { GOLD_HREF } from "@/lib/public/member-gate";
import { cn } from "@/lib/utils";
import axios from "axios";
import { Link } from "@/i18n/navigation";
import {
  Building2,
  Check,
  Globe,
  Loader2,
  Mail,
  MapPin,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/**
 * "AI ile daha fazla tedarikçiye eriş" — Faz A: platform dizininden ihale
 * kategorileriyle ya da vitrinindeki ürünle kalemlere eşleşen, bağlantısız
 * firmalar. Talepten açılışta (2026-09-28, kullanıcı: "sistemimize kayıtlıysa
 * doğrudan davet etsin") üye DOĞRUDAN TALEBE davet edilir — bağlantı şartı
 * yok; talepsiz açılışta eskisi gibi BAĞLANTI daveti gider.
 */
export function SupplierDiscoveryModal({
  isOpen,
  onClose,
  categoryIds,
  itemNames = [],
  listingId,
  targetCountries,
  collected = [],
  onCollect,
}: {
  isOpen: boolean;
  onClose: () => void;
  categoryIds: string[];
  /** Faz B — web aramasına bağlam (kalem adları). */
  itemNames?: string[];
  /** Faz C — dış davet gönderimi bu ihale bağlamıyla yapılır. */
  listingId?: string;
  /** Yayın öncesi — web aramasının konumu talebin görünürlük ülkelerinden (boş = tüm ülkeler). */
  targetCountries?: string[];
  /**
   * YAYIN ÖNCESİ TOPLAMA (2026-09-27): talep henüz yoksa e-posta HEMEN
   * GİTMEZ — seçilen alıcılar (adres + dil + ülke) forma eklenir, yayın
   * sonrası talebe özel davet (`external-tender-invite`) gider. Eskiden bu
   * kipte genel "Rothern'e katıl" daveti (`invite-by-email/batch`)
   * gidiyordu; talepten habersiz bir e-posta.
   */
  onCollect?: (invites: ExternalInviteTarget[]) => void;
  /** Forma eklenmiş adresler — satırda "Talebe eklendi" görünür. */
  collected?: string[];
}) {
  const tr = useTranslations("web.panel.requests.supplierDiscoveryModal");
  const tStatus = useTranslations("web.panel.requests.externalInviteStatus");
  const tAi = useTranslations("web.panel.requests.aiSuppliers");
  const tMember = useTranslations("web.panel.requests.memberInviteStatus");
  const uiLocale = useLocale() as Locale;
  const [tab, setTab] = useState<"platform" | "external">("platform");
  // listingId verildiyse (ihale detayından açılış) bağlamı kendisi çeker —
  // çağıranın kategori/kalem taşıması gerekmez.
  const detail = useListingDetail(listingId && isOpen ? listingId : "");
  const effCategoryIds =
    categoryIds.length > 0
      ? categoryIds
      : ((detail.data?.categoryIds as string[] | undefined) ?? []);
  const effItemNames =
    itemNames.length > 0
      ? itemNames
      : ((detail.data?.items as Array<{ name?: string }> | undefined) ?? [])
          .map((i) => i.name ?? "")
          .filter(Boolean);
  const discovery = useSupplierDiscovery();
  const invite = useInviteConnection();
  const inviteMembers = useInviteDiscoveredMembers();
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  // Öneri çağrısı hatası (403 paket kilidi dahil) BOŞ SONUÇ DEĞİLDİR — arayüz
  // testi O-058: 403 "önerilebilecek yeni firma bulunamadı" diye gösteriliyordu.
  const [loadError, setLoadError] = useState<string | null>(null);
  // 403 TIER_REQUIRED (sayfa açıkken Gold düştü / süresi bitti): hata metninin
  // altında Gold CTA'sı; istemcideki firma verisi bayat olabileceği için karar
  // sunucunun koduna göre verilir (arayüz testi webB-04 yeniden doğrulama).
  const [tierLocked, setTierLocked] = useState(false);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<string | null>(null);

  // Faz B/C durumları
  const external = useExternalSupplierDiscovery();
  const sendExternal = useExternalTenderInvite();
  const collectMode = !listingId && !!onCollect;
  const collectedSet = new Set(collected);
  const [externalResults, setExternalResults] = useState<ExternalCandidate[]>([]);
  const [region, setRegion] = useState("");
  const [emailDrafts, setEmailDrafts] = useState<Record<number, string>>({});
  // Satır başına davet dili — yalnız kullanıcı DEĞİŞTİRDİYSE burada; yoksa
  // `rowLocale` firmanın ülkesinden/adresinden türetir (e-posta düzeltilince
  // varsayılan da güncellensin).
  const [langDrafts, setLangDrafts] = useState<Record<number, Locale>>({});
  const [selectedExt, setSelectedExt] = useState<Set<number>>(new Set());
  // Adres başına GERÇEK gönderim sonucu (SENT/FAILED/SUPPRESSED/…).
  const [sendStatus, setSendStatus] = useState<Record<string, ExternalInviteStatus>>({});

  useEffect(() => {
    if (!isOpen) return;
    setTab("platform");
    setCandidates([]);
    setLoadError(null);
    setTierLocked(false);
    setInvited(new Set());
    setExternalResults([]);
    setSelectedExt(new Set());
    setEmailDrafts({});
    setLangDrafts({});
    setSendStatus({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Platform önerileri: kategori bağlamı hazır olunca (listingId'li açılışta
  // detay sonradan yüklenir) BİR kez çek.
  const catKey = `${effCategoryIds.join(",")}|${effItemNames.join("|")}`;
  useEffect(() => {
    if (!isOpen || (effCategoryIds.length === 0 && effItemNames.length === 0)) return;
    discovery
      .mutateAsync({
        type: "ALIM",
        categoryIds: effCategoryIds,
        // Vitrinde kalemi satan üyeler + talebin ülkeleri (2026-09-27).
        itemNames: effItemNames.slice(0, 15),
        ...(listingId ? { listingId } : { targetCountries: targetCountries ?? [] }),
      })
      .then((rows) => {
        setLoadError(null);
        setTierLocked(false);
        setCandidates(rows);
      })
      // Hata gövdede kalıcı gösterilir (sunucunun nedeni: paket/izin/ağ);
      // 403 için genel istemci zaten toast atar — ikinci toast yok.
      .catch((err) => {
        setTierLocked(
          axios.isAxiosError(err) &&
            err.response?.status === 403 &&
            (err.response.data as { code?: string } | undefined)?.code === "TIER_REQUIRED",
        );
        setLoadError(extractErrorMessage(err, tr("onerilerYuklenemediTekrarDeneyin")));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, catKey]);

  const runExternalSearch = async () => {
    if (external.isPending || (effCategoryIds.length === 0 && effItemNames.length === 0)) return;
    try {
      const res = await external.mutateAsync({
        type: "ALIM",
        categoryIds: effCategoryIds,
        itemNames: effItemNames.slice(0, 15),
        region: region.trim() || undefined,
        // Konum talebin görünürlük ülkesinden: kayıtlı talepte sunucu okur.
        ...(listingId ? { listingId } : { targetCountries: targetCountries ?? [] }),
      });
      // E-POSTASI OLMAYAN FİRMA LİSTELENMEZ (2026-09-17, kullanıcı kararı):
      // davet gönderilemeyecek satır yalnız gürültüdür. Zaten davetli, kayıtlı
      // üye ya da önceden onay isteyen ülkedeki aday da bu listeye girmez
      // (2026-09-27: "davetli olanlara bir daha gitmesin").
      const withEmail = res.filter(
        (c) => !!(c.email ?? "").trim() && (c.status ?? "SUGGESTED") === "SUGGESTED",
      );
      setExternalResults(withEmail);
      setSelectedExt(new Set());
      setEmailDrafts(
        Object.fromEntries(withEmail.map((c, i) => [i, c.email ?? ""])),
      );
      setLangDrafts({});
      if (withEmail.length === 0) {
        toast.info(
          res.length === 0
            ? tr("webAramasindaUygunFirmaBulunamadi")
            : tr("bulunanFirmalarinYayinlanmisEPostasi"),
        );
      }
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("webAramasiBasarisizTekrarDeneyin")));
    }
  };

  /**
   * Davet dili: kullanıcının seçtiği, yoksa kayıtsız alıcı kuralı (ülke →
   * e-posta/site uzantısı → arayüz dili). Rusça arayüzlü alıcının Alman
   * firmaya daveti İngilizce gider — eskiden davet edenin dilindeydi.
   */
  const rowLocale = (i: number): Locale => {
    const c = externalResults[i];
    return (
      langDrafts[i] ??
      recipientLocale({
        country: c?.country ?? null,
        email: emailDrafts[i] ?? c?.email ?? null,
        website: c?.website ?? null,
        fallback: uiLocale,
      })
    );
  };

  const selectedTargets = (): ExternalInviteTarget[] =>
    [...selectedExt]
      .map((i) => ({
        email: (emailDrafts[i] ?? "").trim().toLowerCase(),
        locale: rowLocale(i),
        country: externalResults[i]?.country ?? null,
      }))
      .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.email));

  const sendExternalInvites = async () => {
    if (!listingId || sendExternal.isPending) return;
    const invites = selectedTargets();
    if (invites.length === 0) {
      toast.error(tr("seciliAdaylarinEPostaAdreslerini"));
      return;
    }
    try {
      const results = await sendExternal.mutateAsync({ listingId, invites, source: "AI_FORM" });
      setSendStatus((m) => ({ ...m, ...Object.fromEntries(results.map((r) => [r.email, r.status])) }));
      const sent = results.filter((r) => isInviteAccepted(r.status));
      const notSent = results.filter((r) => !isInviteAccepted(r.status));
      if (sent.length > 0) {
        toast.success(tr("davetlerSirayaAlindi", { n: sent.length }));
      }
      for (const s of notSent.slice(0, 3)) {
        const line = tr("atlandiSatiri", { email: s.email, reason: s.reason ?? tStatus(s.status) });
        if (s.status === "FAILED" || s.status === "SUPPRESSED") toast.warning(line);
        else toast.info(line);
      }
      setSelectedExt(new Set());
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("davetlerGonderilemedi")));
    }
  };

  /** Yayın öncesi (talep yok): adresler forma eklenir, e-posta yayında gider. */
  const collectInvites = () => {
    if (!onCollect) return;
    const invites = selectedTargets().filter((r) => !collectedSet.has(r.email));
    if (invites.length === 0) {
      toast.error(tr("seciliAdaylarinEPostaAdreslerini"));
      return;
    }
    onCollect(invites);
    toast.success(tr("adresTalebeEklendi", { n: invites.length }));
    setSelectedExt(new Set());
  };

  /** Talepten açılış: üyeleri doğrudan talebe davet (tek ya da hepsi). */
  const inviteToListing = async (list: DiscoveryCandidate[]) => {
    if (!listingId || list.length === 0 || inviting) return;
    setInviting(list.length === 1 ? list[0]!.companyId : "*");
    try {
      const results = await inviteMembers.mutateAsync({ listingId, companyIds: list.map((c) => c.companyId) });
      const ok = results.filter((r) => r.status === "INVITED" || r.status === "ALREADY_INVITED").map((r) => r.companyId);
      setInvited((s) => new Set([...s, ...ok]));
      const n = results.filter((r) => r.status === "INVITED").length;
      if (n > 0) toast.success(tAi("memberInvitedToast", { n }));
      const other = results.find((r) => r.status === "DAILY_LIMIT" || r.status === "NOT_ELIGIBLE");
      if (other) toast.warning(tMember(other.status));
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("davetGonderilemedi")));
    } finally {
      setInviting(null);
    }
  };

  const sendInvite = async (c: DiscoveryCandidate) => {
    if (listingId) return inviteToListing([c]);
    if (!c.rothernId || inviting) return;
    setInviting(c.companyId);
    try {
      await invite.mutateAsync(c.rothernId);
      setInvited((s) => new Set(s).add(c.companyId));
      toast.success(tr("firmasinaBaglantiDavetiGonderildi", { name: c.name }));
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("davetGonderilemedi")));
    } finally {
      setInviting(null);
    }
  };


  return (
    <Dialog open={isOpen} onClose={onClose} className="relative z-[60]">
      <DialogBackdrop
        transition
        className="fixed inset-0 bg-zinc-950/40 backdrop-blur-sm transition data-closed:opacity-0"
      />
      <div className="fixed inset-0 flex w-screen items-start justify-center p-2 pt-6 sm:p-4">
        <DialogPanel className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-zinc-950/10">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-zinc-950/5 px-6 py-5">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-zinc-950">
                  {tr("dahaFazlaTedarikciyeEris")}
                </DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {/* Talepten açılışta bağlantı akışı anlatılmaz (D-098):
                      üye doğrudan talebe, web'deki firma talebe özel e-postayla. */}
                  {listingId ? tr("talepIcinAciklama") : tr("satinAlmaTalebiKategorilerinizeGore")}
                </p>
              </div>
            </div>
            <IconButton aria-label={tr("kapat")} onClick={onClose}>
              <X className="h-5 w-5" />
            </IconButton>
          </div>

          {/* Sekmeler */}
          <div role="tablist" aria-label={tr("tedarikciKaynagi")} className="flex gap-1 border-b border-zinc-950/5 px-6 pt-3">
            {(
              [
                { key: "platform", label: tr("platformda"), icon: Building2 },
                { key: "external", label: tr("webDeAraAi"), icon: Globe },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-2 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-b-2 border-blue-600 text-blue-700"
                    : "text-zinc-500 hover:text-zinc-800",
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Body — Dış arama sekmesi */}
          {tab === "external" ? (
            <>
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder={tr("bolgeOpsOrnIstanbulEge")}
                  className="min-w-[180px] flex-1 rounded-lg border border-surface-border bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                />
                <Button
                  onClick={runExternalSearch}
                  disabled={external.isPending || (effCategoryIds.length === 0 && effItemNames.length === 0)}
                >
                  {external.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {tr("webDeAra")}
                </Button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {tr("aiTalebinizinKategorisineUygunFirmalari")} {tr("davetDiliIpucu")}
              </p>

              {external.isPending ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {tr("webDeAraniyor3060")}
                </div>
              ) : externalResults.length > 0 ? (
                <ul className="mt-4 space-y-2">
                  {externalResults.map((c, i) => {
                    const email = (emailDrafts[i] ?? "").trim().toLowerCase();
                    const status = email !== "" ? sendStatus[email] : undefined;
                    const isCollected = collectMode && email !== "" && collectedSet.has(email);
                    // Gönderildi ya da talebe eklendi → satır kilitli; başarısız
                    // gönderim yeniden seçilebilir.
                    const isSent = (status !== undefined && isInviteAccepted(status)) || isCollected;
                    return (
                      <li
                        key={`${c.name}-${i}`}
                        className="rounded-xl border border-zinc-200 bg-white p-3.5"
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-zinc-300"
                            checked={selectedExt.has(i)}
                            disabled={isSent}
                            onChange={(e) =>
                              setSelectedExt((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(i);
                                else n.delete(i);
                                return n;
                              })
                            }
                            aria-label={tr("sec", { name: c.name })}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-zinc-900">
                              {c.name}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
                              {c.city || c.country ? (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {[c.city, c.country ? countryDisplayName(c.country, uiLocale) : null]
                                    .filter(Boolean)
                                    .join(", ")}
                                </span>
                              ) : null}
                              {c.website ? (
                                <a
                                  href={c.website.startsWith("http") ? c.website : `https://${c.website}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 underline hover:text-zinc-800"
                                >
                                  <Globe className="h-3 w-3" />
                                  {c.website.replace(/^https?:\/\//, "").slice(0, 40)}
                                </a>
                              ) : null}
                            </p>
                            <p className="mt-1 text-xs text-zinc-600">{c.reason}</p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Mail className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                              <input
                                value={emailDrafts[i] ?? ""}
                                onChange={(e) =>
                                  setEmailDrafts((d) => ({ ...d, [i]: e.target.value }))
                                }
                                disabled={isSent}
                                placeholder={tr("ePostaAdresiniDogrulayinGirin")}
                                className="w-full max-w-[300px] rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-50"
                              />
                              <InviteLocaleSelect
                                value={rowLocale(i)}
                                onChange={(l) => setLangDrafts((d) => ({ ...d, [i]: l }))}
                                disabled={isSent}
                                label={tr("davetDiliFirma", { name: c.name })}
                              />
                              {isSent ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <Check className="h-3.5 w-3.5" />
                                  {isCollected ? tr("talebeEklendi") : tr("gonderildi")}
                                </span>
                              ) : status ? (
                                <span
                                  className={cn(
                                    "text-xs font-semibold",
                                    status === "FAILED" || status === "SUPPRESSED"
                                      ? "text-red-700"
                                      : "text-zinc-600",
                                  )}
                                >
                                  {tStatus(status)}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : null}

            </div>
            {/* GÖNDER DÜĞMESİ SABİT ALT ŞERİTTE (2026-09-17, kullanıcı: "sırf
                görmek için en aşağı inilmemeli"): liste kaydırılır, düğme
                kutunun altında hep görünür. */}
            {externalResults.length > 0 ? (
              <div className="shrink-0 border-t border-zinc-200 bg-white px-6 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-zinc-500">
                    {listingId
                      ? tr("gunlukDisDavetLimitiFirma", { limit: MAX_PENDING_EXTERNAL_INVITES })
                      : collectMode
                        ? tr("yayindaDavetGonderilir", { limit: MAX_PENDING_EXTERNAL_INVITES })
                        : tr("onceTalebiKaydedin")}
                  </p>
                  {listingId ? (
                    <Button
                      onClick={sendExternalInvites}
                      disabled={selectedExt.size === 0 || sendExternal.isPending}
                    >
                      {sendExternal.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Mail className="h-4 w-4" />
                      )}
                      {tr("davetEPostasiGonderN", { n: selectedExt.size })}
                    </Button>
                  ) : collectMode ? (
                    <Button onClick={collectInvites} disabled={selectedExt.size === 0}>
                      <Mail className="h-4 w-4" />
                      {tr("talebeEkleN", { n: selectedExt.size })}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
            </>
          ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {effCategoryIds.length === 0 && effItemNames.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                {tr("onceSatinAlmaTalebininKategorisini")}
              </p>
            ) : discovery.isPending ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                {tr("eslesenFirmalarAraniyor")}
              </div>
            ) : loadError ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p role="alert" className="text-sm text-red-700">
                  {loadError}
                </p>
                {tierLocked ? (
                  <Link
                    href={GOLD_HREF}
                    onClick={onClose}
                    className="text-sm font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-800"
                  >
                    {tr("goldaGec")}
                  </Link>
                ) : null}
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                {tr("buKategorilerdeOnerilebilecekYeniFirma")}
              </p>
            ) : (
              <>
              {listingId ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-zinc-600">{tAi("groupMembersLead")}</p>
                  {(() => {
                    const rest = candidates.filter((c) => !invited.has(c.companyId) && !c.alreadyInvited);
                    return rest.length > 1 ? (
                      <Button size="sm" disabled={inviting !== null} onClick={() => void inviteToListing(rest)}>
                        {inviting === "*" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {tr("hepsiniTalebeDavetEt", { n: rest.length })}
                      </Button>
                    ) : null;
                  })()}
                </div>
              ) : null}
              <ul className="space-y-2">
                {candidates.map((c) => {
                  const done = listingId
                    ? invited.has(c.companyId) || !!c.alreadyInvited
                    : invited.has(c.companyId) || c.connectionStatus === "PENDING";
                  const items = (c.matchedItems ?? [])
                    .map((n) => effItemNames[n - 1])
                    .filter(Boolean)
                    .join(", ");
                  return (
                    <li
                      key={c.companyId}
                      className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3.5"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
                        <Building2 className="h-4 w-4 text-zinc-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                          <span className="truncate">{c.name}</span>
                          {c.strongMatch ? (
                            <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                              {tr("gucluEslesme")}
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                          {c.city ? (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {c.city}
                            </span>
                          ) : null}
                          {c.matchedCategories.length > 0 ? (
                            <span className="truncate">
                              {c.matchedCategories.join(" · ")}
                            </span>
                          ) : null}
                        </p>
                        {items ? (
                          <p className="mt-1 text-xs font-medium text-blue-800">{tAi("memberItems", { items })}</p>
                        ) : null}
                      </div>
                      {done ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                          <Check className="h-3.5 w-3.5" />
                          {listingId ? tr("talebeDavetli") : tr("davetGonderildi2")}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={inviting !== null}
                          onClick={() => sendInvite(c)}
                        >
                          {inviting === c.companyId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          {listingId ? tr("talebeDavetEt") : tr("baglantiDavetiGonder")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
              </>
            )}
          </div>
          )}

          {/* Altbilgi sekmenin GERÇEK akışını anlatır (D-098): talepte üye
              doğrudan davet / web'deki firmaya talebe özel e-posta; talepsiz
              açılışta platform sekmesi bağlantı daveti gönderir. Öneriler
              yüklenemediyse (paket kilidi dahil) kullanıcının yürütemeyeceği
              bir davet akışı anlatılmaz. */}
          {(listingId || tab === "platform") && !(tab === "platform" && loadError) ? (
            <div className="border-t border-zinc-950/5 bg-zinc-50/60 px-6 py-3 text-xs text-zinc-500">
              {listingId
                ? tab === "platform"
                  ? tr("uyeDogrudanTalebeDavet")
                  : tr("talebeOzelDisDavetNotu")
                : tr("davetKabulEdilinceFirmaBaglantilariniza")}
            </div>
          ) : null}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
