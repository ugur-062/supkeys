"use client";

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
  type,
  categoryIds,
  itemNames = [],
  listingId,
}: {
  isOpen: boolean;
  onClose: () => void;
  type: "ALIM" | "SATIS";
  categoryIds: string[];
  /** Faz B — web aramasına bağlam (kalem adları). */
  itemNames?: string[];
  /** Faz C — dış davet gönderimi bu ihale bağlamıyla yapılır (yoksa pasif). */
  listingId?: string;
}) {
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
      .mutateAsync({ type, categoryIds: effCategoryIds })
      .then(setCandidates)
      .catch(() => toast.error("Öneriler yüklenemedi — tekrar deneyin"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, catKey]);

  const runExternalSearch = async () => {
    if (external.isPending || effCategoryIds.length === 0) return;
    try {
      const res = await external.mutateAsync({
        type,
        categoryIds: effCategoryIds,
        itemNames: effItemNames.slice(0, 15),
        region: region.trim() || undefined,
      });
      setExternalResults(res);
      setSelectedExt(new Set());
      setEmailDrafts(
        Object.fromEntries(res.map((c, i) => [i, c.email ?? ""])),
      );
      if (res.length === 0) toast.info("Web aramasında uygun firma bulunamadı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Web araması başarısız — tekrar deneyin"));
    }
  };

  const sendExternalInvites = async () => {
    if (!listingId || sendExternal.isPending) return;
    const emails = [...selectedExt]
      .map((i) => (emailDrafts[i] ?? "").trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
    if (emails.length === 0) {
      toast.error("Seçili adayların e-posta adreslerini doldurun");
      return;
    }
    try {
      const results = await sendExternal.mutateAsync({ listingId, emails });
      const sent = results.filter((r) => r.status === "SENT");
      const skipped = results.filter((r) => r.status === "SKIPPED");
      if (sent.length > 0) {
        setSentEmails((s) => new Set([...s, ...sent.map((r) => r.email)]));
        toast.success(`${sent.length} davet e-postası gönderildi`);
      }
      for (const s of skipped.slice(0, 3)) {
        toast.info(`${s.email}: ${s.reason ?? "atlandı"}`);
      }
      setSelectedExt(new Set());
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davetler gönderilemedi"));
    }
  };

  /** listingId'siz (wizard) gönderim: genel bağlantı/kayıt daveti. */
  const sendGenericInvites = async () => {
    if (sendGeneric.isPending) return;
    const emails = [...selectedExt]
      .map((i) => (emailDrafts[i] ?? "").trim().toLowerCase())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e));
    if (emails.length === 0) {
      toast.error("Seçili adayların e-posta adreslerini doldurun");
      return;
    }
    try {
      const { results } = await sendGeneric.mutateAsync(emails);
      const sent = results.filter((r) => r.status !== "skipped");
      if (sent.length > 0) {
        setSentEmails((s) => new Set([...s, ...sent.map((r) => r.email)]));
        toast.success(`${sent.length} davet gönderildi`);
      }
      for (const s of results.filter((r) => r.status === "skipped").slice(0, 3)) {
        toast.info(`${s.email}: ${s.reason ?? "atlandı"}`);
      }
      setSelectedExt(new Set());
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davetler gönderilemedi"));
    }
  };

  const sendInvite = async (c: DiscoveryCandidate) => {
    if (!c.rothernId || inviting) return;
    setInviting(c.companyId);
    try {
      await invite.mutateAsync(c.rothernId);
      setInvited((s) => new Set(s).add(c.companyId));
      toast.success(`${c.name} firmasına bağlantı daveti gönderildi`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    } finally {
      setInviting(null);
    }
  };

  const counterpart = type === "ALIM" ? "tedarikçi" : "alıcı";

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
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-semibold text-zinc-950">
                  Daha fazla {counterpart}ye eriş
                </DialogTitle>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Satın Alma Talebi kategorilerinize göre platformda eşleşen, henüz bağlantınız
                  olmayan firmalar. Davet gönderin — kabul edince satın alma talebinize davet
                  edebilirsiniz.
                </p>
              </div>
            </div>
            <IconButton aria-label="Kapat" onClick={onClose}>
              <X className="h-5 w-5" />
            </IconButton>
          </div>

          {/* Sekmeler */}
          <div className="flex gap-1 border-b border-zinc-950/5 px-6 pt-3">
            {(
              [
                { key: "platform", label: "Platformda", icon: Building2 },
                { key: "external", label: "Web'de Ara (AI)", icon: Globe },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex items-center gap-2 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors",
                  tab === t.key
                    ? "border-b-2 border-zinc-900 text-zinc-900"
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
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  placeholder="Bölge (ops. — örn. İstanbul, Ege)"
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
                  Web&apos;de Ara
                </Button>
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                AI, ihale kategorinize uygun firmaları web&apos;de arar. E-posta
                yalnız açıkça yayınlanmışsa gelir — göndermeden önce siz
                doğrularsınız.
              </p>

              {external.isPending ? (
                <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Web&apos;de aranıyor (30-60 sn sürebilir)…
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
                            aria-label={`${c.name} seç`}
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
                                placeholder="E-posta adresini doğrulayın / girin"
                                className="w-full max-w-[300px] rounded-lg border border-surface-border bg-white px-2.5 py-1.5 text-xs shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-50"
                              />
                              {isSent ? (
                                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                                  <Check className="h-3.5 w-3.5" />
                                  Gönderildi
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

              {externalResults.length > 0 ? (
                <div className="mt-4">
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
                    Davet E-postası Gönder ({selectedExt.size})
                  </Button>
                  {!listingId ? (
                    <p className="mt-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
                      Satın Alma Talebi henüz yayınlanmadığı için <strong>bağlantı/kayıt
                      daveti</strong> gönderilir — firma kabul edince Davetliler
                      adımında listenize düşer. Satın Alma Talebine özel davet, yayın
                      sonrası satın alma talebi sayfasındaki bu ekrandan gönderilir.
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-zinc-400">
                    Günlük dış davet limiti firma başına 20&apos;dir; aynı adrese
                    yalnız bir kez gönderilir ve her e-postada tek tık
                    vazgeçme bağlantısı bulunur.
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4">
            {effCategoryIds.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                Önce Genel Bilgi adımında satın alma talebi kategorisini seçin — öneriler
                kategoriye göre bulunur.
              </p>
            ) : discovery.isPending ? (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Eşleşen firmalar aranıyor…
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-10 text-center text-sm text-zinc-500">
                Bu kategorilerde önerilebilecek yeni firma bulunamadı.
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
                              Güçlü eşleşme
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
                          Davet gönderildi
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
                          Bağlantı daveti gönder
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
            Davet kabul edilince firma bağlantılarınıza eklenir; davetli
            ihalenize buradan davet edebilir, herkese açık ihalenizi zaten
            görebilir hâle gelir.
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
