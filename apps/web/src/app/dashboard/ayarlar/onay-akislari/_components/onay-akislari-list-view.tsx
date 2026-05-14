"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/hooks/use-permissions";
import {
  useApprovalFlows,
  useChangeApprovalFlowStatus,
  useDeleteApprovalFlow,
  useDuplicateApprovalFlow,
} from "@/hooks/use-approval-flows";
import {
  APPROVAL_FLOW_STATUS_META,
  APPROVAL_FLOW_TYPE_META,
} from "@/lib/approval-flows/labels";
import type { ApprovalFlow } from "@/lib/approval-flows/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Copy,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Search,
  Shield,
  Trash2,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { BackToSettings } from "../../_components/back-to-settings";

export function OnayAkislariListView() {
  // V2-6.5 RBAC — settings:approval permission'a göre erişim
  const { has } = usePermissions();
  const isAdmin = has("settings:approval");

  const [search, setSearch] = useState("");
  const flowsQuery = useApprovalFlows();

  if (!isAdmin) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        <BackToSettings />
        <div className="mt-4 rounded-2xl border border-warning-200 bg-warning-50 p-6 flex gap-3 items-start">
          <Shield className="h-5 w-5 text-warning-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-warning-900">
              Sadece Firma Yöneticileri için
            </p>
            <p className="text-sm text-warning-800 mt-1">
              Onay akışı yönetimi yalnızca <strong>Firma Yöneticisi</strong>{" "}
              rolündeki kullanıcılar tarafından yapılabilir.
            </p>
            <Link
              href="/dashboard/ayarlar"
              className="inline-block text-sm text-brand-600 hover:underline mt-3"
            >
              Ayarlara dön
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const flows = flowsQuery.data ?? [];
  const filtered = flows.filter((f) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      f.name.toLowerCase().includes(term) ||
      f.flowNumber.toString().includes(term)
    );
  });

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <BackToSettings />

      <div className="mt-4 mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Workflow className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-brand-900">
              Onay Akışları
            </h1>
            <p className="text-slate-500 text-sm mt-1 max-w-2xl">
              Onay akışları ile süreçlerinizin tamamlanması için belirleyeceğiniz
              onay adımlarının gerçekleşmesini zorunlu kılabilirsiniz.
            </p>
          </div>
        </div>
        <Link href="/dashboard/ayarlar/onay-akislari/yeni">
          <Button variant="primary">
            <Plus className="h-4 w-4" />
            Yeni Onay Akışı
          </Button>
        </Link>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Akış no veya adı ile ara…"
              className="pl-9"
            />
          </div>
        </div>

        {flowsQuery.isLoading ? (
          <div className="p-12 flex items-center justify-center text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Akışlar yükleniyor…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState hasSearch={!!search} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs uppercase text-slate-500 tracking-wide">
                  <th className="text-left px-5 py-3 w-20">No</th>
                  <th className="text-left px-5 py-3">Akış Adı</th>
                  <th className="text-left px-5 py-3">Tür</th>
                  <th className="text-left px-5 py-3">Durum</th>
                  <th className="text-left px-5 py-3">Adım</th>
                  <th className="text-left px-5 py-3">Oluşturan</th>
                  <th className="text-left px-5 py-3">Son Güncelleme</th>
                  <th className="px-5 py-3 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((flow) => (
                  <FlowRow key={flow.id} flow={flow} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="p-16 text-center">
      <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center">
        <Workflow className="h-6 w-6 text-slate-400" />
      </div>
      <p className="font-display font-bold text-brand-900 mt-3">
        {hasSearch ? "Eşleşen akış yok" : "Henüz onay akışı yok"}
      </p>
      <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
        {hasSearch
          ? "Aramanızı değiştirin ya da yeni bir akış oluşturun."
          : "İlk onay akışınızı oluşturarak süreçlerinizi otomatikleştirin."}
      </p>
      {!hasSearch ? (
        <div className="mt-4">
          <Link href="/dashboard/ayarlar/onay-akislari/yeni">
            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4" />
              İlk Akışı Oluştur
            </Button>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function FlowRow({ flow }: { flow: ApprovalFlow }) {
  const router = useRouter();
  const changeStatus = useChangeApprovalFlowStatus();
  const duplicate = useDuplicateApprovalFlow();
  const remove = useDeleteApprovalFlow();

  const typeMeta = APPROVAL_FLOW_TYPE_META[flow.type];
  const statusMeta = APPROVAL_FLOW_STATUS_META[flow.status];

  const onToggleStatus = () => {
    const next = flow.status === "ACTIVE" ? "PASSIVE" : "ACTIVE";
    changeStatus.mutate(
      { id: flow.id, status: next },
      {
        onSuccess: () =>
          toast.success(
            next === "ACTIVE" ? "Akış aktifleştirildi" : "Akış pasif yapıldı",
          ),
        onError: (err) =>
          toast.error(extractErrorMessage(err, "Durum değiştirilemedi")),
      },
    );
  };

  const onDuplicate = () => {
    duplicate.mutate(flow.id, {
      onSuccess: () => toast.success("Akış kopyalandı (Taslak)"),
      onError: (err) =>
        toast.error(extractErrorMessage(err, "Kopyalama başarısız")),
    });
  };

  const onDelete = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `"${flow.name}" akışını silmek istediğinize emin misiniz?`,
      )
    ) {
      return;
    }
    remove.mutate(flow.id, {
      onSuccess: () => toast.success("Akış silindi"),
      onError: (err) =>
        toast.error(extractErrorMessage(err, "Silme başarısız")),
    });
  };

  return (
    <tr className="hover:bg-slate-50/40 transition-colors">
      <td className="px-5 py-3 align-middle font-mono text-sm text-slate-600">
        #{flow.flowNumber}
      </td>
      <td className="px-5 py-3 align-middle">
        <Link
          href={`/dashboard/ayarlar/onay-akislari/${flow.id}`}
          className="font-semibold text-brand-700 hover:text-brand-800 hover:underline"
        >
          {flow.name}
        </Link>
        {flow.description ? (
          <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
            {flow.description}
          </p>
        ) : null}
      </td>
      <td className="px-5 py-3 align-middle">
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
            typeMeta.pillClass,
          )}
        >
          {typeMeta.label}
        </span>
      </td>
      <td className="px-5 py-3 align-middle">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold",
            flow.status === "ACTIVE"
              ? "text-success-700"
              : flow.status === "DRAFT"
                ? "text-warning-700"
                : "text-slate-600",
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              statusMeta.dotClass,
            )}
          />
          {statusMeta.label}
        </span>
      </td>
      <td className="px-5 py-3 align-middle text-sm text-slate-600">
        {flow.steps.length}
      </td>
      <td className="px-5 py-3 align-middle text-sm text-slate-600">
        {flow.createdBy.firstName} {flow.createdBy.lastName}
      </td>
      <td className="px-5 py-3 align-middle text-xs text-slate-500">
        {format(new Date(flow.updatedAt), "d MMM yyyy HH:mm", {
          locale: tr,
        })}
      </td>
      <td className="px-5 py-3 align-middle text-right">
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <button
              className="p-1.5 rounded-md hover:bg-slate-200 text-slate-500"
              aria-label="Aksiyonlar"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-[200px] rounded-xl bg-white p-1.5 shadow-xl border border-slate-200"
            >
              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  router.push(`/dashboard/ayarlar/onay-akislari/${flow.id}`);
                }}
                className="px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2 text-brand-900 hover:bg-brand-50 focus:bg-brand-50"
              >
                <Pencil className="h-4 w-4" />
                Görüntüle / Düzenle
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  onToggleStatus();
                }}
                className={cn(
                  "px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2",
                  flow.status === "ACTIVE"
                    ? "text-warning-700 hover:bg-warning-50 focus:bg-warning-50"
                    : "text-success-700 hover:bg-success-50 focus:bg-success-50",
                )}
              >
                <Power className="h-4 w-4" />
                {flow.status === "ACTIVE" ? "Pasif Yap" : "Aktif Et"}
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  onDuplicate();
                }}
                className="px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2 text-brand-900 hover:bg-brand-50 focus:bg-brand-50"
              >
                <Copy className="h-4 w-4" />
                Kopyala
              </DropdownMenu.Item>

              <DropdownMenu.Item
                onSelect={(e) => {
                  e.preventDefault();
                  onDelete();
                }}
                className="px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2 text-danger-700 hover:bg-danger-50 focus:bg-danger-50"
              >
                <Trash2 className="h-4 w-4" />
                Sil
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </td>
    </tr>
  );
}
