"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
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
  useConnections,
  useConnectionSelf,
  useDisconnect,
  useIncomingInvites,
  useInviteByEmail,
  useReferralInvites,
  useBlockCompany,
  useRespondInvite,
  type ConnectionOrigin,
} from "@/hooks/use-company-connections";
import { useFileComplaint } from "@/hooks/use-company-complaints";
import {
  useCompanySearch,
  type DirectoryConnectionStatus,
} from "@/hooks/use-company-directory";
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
import { useState } from "react";
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
  supkeysId,
  name,
  industry,
  city,
  badge,
}: {
  supkeysId: string | null;
  name: string;
  industry: string | null;
  city: string | null;
  badge?: { label: string; color: React.ComponentProps<typeof Badge>["color"] };
}) {
  const meta = [industry, city].filter(Boolean).join(" · ");
  return (
    <Link
      href={supkeysId ? `/company/firma/${supkeysId}` : "#"}
      className="flex items-center gap-3 rounded-xl border border-zinc-950/10 bg-white p-4 transition hover:bg-zinc-50"
    >
      <AvatarInitials name={name} size="md" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-zinc-900">
          {name}
        </div>
        <div className="truncate text-xs text-zinc-500">
          {meta || "—"}
          {supkeysId ? (
            <span className="ml-2 font-mono text-zinc-400">{supkeysId}</span>
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
  supkeysId,
  name,
  badge,
}: {
  connectionId: string;
  supkeysId: string | null;
  name: string;
  badge?: { label: string; color: React.ComponentProps<typeof Badge>["color"] };
}) {
  const disconnect = useDisconnect();
  const block = useBlockCompany();
  const complaint = useFileComplaint();

  const handleDisconnect = async () => {
    if (!confirm(`"${name}" ile bağlantınızı kaldırmak istiyor musunuz?`))
      return;
    try {
      await disconnect.mutateAsync(connectionId);
      toast.success("Bağlantı kaldırıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Bağlantı kaldırılamadı"));
    }
  };

  const handleBlock = async () => {
    if (!supkeysId) return;
    if (!confirm(`"${name}" engellensin mi?`)) return;
    try {
      await block.mutateAsync(supkeysId);
      toast.success("Firma engellendi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Engellenemedi"));
    }
  };

  const handleComplaint = async () => {
    if (!supkeysId) return;
    const reason = window.prompt("Şikayet konusu:");
    if (!reason || reason.trim().length < 3) return;
    try {
      await complaint.mutateAsync({ supkeysId, reason: reason.trim() });
      toast.success("Şikayet gönderildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Şikayet gönderilemedi"));
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-xl border border-zinc-950/10 bg-white pr-2 transition hover:bg-zinc-50">
      <Link
        href={supkeysId ? `/company/firma/${supkeysId}` : "#"}
        className="flex min-w-0 flex-1 items-center gap-3 p-4"
      >
        <AvatarInitials name={name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {name}
          </div>
          {supkeysId ? (
            <div className="truncate font-mono text-xs text-zinc-400">
              {supkeysId}
            </div>
          ) : null}
        </div>
        {badge ? <Badge color={badge.color}>{badge.label}</Badge> : null}
      </Link>
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
          <DropdownItem onClick={handleBlock}>
            <Ban data-slot="icon" />
            Engelle
          </DropdownItem>
          <DropdownItem onClick={handleComplaint}>
            <Flag data-slot="icon" />
            Şikayet Et
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>
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
  const [q, setQ] = useState("");
  const [email, setEmail] = useState("");
  const [copied, setCopied] = useState(false);

  const search = useCompanySearch(q);
  const rothernId = self.data?.rothernId ?? "—";
  const incomingCount = incoming.data?.length ?? 0;
  const connCount = connections.data?.length ?? 0;

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
    if (!email.includes("@")) return;
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
      { key: "discover", label: "Keşfet", icon: Compass },
      {
        key: "incoming",
        label: "Gelen İstekler",
        icon: Inbox,
        count: incomingCount,
      },
    ];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <Heading>Bağlantılar</Heading>
        <Text className="mt-1 text-sm text-zinc-500">
          Firmaları keşfet, profillerini incele ve bağlan. E-posta ile davet
          ettiğin bağlantılar kalıcıdır.
        </Text>
      </div>

      {/* Rothern ID + e-posta daveti */}
      <section className="grid gap-4 rounded-2xl border border-zinc-950/10 bg-white p-5 sm:grid-cols-2">
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
        <div className="sm:border-l sm:border-zinc-950/10 sm:pl-5">
          <Subheading className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-zinc-400" />
            E-posta ile davet — kalıcı
          </Subheading>
          <Text className="mt-1 text-sm text-zinc-500">
            Tedarikçinin e-postası: kayıtlıysa istek gider, değilse davet
            e-postası; kaydolunca kalıcı bağlanırsınız.
          </Text>
          <div className="mt-3 flex gap-2">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@firma.com"
              className="max-w-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleInviteByEmail();
              }}
            />
            <Button
              onClick={handleInviteByEmail}
              disabled={inviteByEmail.isPending}
            >
              Davet Et
            </Button>
          </div>
          {referralInvites.data && referralInvites.data.length > 0 ? (
            <Text className="mt-2 text-xs text-zinc-400">
              {referralInvites.data.length} bekleyen davet
            </Text>
          ) : null}
        </div>
      </section>

      {/* Sekmeler */}
      <div className="flex gap-1 border-b border-zinc-950/10">
        {TABS.map((t) => {
          const active = tab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
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
                    "rounded-full px-1.5 py-0.5 text-[11px]",
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

      {/* Keşfet — arama + dizin */}
      {tab === "discover" ? (
        <section className="space-y-3">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Firma adı, sektör veya Rothern ID ara…"
            className="max-w-md"
          />
          {search.isLoading ? (
            <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
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
                  key={c.supkeysId ?? c.name}
                  supkeysId={c.supkeysId}
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
      {tab === "mine" ? (
        <section className="space-y-3">
          {connections.isLoading ? (
            <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
          ) : connCount === 0 ? (
            <EmptyBox
              title="Henüz bağlantın yok"
              desc="Keşfet'ten firma bul ya da e-posta ile tedarikçini davet et."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {connections.data!.map((c) => (
                <ConnectionRow
                  key={c.connectionId}
                  connectionId={c.connectionId}
                  supkeysId={c.company.supkeysId}
                  name={c.company.name}
                  badge={ORIGIN_BADGE[c.origin]}
                />
              ))}
            </div>
          )}
        </section>
      ) : null}

      {/* Gelen İstekler */}
      {tab === "incoming" ? (
        <section className="space-y-3">
          {incomingCount === 0 ? (
            <EmptyBox
              title="Bekleyen istek yok"
              desc="Sana gönderilen bağlantı istekleri burada görünür."
            />
          ) : (
            <div className="space-y-2">
              {incoming.data!.map((inv) => (
                <div
                  key={inv.connectionId}
                  className="flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
                >
                  <Link
                    href={
                      inv.company.supkeysId
                        ? `/company/firma/${inv.company.supkeysId}`
                        : "#"
                    }
                    className="flex min-w-0 items-center gap-3"
                  >
                    <AvatarInitials name={inv.company.name} size="sm" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-zinc-900">
                        {inv.company.name}
                      </div>
                      <div className="font-mono text-xs text-zinc-500">
                        {inv.company.supkeysId}
                      </div>
                    </div>
                  </Link>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleRespond(inv.connectionId, "accept")}
                      disabled={respond.isPending}
                    >
                      Kabul Et
                    </Button>
                    <Button
                      plain
                      onClick={() => handleRespond(inv.connectionId, "reject")}
                      disabled={respond.isPending}
                    >
                      Reddet
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}
    </div>
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
