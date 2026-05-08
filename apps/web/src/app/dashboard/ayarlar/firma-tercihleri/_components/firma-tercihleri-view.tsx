"use client";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useTenantAddresses } from "@/hooks/use-tenant-addresses";
import { ADDRESS_TYPE_META, type AddressType } from "@/lib/addresses/types";
import { Loader2, MapPin, Plus, Shield } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BackToSettings } from "../../_components/back-to-settings";
import { AddressFormModal } from "./address-form-modal";
import { AddressGroupSection } from "./address-group-section";

const TYPES: AddressType[] = ["FATURA", "ILETISIM", "TESLIMAT"];

export function FirmaTercihleriView() {
  const { user } = useAuth();
  const isAdmin = user?.role === "COMPANY_ADMIN";

  const addressesQuery = useTenantAddresses();

  const [addOpen, setAddOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<AddressType>("FATURA");

  const grouped = useMemo(() => {
    const out: Record<AddressType, ReturnType<typeof Array.prototype.filter>> = {
      FATURA: [],
      ILETISIM: [],
      TESLIMAT: [],
    } as never;
    for (const addr of addressesQuery.data ?? []) {
      out[addr.type].push(addr);
    }
    return out;
  }, [addressesQuery.data]);

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
              Adres yönetimi yalnızca <strong>Firma Yöneticisi</strong>{" "}
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

  if (addressesQuery.isLoading || !addressesQuery.data) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Adresler yükleniyor…
      </div>
    );
  }

  const handleAddNew = (type: AddressType) => {
    setDefaultType(type);
    setAddOpen(true);
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <BackToSettings />

      <div className="mt-4 mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <MapPin className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-brand-900">
              Firma Tercihleri
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Fatura, iletişim ve teslimat adreslerinizi yönetin. İhale
              oluştururken bu adreslerden seçim yapacaksınız.
            </p>
          </div>
        </div>
        <Button variant="primary" onClick={() => handleAddNew("FATURA")}>
          <Plus className="h-4 w-4" />
          Yeni Adres Ekle
        </Button>
      </div>

      <div className="space-y-4">
        {TYPES.map((type) => (
          <AddressGroupSection
            key={type}
            type={type}
            addresses={grouped[type]}
            onAddNew={() => handleAddNew(type)}
          />
        ))}
      </div>

      <AddressFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        mode="create"
        defaultType={defaultType}
      />
    </div>
  );
}

// Suppress unused (used by inline reference)
void ADDRESS_TYPE_META;
