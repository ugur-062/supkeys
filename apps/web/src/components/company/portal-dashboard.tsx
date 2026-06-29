"use client";

import { Badge } from "@/components/catalyst/badge";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useInbox } from "@/hooks/use-company-inbox";
import { useOrders } from "@/hooks/use-company-orders";
import {
  useBrowseListings,
  useMyListings,
} from "@/hooks/use-company-listings";
import { PORTALS, type PortalKey } from "@/lib/company/portals";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import Link from "next/link";

interface DashCfg {
  myType: "ALIM" | "SATIS";
  browseType: "ALIM" | "SATIS";
  orderRole: "buyer" | "seller";
  greeting: string;
  primary: { label: string; href: string };
  secondary: { label: string; href: string };
  kpi: { open: string; browse: string; orders: string };
  recentTitle: string;
  recentHref: string;
}

const CFG: Record<PortalKey, DashCfg> = {
  satinalma: {
    myType: "ALIM",
    browseType: "SATIS",
    orderRole: "buyer",
    greeting: "Satınalma paneli — alımlarını yönet.",
    primary: { label: "Yeni İhale", href: "/company/satinalma/ihalelerim" },
    secondary: { label: "Satın Al", href: "/company/satinalma/satin-al" },
    kpi: {
      open: "Açık İhalelerim",
      browse: "Satın Alınabilir İlan",
      orders: "Siparişlerim",
    },
    recentTitle: "Son İhalelerim",
    recentHref: "/company/satinalma/ihalelerim",
  },
  satis: {
    myType: "SATIS",
    browseType: "ALIM",
    orderRole: "seller",
    greeting: "Satış paneli — satışlarını yönet.",
    primary: { label: "Yeni Satış İlanı", href: "/company/satis/ilanlarim" },
    secondary: { label: "Açık İhaleler", href: "/company/satis/acik-ihaleler" },
    kpi: {
      open: "Açık Satış İlanlarım",
      browse: "Teklif Verebileceğim İhale",
      orders: "Siparişlerim",
    },
    recentTitle: "Son Satış İlanlarım",
    recentHref: "/company/satis/ilanlarim",
  },
};

export function PortalDashboard({ portal }: { portal: PortalKey }) {
  const cfg = CFG[portal];
  const def = PORTALS[portal];
  const { company } = useCompanyAuth();
  const my = useMyListings();
  const browse = useBrowseListings();
  const orders = useOrders();
  const inbox = useInbox();
  const pending = inbox.data ?? [];

  const mine = (my.data ?? []).filter((l) => l.type === cfg.myType);
  const openCount = mine.filter((l) => l.status === "OPEN").length;
  const browseCount = (browse.data ?? []).filter(
    (l) => l.type === cfg.browseType,
  ).length;
  const orderCount = (orders.data ?? []).filter(
    (o) => o.role === cfg.orderRole,
  ).length;
  const recent = [...mine]
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, 5);

  const accent = def.accent === "blue" ? "blue" : "emerald";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Heading>{company?.name ?? "Panel"}</Heading>
          <Text className="mt-1 text-sm text-zinc-500">{cfg.greeting}</Text>
        </div>
        <Badge color={accent}>{def.label} Portalı</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard
          label={cfg.kpi.open}
          value={openCount}
          loading={my.isLoading}
          href={cfg.recentHref}
        />
        <KpiCard
          label={cfg.kpi.browse}
          value={browseCount}
          loading={browse.isLoading}
          href={cfg.secondary.href}
        />
        <KpiCard
          label={cfg.kpi.orders}
          value={orderCount}
          loading={orders.isLoading}
          href={`${def.basePath}/siparisler`}
        />
      </div>

      {/* Bekleyen İşler */}
      {pending.length > 0 ? (
        <div className="rounded-xl border border-zinc-950/10 bg-white">
          <div className="flex items-center justify-between border-b border-zinc-950/5 px-5 py-3">
            <Subheading>Bekleyen İşler</Subheading>
            <Badge color="amber">{pending.length}</Badge>
          </div>
          <div className="divide-y divide-zinc-950/5">
            {pending.slice(0, 6).map((item, i) => (
              <Link
                key={`${item.href}-${i}`}
                href={item.href}
                className="flex items-center gap-3 px-5 py-3 transition hover:bg-zinc-50"
              >
                <span className="text-lg">{item.emoji}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
                  {item.title}
                </span>
                <span className="shrink-0 text-xs font-semibold text-zinc-500">
                  {item.actionLabel} →
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Link
          href={cfg.primary.href}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white ${
            accent === "blue" ? "bg-blue-600" : "bg-emerald-600"
          }`}
        >
          {cfg.primary.label}
        </Link>
        <Link
          href={cfg.secondary.href}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
        >
          {cfg.secondary.label}
        </Link>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Subheading>{cfg.recentTitle}</Subheading>
          <Link
            href={cfg.recentHref}
            className="text-xs font-medium text-zinc-500 hover:text-zinc-800"
          >
            Tümü →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-8 text-center">
            <Text className="text-sm text-zinc-500">
              Henüz {cfg.myType === "ALIM" ? "ihalen" : "satış ilanın"} yok.
            </Text>
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((l) => (
              <Link
                key={l.id}
                href={`/company/ilan/${l.id}`}
                className="flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white px-4 py-3 transition hover:bg-zinc-50"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-zinc-900">
                    {l.title}
                  </div>
                  <div className="text-xs text-zinc-500">
                    <span className="font-mono">{l.number ?? "—"}</span>
                    {" · "}
                    {format(new Date(l.createdAt), "dd MMM yyyy", {
                      locale: tr,
                    })}
                  </div>
                </div>
                <Badge color="zinc">{l.status}</Badge>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  loading,
  href,
}: {
  label: string;
  value: number;
  loading?: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-950/10 bg-white p-5 transition hover:border-zinc-300"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-zinc-900">
        {loading ? "…" : value.toLocaleString("tr-TR")}
      </div>
    </Link>
  );
}
