"use client";

import { tierAtLeast } from "@rothern/shared";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Textarea } from "@/components/catalyst/textarea";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import {
  useCancelReferralInvite,
  useConnections,
  useConnectionSelf,
  useDisconnect,
  useDiscover,
  useIncomingInvites,
  useOutgoingInvites,
  useInviteByEmail,
  useInviteByEmailBatch,
  useReferralInvites,
  useBlockCompany,
  useRespondInvite,
  type ConnectionOrigin,
} from "@/hooks/use-company-connections";
import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { useFileComplaint } from "@/hooks/use-company-complaints";
import {
  useCompanySearch,
  type DirectoryConnectionStatus,
} from "@/hooks/use-company-directory";
import { ListSkeleton } from "@/components/list";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { ReasonDialog } from "@/components/tenders/reason-dialog";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import {
  Check,
  ChevronRight,
  Ban,
  Compass,
  Copy,
  Flag,
  Inbox,
  Mail,
  MoreVertical,
  Unlink,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const TAB_KEYS = ["mine", "discover", "incoming"] as const;
import { useMemo, useState } from "react";
import { toast } from "sonner";

const ORIGIN_BADGE: Record<
  ConnectionOrigin,
  { label: string; color: React.ComponentProps<typeof Badge>["color"] }
> = {
  INVITE: { label: "Referans", color: "blue" },
  PREMIUM: { label: "Premium", color: "purple" },
  ADMIN: { label: "Platform", color: "zinc" },
};

const STATUS_BADGE: Partial<
  Record<
    DirectoryConnectionStatus,
    { label: string; color: React.ComponentProps<typeof Badge>["color"] }
  >
> = {
  active: { label: "Bağlısınız", color: "green" },
  pending: { label: "İstek gönderildi", color: "amber" },
  incoming: { label: "İstek geldi", color: "blue" },
};

type TabKey = "discover" | "mine" | "incoming";

/** Tıklanabilir firma kartı → herkese açık profil. */
function CompanyCard({
  rothernId,
  name,
  industry,
  city,
  badge,
}: {
  rothernId: string | null;
  name: string;
  industry: string | null;
  city: string | null;
  badge?: { label: string; color: React.ComponentProps<typeof Badge>["color"] };
}) {
  const meta = [industry, city].filter(Boolean).join(" · ");
  return (
    <Link
      href={rothernId ? `/company/firma/${rothernId}` : "#"}
      aria-disabled={!rothernId}
      onClick={(e) => {
        if (!rothernId) e.preventDefault();
      }}
      className="flex items-center gap-3 rounded-xl border border-zinc-950/10 bg-white p-4 transition hover:bg-zinc-50"
    >
      <AvatarInitials name={name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-zinc-900">
          {name}
        </div>
        <div className="truncate text-xs text-zinc-500">
          {meta || "—"}
          {rothernId ? (
            <span className="ml-2 font-mono text-zinc-400">{rothernId}</span>
          ) : null}
        </div>
      </div>
      {badge ? (
        <Badge color={badge.color}>{badge.label}</Badge>
      ) : (
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
      )}
    </Link>
  );
}

/** Bağlantılarım satırı — kart + bağlantıyı kaldır. */
function ConnectionRow({
  connectionId,
  rothernId,
  name,
  badge,
}: {
  connectionId: string;
  rothernId: string | null;
  name: string;
  badge?: { label: string; color: React.ComponentProps<typeof Badge>["color"] };
}) {
  const disconnect = useDisconnect();
  const block = useBlockCompany();
  // F7: kaldır/engelle/şikayet connections:manage ister.
  const canManageConn = useHasCompanyPermission("connections:manage");
  const complaint = useFileComplaint();
  const confirmDialog = useConfirm();
  const [complaintOpen, setComplaintOpen] = useState(false);

  const handleDisconnect = async () => {
    const ok = await confirmDialog({
      title: "Bağlantı kaldırılsın mı?",
      description: `"${name}" ile bağlantınız kaldırılacak.`,
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

  const handleBlock = async () => {
    if (!rothernId) return;
    const ok = await confirmDialog({
      title: "Firma engellensin mi?",
      description: `"${name}" sizi göremez ve sizinle işlem yapamaz.`,
      confirmLabel: "Engelle",
      destructive: true,
    });
    if (!ok) return;
    try {
      await block.mutateAsync({ rothernId });
      toast.success("Firma engellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Engellenemedi"));
    }
  };

  const submitComplaint = async (reason: string) => {
    if (!rothernId || reason.trim().length < 3) return;
    try {
      await complaint.mutateAsync({ rothernId, reason: reason.trim() });
      toast.success("Şikayet gönderildi");
      setComplaintOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şikayet gönderilemedi"));
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-zinc-950/10 bg-white pr-2 transition hover:bg-zinc-50">
      <Link
        href={rothernId ? `/company/firma/${rothernId}` : "#"}
        aria-disabled={!rothernId}
        onClick={(e) => {
          if (!rothernId) e.preventDefault();
        }}
        className="flex min-w-0 flex-1 items-center gap-3 p-4"
      >
        <AvatarInitials name={name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {name}
          </div>
          {rothernId ? (
            <div className="truncate font-mono text-xs text-zinc-400">
              {rothernId}
            </div>
          ) : null}
        </div>
        {badge ? <Badge color={badge.color}>{badge.label}</Badge> : null}
      </Link>
      {canManageConn ? (
      <Dropdown>
        <DropdownButton plain aria-label="Daha fazla">
          <MoreVertical className="h-5 w-5" />
        </DropdownButton>
        <DropdownMenu anchor="bottom end">
          <DropdownItem
            onClick={handleDisconnect}
            disabled={disconnect.isPending}
          >
            <Unlink data-slot="icon" />
            Bağlantıyı Kaldır
          </DropdownItem>
          <DropdownItem onClick={handleBlock} disabled={block.isPending}>
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
      <ReasonDialog
        open={complaintOpen}
        onClose={() => setComplaintOpen(false)}
        onSubmit={submitComplaint}
        title="Şikayet Et"
        description={`"${name}" hakkındaki şikayetiniz platform yönetimine iletilir.`}
        confirmLabel="Şikayeti Gönder"
        minLength={3}
        destructive
        pending={complaint.isPending}
      />
    </div>
  );
}

export function ConnectionsView() {
  const self = useConnectionSelf();
  const connections = useConnections();
  const incoming = useIncomingInvites();
  const respond = useRespondInvite();
  const inviteByEmail = useInviteByEmail();
  const referralInvites = useReferralInvites();

  const searchParams = useSearchParams();
  const initialTab = (TAB_KEYS as readonly string[]).includes(
    searchParams.get("tab") ?? "",
  )
    ? (searchParams.get("tab") as TabKey)
    : "mine";
  const [tab, setTab] = useState<TabKey>(initialTab);
  // STANDARD: davet gönderemez + firma dizininde arama/keşif yapamaz; yalnızca
  // bağlantılarını görür ve gelen daveti kabul edip tedarikçi olabilir.
  const { company } = useCompanyAuth();
  const isPaid = tierAtLeast(company?.tier ?? "STANDART", "BRONZ");
  // F7: bağlantı mutasyonları connections:manage ister (Kurucu/Yönetici) —
  // izinsiz üye listeleri salt-okunur görür, davet/karar butonları gizli.
  const canManageConn = useHasCompanyPermission("connections:manage");
  // Keşfet premium — STANDARD'da o sekme yok; URL'den gelse de Bağlantılarım'a düş.
  const shownTab: TabKey = !isPaid && tab === "discover" ? "mine" : tab;
  const [q, setQ] = useState("");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const [batchOpen, setBatchOpen] = useState(false);
  const [connQ, setConnQ] = useState("");
  const search = useCompanySearch(q);
  const outgoing = useOutgoingInvites();
  const discover = useDiscover();
  const cancelReferral = useCancelReferralInvite();
  const disconnectOutgoing = useDisconnect();
  const rothernId = self.data?.rothernId ?? "—";
  const incomingCount = incoming.data?.length ?? 0;
  const outgoingCount =
    (outgoing.data?.length ?? 0) + (referralInvites.data?.length ?? 0);
  const connCount = connections.data?.length ?? 0;
  // Bağlantılarım içi arama — ad / Rothern ID / sektör / şehir (istemci tarafı).
  const filteredConnections = useMemo(() => {
    const rows = connections.data ?? [];
    const needle = connQ.trim().toLocaleLowerCase("tr");
    if (!needle) return rows;
    return rows.filter((c) =>
      [
        c.company.name,
        c.company.rothernId ?? "",
        c.company.industry ?? "",
        c.company.city ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("tr")
        .includes(needle),
    );
  }, [connections.data, connQ]);

  const copyId = async () => {
    if (rothernId === "—") return;
    try {
      await navigator.clipboard.writeText(rothernId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* sessiz */
    }
  };

  const handleInviteByEmail = async () => {
    if (!email.includes("@")) {
      toast.error("Geçerli bir e-posta adresi girin");
      return;
    }
    try {
      const res = await inviteByEmail.mutateAsync(email.trim());
      toast.success(
        res.kind === "request"
          ? `"${res.targetName}" zaten kayıtlı — bağlantı isteği gönderildi`
          : `${res.email} adresine davet e-postası gönderildi`,
      );
      setEmail("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
  };

  const handleRespond = async (
    connectionId: string,
    action: "accept" | "reject",
  ) => {
    try {
      await respond.mutateAsync({ connectionId, action });
      toast.success(
        action === "accept" ? "Bağlantı kuruldu" : "İstek reddedildi",
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    }
  };

  const TABS: { key: TabKey; label: string; icon: typeof Users; count?: number }[] =
    [
      { key: "mine", label: "Bağlantılarım", icon: Users, count: connCount },
      // Keşfet (dizin arama + kategori keşfi) premium — STANDARD'da gizli.
      ...(isPaid
        ? [{ key: "discover" as const, label: "Keşfet", icon: Compass }]
        : []),
      {
        key: "incoming",
        label: "İstekler",
        icon: Inbox,
        count: incomingCount + outgoingCount,
      },
    ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <Heading>Bağlantılar</Heading>
        <Text className="mt-1 text-sm text-zinc-500">
          Firmaları keşfet, profillerini incele ve bağlan. E-posta ile davet
          ettiğin bağlantılar kalıcıdır.
        </Text>
      </div>

      {/* Rothern ID (herkes — tedarikçi olarak bulunmak için) + e-posta daveti
          (yalnız premium — STANDARD davet gönderemez) */}
      <section
        className={cn(
          "grid gap-4 rounded-2xl border border-zinc-950/10 bg-white p-5",
          isPaid ? "sm:grid-cols-2" : "sm:grid-cols-1",
        )}
      >
        <div>
          <Subheading>Rothern ID&apos;n</Subheading>
          <Text className="mt-1 text-sm text-zinc-500">
            Genel kimliğin — başka firmalar seni bununla bulur.
          </Text>
          <div className="mt-3 inline-flex items-center gap-2">
            <span className="rounded-lg bg-zinc-100 px-4 py-2 font-mono text-lg font-semibold tracking-wider text-zinc-900">
              {rothernId}
            </span>
            <Button plain onClick={copyId} disabled={rothernId === "—"}>
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
        {isPaid && canManageConn ? (
        <div className="sm:border-l sm:border-zinc-950/10 sm:pl-5">
          <Subheading className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-zinc-400" />
            E-posta ile davet — kalıcı
          </Subheading>
          <Text className="mt-1 text-sm text-zinc-500">
            Tedarikçinin e-postası: kayıtlıysa istek gider, değilse davet
            e-postası; kaydolunca kalıcı bağlanırsınız.
          </Text>
          <div className="mt-3 space-y-2">
            <Input
              type="email"
              aria-label="Davet edilecek e-posta adresi"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@firma.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInviteByEmail();
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              {/* §4.5: geçersiz girişte buton soluk değil — tıklayınca
                  net hata (handleInviteByEmail zaten doğruluyor). */}
              <Button
                onClick={handleInviteByEmail}
                disabled={inviteByEmail.isPending}
              >
                {inviteByEmail.isPending ? "Gönderiliyor…" : "Davet Et"}
              </Button>
              <Button outline onClick={() => setBatchOpen(true)}>
                Toplu Davet
              </Button>
            </div>
          </div>
          {referralInvites.data && referralInvites.data.length > 0 ? (
            <Text className="mt-2 text-xs text-zinc-400">
              {referralInvites.data.length} bekleyen davet
            </Text>
          ) : null}
        </div>
        ) : null}
      </section>

      {/* Sekmeler */}
      <div
        role="tablist"
        aria-label="Bağlantı sekmeleri"
        className="flex gap-1 border-b border-zinc-950/10"
      >
        {TABS.map((t) => {
          const active = shownTab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.key)}
              className={cn(
                "-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "border-zinc-900 text-zinc-950"
                  : "border-transparent text-zinc-500 hover:text-zinc-700",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {typeof t.count === "number" && t.count > 0 ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-xs",
                    active
                      ? "bg-zinc-900 text-white"
                      : "bg-zinc-100 text-zinc-600",
                  )}
                >
                  {t.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Keşfet — arama + dizin (yalnız premium) */}
      {shownTab === "discover" && isPaid ? (
        <section className="space-y-3">
          <Input
            aria-label="Firma ara"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Firma adı, sektör veya Rothern ID ara…"
            className="max-w-md"
          />
          {/* Arama boşken: kategori eşleşmesine göre "Sana Uygun Firmalar" */}
          {!q.trim() &&
          !discover.isLoading &&
          discover.data &&
          !discover.data.locked &&
          discover.data.companies.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Sana uygun firmalar
                <span className="ml-1.5 font-normal normal-case text-zinc-400">
                  — kategori eşleşmesine göre
                </span>
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {discover.data.companies.slice(0, 6).map((c) => (
                  <CompanyCard
                    key={c.id}
                    rothernId={c.rothernId}
                    name={c.name}
                    industry={c.industry}
                    city={null}
                    badge={
                      c.matchScore > 0
                        ? { label: `${c.matchScore} kategori eşleşmesi`, color: "blue" }
                        : undefined
                    }
                  />
                ))}
              </div>
              <div className="h-px bg-zinc-100" aria-hidden />
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Tüm firmalar
              </p>
            </div>
          ) : null}
          {search.isLoading ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-950/5 bg-white"><ListSkeleton rows={4} /></div>
          ) : !search.data || search.data.length === 0 ? (
            <EmptyBox
              title="Firma bulunamadı"
              desc={
                q
                  ? `"${q}" ile eşleşen firma yok.`
                  : "Henüz keşfedilecek herkese açık firma yok."
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {search.data.map((c) => (
                <CompanyCard
                  key={c.rothernId ?? c.name}
                  rothernId={c.rothernId}
                  name={c.name}
                  industry={c.industry}
                  city={c.city}
                  badge={STATUS_BADGE[c.connectionStatus]}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Bağlantılarım */}
      {shownTab === "mine" ? (
        <section className="space-y-3">
          {connCount > 0 ? (
            <Input
              aria-label="Bağlantılarımda ara"
              value={connQ}
              onChange={(e) => setConnQ(e.target.value)}
              placeholder="Bağlantılarında ara — firma adı, Rothern ID, sektör, şehir…"
              className="max-w-md"
            />
          ) : null}
          {connections.isLoading ? (
            <div className="overflow-hidden rounded-2xl border border-zinc-950/5 bg-white"><ListSkeleton rows={4} /></div>
          ) : connCount === 0 ? (
            <EmptyBox
              title="Henüz bağlantın yok"
              desc="Keşfet'ten firma bul ya da e-posta ile tedarikçini davet et."
            />
          ) : filteredConnections.length === 0 ? (
            <EmptyBox
              title="Eşleşen bağlantı yok"
              desc={`"${connQ}" ile eşleşen bağlantın bulunamadı.`}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredConnections.map((c) => (
                <ConnectionRow
                  key={c.connectionId}
                  connectionId={c.connectionId}
                  rothernId={c.company.rothernId}
                  name={c.company.name}
                  badge={ORIGIN_BADGE[c.origin]}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* İstekler — gelen + gönderdiğim + bekleyen e-posta davetleri */}
      {shownTab === "incoming" ? (
        <section className="space-y-5">
          {/* Gelen */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Gelen istekler
            </p>
            {incoming.isLoading ? (
              <div className="overflow-hidden rounded-2xl border border-zinc-950/5 bg-white"><ListSkeleton rows={2} /></div>
            ) : incomingCount === 0 ? (
              <EmptyBox
                title="Bekleyen istek yok"
                desc="Sana gönderilen bağlantı istekleri burada görünür."
              />
            ) : (
              <div className="space-y-2">
                {incoming.data!.map((inv) => {
                  // Yalnızca İŞLENEN satırın butonları kilitlenir.
                  const busy =
                    respond.isPending &&
                    respond.variables?.connectionId === inv.connectionId;
                  return (
                    <div
                      key={inv.connectionId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
                    >
                      <CompanyLinkRow
                        rothernId={inv.company.rothernId}
                        name={inv.company.name}
                      />
                      {canManageConn ? (
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handleRespond(inv.connectionId, "accept")}
                          disabled={busy}
                        >
                          Kabul Et
                        </Button>
                        <Button
                          plain
                          onClick={() => handleRespond(inv.connectionId, "reject")}
                          disabled={busy}
                        >
                          Reddet
                        </Button>
                      </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Gönderdiğim (iptal edilebilir) */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Gönderdiğim istekler
            </p>
            {outgoing.isLoading ? (
              <div className="overflow-hidden rounded-2xl border border-zinc-950/5 bg-white"><ListSkeleton rows={2} /></div>
            ) : (outgoing.data?.length ?? 0) === 0 ? (
              <EmptyBox
                title="Bekleyen isteğin yok"
                desc="Gönderdiğin bağlantı istekleri karşı taraf yanıtlayana dek burada durur."
              />
            ) : (
              <div className="space-y-2">
                {outgoing.data!.map((inv) => {
                  const busy =
                    disconnectOutgoing.isPending &&
                    disconnectOutgoing.variables === inv.connectionId;
                  return (
                    <div
                      key={inv.connectionId}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
                    >
                      <CompanyLinkRow
                        rothernId={inv.company.rothernId}
                        name={inv.company.name}
                      />
                      {canManageConn ? (
                      <Button
                        plain
                        onClick={async () => {
                          try {
                            await disconnectOutgoing.mutateAsync(inv.connectionId);
                            toast.success("İstek geri çekildi");
                          } catch (err) {
                            toast.error(
                              extractErrorMessage(err, "Geri çekilemedi"),
                            );
                          }
                        }}
                        disabled={busy}
                      >
                        Geri Çek
                      </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bekleyen e-posta davetleri (kayıtsız firmalar) */}
          {referralInvites.data && referralInvites.data.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                Bekleyen e-posta davetleri
              </p>
              <div className="space-y-2">
                {referralInvites.data.map((r) => {
                  const busy =
                    cancelReferral.isPending && cancelReferral.variables === r.id;
                  return (
                    <div
                      key={r.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {r.email}
                        </div>
                        <div className="text-xs text-zinc-400">
                          Kayıt olunca otomatik bağlanır
                        </div>
                      </div>
                      {canManageConn ? (
                      <Button
                        plain
                        onClick={async () => {
                          try {
                            await cancelReferral.mutateAsync(r.id);
                            toast.success("Davet iptal edildi");
                          } catch (err) {
                            toast.error(
                              extractErrorMessage(err, "İptal edilemedi"),
                            );
                          }
                        }}
                        disabled={busy}
                      >
                        İptal Et
                      </Button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
      <BatchInviteDialog open={batchOpen} onClose={() => setBatchOpen(false)} />
    </div>
  );
}

/**
 * Toplu e-posta daveti — eski sistem paritesi. Satır/virgül/noktalı virgülle
 * ayrılmış adresler; 50 sınırı; gönderim sonrası adres bazında sonuç raporu.
 */
function BatchInviteDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const batch = useInviteByEmailBatch();
  const [raw, setRaw] = useState("");
  const [result, setResult] = useState<
    import("@/hooks/use-company-connections").BatchInviteResult | null
  >(null);

  const parsed = useMemo(() => {
    const all = raw
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const seen = new Set<string>();
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const e of all) {
      if (seen.has(e)) continue;
      seen.add(e);
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) valid.push(e);
      else invalid.push(e);
    }
    return { valid, invalid };
  }, [raw]);

  const overLimit = parsed.valid.length > 50;

  const submit = async () => {
    if (parsed.valid.length === 0 || overLimit) return;
    try {
      const res = await batch.mutateAsync(parsed.valid);
      setResult(res);
      toast.success(
        `${res.summary.request + res.summary.invited} davet gönderildi${
          res.summary.skipped ? `, ${res.summary.skipped} atlandı` : ""
        }`,
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Toplu davet gönderilemedi"));
    }
  };

  const close = () => {
    setRaw("");
    setResult(null);
    onClose();
  };

  const STATUS_PILL: Record<
    "request" | "invited" | "skipped",
    { label: string; cls: string }
  > = {
    request: {
      label: "İstek gönderildi",
      cls: "bg-blue-50 text-blue-700 ring-blue-200",
    },
    invited: {
      label: "Davet e-postası gitti",
      cls: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    },
    skipped: {
      label: "Atlandı",
      cls: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    },
  };

  return (
    <Dialog open={open} onClose={() => !batch.isPending && close()} size="lg">
      <DialogTitle>Toplu E-posta Daveti</DialogTitle>
      <DialogDescription>
        Her satıra bir adres (virgül da olur), tek seferde en fazla 50.
        Kayıtlı firmalara bağlantı isteği, kayıtsızlara davet e-postası gider.
      </DialogDescription>
      <DialogBody className="space-y-3">
        {!result ? (
          <>
            <Textarea
              rows={6}
              aria-label="Davet edilecek e-posta adresleri"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={"tedarikci1@firma.com\ntedarikci2@firma.com"}
            />
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span
                className={
                  overLimit ? "font-semibold text-red-600" : "text-zinc-500"
                }
              >
                {parsed.valid.length}/50 geçerli adres
              </span>
              {parsed.invalid.length > 0 ? (
                <span className="text-amber-600">
                  {parsed.invalid.length} geçersiz satır yok sayılacak
                </span>
              ) : null}
            </div>
          </>
        ) : (
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {result.results.map((r) => {
              const pill = STATUS_PILL[r.status];
              return (
                <li
                  key={r.email}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-100 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-sm text-zinc-800">
                    {r.email}
                    {r.targetName ? (
                      <span className="ml-1.5 text-xs text-zinc-400">
                        ({r.targetName})
                      </span>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${pill.cls}`}
                    >
                      {pill.label}
                    </span>
                    {r.reason ? (
                      <span className="text-xs text-zinc-400">
                        {r.reason}
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </DialogBody>
      <DialogActions>
        <Button plain onClick={close} disabled={batch.isPending}>
          {result ? "Kapat" : "Vazgeç"}
        </Button>
        {!result ? (
          <Button
            onClick={submit}
            disabled={
              batch.isPending || parsed.valid.length === 0 || overLimit
            }
          >
            {batch.isPending
              ? "Gönderiliyor…"
              : `${parsed.valid.length} Adrese Davet Gönder`}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

function CompanyLinkRow({
  rothernId,
  name,
}: {
  rothernId: string | null;
  name: string;
}) {
  const inner = (
    <>
      <AvatarInitials name={name} size="sm" />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-zinc-900">
          {name}
        </div>
        {rothernId ? (
          <div className="font-mono text-xs text-zinc-500">{rothernId}</div>
        ) : null}
      </div>
    </>
  );
  if (!rothernId) {
    return <div className="flex min-w-0 items-center gap-3">{inner}</div>;
  }
  return (
    <Link
      href={`/company/firma/${rothernId}`}
      className="flex min-w-0 items-center gap-3"
    >
      {inner}
    </Link>
  );
}

function EmptyBox({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center">
      <p className="text-sm font-medium text-zinc-700">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{desc}</p>
    </div>
  );
}
