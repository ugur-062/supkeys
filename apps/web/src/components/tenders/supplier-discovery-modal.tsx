"use client";

import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogBackdrop,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  useInviteByEmailBatch,
  useInviteConnection,
} from "@/hooks/use-company-connections";
import {
  useExternalSupplierDiscovery,
  useExternalTenderInvite,
  useSupplierDiscovery,
  type DiscoveryCandidate,
  type ExternalCandidate,
} from "@/hooks/use-supplier-discovery";
import { useListingDetail } from "@/hooks/use-company-listings";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
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
 * kategorileriyle eşleşen, bağlantısız firmalar. Seçilenlere BAĞLANTI daveti
 * gider (kabul eden ihaleye davet edilebilir hâle gelir / PUBLIC ihaleyi görür).
 */
export function SupplierDiscoveryModal({
  isOpen,
  onClose,
  categoryIds,
  itemNames = [],
  listingId,
}: {
  isOpen: boolean;
  onClose: () => void;
  categoryIds: string[];
  /** Faz B — web aramasına bağlam (kalem adları). */
  itemNames?: string[];
  /** Faz C — dış davet gönderimi bu ihale bağlamıyla yapılır (yoksa pasif). */
  listingId?: string;
}) {
  const tr = useTranslations("web.panel.requests.supplierDiscoveryModal");
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
  const [candidates, setCandidates] = useState<DiscoveryCandidate[]>([]);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [inviting, setInviting] = useState<string | null>(null);

  // Faz B/C durumları
  const external = useExternalSupplierDiscovery();
  const sendExternal = useExternalTenderInvite();
  // İhale bağlamı yokken (wizard'dan açılış) genel bağlantı daveti gönderilir
  // — kullanıcı firmaları seçip butonsuz kalmasın (madde 4 düzeltmesi).
  const sendGeneric = useInviteByEmailBatch();
  const [externalResults, setExternalResults] = useState<ExternalCandidate[]>([]);
  const [region, setRegion] = useState("");
  const [emailDrafts, setEmailDrafts] = useState<Record<number, string>>({});
  const [selectedExt, setSelectedExt] = useState<Set<number>>(new Set());
  const [sentEmails, setSentEmails] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setTab("platform");
    setCandidates([]);
    setInvited(new Set());
    setExternalResults([]);
    setSelectedExt(new Set());
    setEmailDrafts({});
    setSentEmails(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Platform önerileri: kategori bağlamı hazır olunca (listingId'li açılışta
  // detay sonradan yüklenir) BİR kez çek.
  const catKey = effCategoryIds.join(",");
  useEffect(() => {
    if (!isOpen || effCategoryIds.length === 0) return;
    discovery
      .mutateAsync({ type: "ALIM", categoryIds: effCategoryIds })
      .then(setCandidates)
      .catch(() => toast.error(tr("onerilerYuklenemediTekrarDeneyin")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, catKey]);

  const runExternalSearch = async () => {
    if (external.isPending || effCategoryIds.length === 0) return;
    try {
      const res = await external.mutateAsync({
        type: "ALIM",
        categoryIds: effCategoryIds,
        itemNames: effItemNames.slice(0, 15),
        region: region.trim() || undefined,
      });
      // E-POSTASI OLMAYAN FİRMA LİSTELENMEZ (2026-09-17, kullanıcı kararı):
      // davet gönderilemeyecek satır yalnız gürültüdür.
      const withEmail = res.filter((c) => !!(c.email ?? "").trim());
      setExternalResults(withEmail);
      setSelectedExt(new Set());
      setEmailDrafts(
        Object.fromEntries(withEmail.map((c, i) => [i, c.email ?? ""])),
      );
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

  const sendExternalInvites = async () => {
    if (!listingId || sendExternal.isPending) return;
    const emails = [...selectedExt]
      .map((i) => (emailDrafts[i] ?? "").trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
    if (emails.length === 0) {
      toast.error(tr("seciliAdaylarinEPostaAdreslerini"));
      return;
    }
    try {
      const results = await sendExternal.mutateAsync({ listingId, emails });
      const sent = results.filter((r) => r.status === "SENT");
      const skipped = results.filter((r) => r.status === "SKIPPED");
      if (sent.length > 0) {
        setSentEmails((s) => new Set([...s, ...sent.map((r) => r.email)]));
        toast.success(tr("davetEPostasiGonderildi", { length: sent.length }));
      }
      for (const s of skipped.slice(0, 3)) {
        toast.info(tr("atlandiSatiri", { email: s.email, reason: s.reason ?? tr("atlandi") }));
      }
      setSelectedExt(new Set());
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("davetlerGonderilemedi")));
    }
  };

  /** listingId'siz (wizard) gönderim: genel bağlantı/kayıt daveti. */
  const sendGenericInvites = async () => {
    if (sendGeneric.isPending) return;
    const emails = [...selectedExt]
      .map((i) => (emailDrafts[i] ?? "").trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
    if (emails.length === 0) {
      toast.error(tr("seciliAdaylarinEPostaAdreslerini"));
      return;
    }
    try {
      const { results } = await sendGeneric.mutateAsync(emails);
      const sent = results.filter((r) => r.status !== "skipped");
      if (sent.length > 0) {
        setSentEmails((s) => new Set([...s, ...sent.map((r) => r.email)]));
        toast.success(tr("davetGonderildi", { length: sent.length }));
      }
      for (const s of results.filter((r) => r.status === "skipped").slice(0, 3)) {
        toast.info(tr("atlandiSatiri", { email: s.email, reason: s.reason ?? tr("atlandi") }));
      }
      setSelectedExt(new Set());
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("davetlerGonderilemedi")));
    }
  };

  const sendInvite = async (c: DiscoveryCandidate) => {
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
                  {tr("satinAlmaTalebiKategorilerinizeGore")}
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
                  disabled={external.isPending || effCategoryIds.length === 0}
                >
                  {external.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  {tr("webDeAra")}
                </Button>
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                {tr("aiTalebinizinKategorisineUygunFirmalari")}
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
                    const isSent = email !== "" && sentEmails.has(email);
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
                              {c.city ? (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3" />
                                  {c.city}
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
                            <div className="mt-2 flex items-center gap-2">
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
                              {isSent ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <Check className="h-3.5 w-3.5" />
                                  {tr("gonderildi")}
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
                      ? tr("gunlukDisDavetLimitiFirma")
                      : tr("talepHenuzYayinlanmadigiIcinBaglanti")}
                  </p>
                  <Button
                    onClick={listingId ? sendExternalInvites : sendGenericInvites}
                    disabled={
                      selectedExt.size === 0 ||
                      sendExternal.isPending ||
                      sendGeneric.isPending
                    }
                  >
                    {sendExternal.isPending || sendGeneric.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Mail className="h-4 w-4" />
                    )}
                    {tr("davetEPostasiGonderN", { n: selectedExt.size })}
                  </Button>
                </div>
              </div>
            ) : null}
            </>
          ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {effCategoryIds.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                {tr("onceSatinAlmaTalebininKategorisini")}
              </p>
            ) : discovery.isPending ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                {tr("eslesenFirmalarAraniyor")}
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                {tr("buKategorilerdeOnerilebilecekYeniFirma")}
              </p>
            ) : (
              <ul className="space-y-2">
                {candidates.map((c) => {
                  const done =
                    invited.has(c.companyId) || c.connectionStatus === "PENDING";
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
                      </div>
                      {done ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700">
                          <Check className="h-3.5 w-3.5" />
                          {tr("davetGonderildi2")}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={inviting === c.companyId}
                          onClick={() => sendInvite(c)}
                        >
                          {inviting === c.companyId ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : null}
                          {tr("baglantiDavetiGonder")}
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          )}

          <div className="border-t border-zinc-950/5 bg-zinc-50/60 px-6 py-3 text-xs text-zinc-500">
            {tr("davetKabulEdilinceFirmaBaglantilariniza")}
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
