"use client";

import { Button } from "@/components/ui/button";
import {
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from "@/hooks/use-tenant-addresses";
import {
  ADDRESS_TYPE_META,
  type AddressType,
  type TenantAddress,
} from "@/lib/addresses/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Pencil,
  Plus,
  Power,
  Star,
  Trash2,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { toast } from "sonner";
// Performans audit P-4 — Lazy load
const AddressFormModal = dynamic(
  () => import("./address-form-modal").then((m) => m.AddressFormModal),
  { ssr: false },
);

interface Props {
  type: AddressType;
  addresses: TenantAddress[];
  onAddNew: () => void;
}

export function AddressGroupSection({ type, addresses, onAddNew }: Props) {
  const [expanded, setExpanded] = useState(true);
  const meta = ADDRESS_TYPE_META[type];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-5 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="text-2xl select-none" aria-hidden>
          {meta.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-brand-900">{meta.label}</p>
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border",
                meta.pillClass,
              )}
            >
              {addresses.length} adres
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{meta.description}</p>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded ? (
        <div className="border-t border-slate-100">
          {addresses.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-slate-500 mb-3">
                Henüz {meta.shortLabel.toLowerCase()} adresi eklenmemiş.
              </p>
              <Button variant="secondary" size="sm" onClick={onAddNew}>
                <Plus className="h-4 w-4" />
                İlk Adresi Ekle
              </Button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-xs uppercase text-slate-500 tracking-wide">
                      <th className="text-left px-5 py-3 w-10">#</th>
                      <th className="text-left px-5 py-3">Başlık</th>
                      <th className="text-left px-5 py-3">İl / İlçe</th>
                      <th className="text-left px-5 py-3">Durum</th>
                      <th className="text-right px-5 py-3 w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {addresses.map((addr, idx) => (
                      <AddressRow
                        key={addr.id}
                        address={addr}
                        index={idx + 1}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-slate-100">
                <Button variant="secondary" size="sm" onClick={onAddNew}>
                  <Plus className="h-4 w-4" />
                  Yeni {meta.shortLabel} Adresi Ekle
                </Button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function AddressRow({
  address,
  index,
}: {
  address: TenantAddress;
  index: number;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const setDefault = useSetDefaultAddress();
  const updateAddress = useUpdateAddress();
  const deleteAddress = useDeleteAddress();

  const onSetDefault = () => {
    setDefault.mutate(address.id, {
      onSuccess: () => toast.success("Default adres güncellendi"),
      onError: (err) =>
        toast.error(extractErrorMessage(err, "İşlem başarısız")),
    });
  };

  const onToggleActive = () => {
    updateAddress.mutate(
      { id: address.id, payload: { isActive: !address.isActive } },
      {
        onSuccess: () =>
          toast.success(
            address.isActive ? "Adres pasif yapıldı" : "Adres aktifleştirildi",
          ),
        onError: (err) =>
          toast.error(extractErrorMessage(err, "İşlem başarısız")),
      },
    );
  };

  const onDelete = () => {
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `"${address.title}" adresini silmek istediğinize emin misiniz?`,
      )
    ) {
      return;
    }
    deleteAddress.mutate(address.id, {
      onSuccess: () => toast.success("Adres silindi"),
      onError: (err) => toast.error(extractErrorMessage(err, "Silme başarısız")),
    });
  };

  return (
    <>
      <tr className="hover:bg-slate-50/40 transition-colors">
        <td className="px-5 py-4 text-slate-500 text-sm align-top">{index}</td>
        <td className="px-5 py-4 align-top">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-brand-900">{address.title}</p>
            {address.isDefault ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-semibold bg-warning-50 text-warning-700 border border-warning-200">
                <Star className="h-3 w-3 fill-warning-500 text-warning-500" />
                Default
              </span>
            ) : null}
          </div>
          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
            {address.fullAddress}
          </p>
        </td>
        <td className="px-5 py-4 align-top text-sm text-slate-600">
          {address.city} / {address.district}
        </td>
        <td className="px-5 py-4 align-top">
          {address.isActive ? (
            <span className="inline-flex items-center gap-1.5 text-success-700 text-sm font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-success-500" />
              Aktif
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-slate-500 text-sm font-semibold">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
              Pasif
            </span>
          )}
        </td>
        <td className="px-5 py-4 align-top text-right">
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
                    setEditOpen(true);
                  }}
                  className="px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2 text-brand-900 hover:bg-brand-50 focus:bg-brand-50"
                >
                  <Pencil className="h-4 w-4" />
                  Düzenle
                </DropdownMenu.Item>

                {address.isActive && !address.isDefault ? (
                  <DropdownMenu.Item
                    onSelect={(e) => {
                      e.preventDefault();
                      onSetDefault();
                    }}
                    className="px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2 text-warning-700 hover:bg-warning-50 focus:bg-warning-50"
                  >
                    <Star className="h-4 w-4" />
                    Default Yap
                  </DropdownMenu.Item>
                ) : null}

                <DropdownMenu.Item
                  onSelect={(e) => {
                    e.preventDefault();
                    onToggleActive();
                  }}
                  className={cn(
                    "px-3 py-2 text-sm rounded-lg cursor-pointer outline-none flex items-center gap-2",
                    address.isActive
                      ? "text-warning-700 hover:bg-warning-50 focus:bg-warning-50"
                      : "text-success-700 hover:bg-success-50 focus:bg-success-50",
                  )}
                >
                  <Power className="h-4 w-4" />
                  {address.isActive ? "Pasif Yap" : "Aktifleştir"}
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

      <AddressFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        mode="edit"
        address={address}
      />
    </>
  );
}
