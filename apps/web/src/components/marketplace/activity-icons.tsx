import { Factory, Hammer, Package, Truck, Wrench } from "lucide-react";
import type { ComponentType } from "react";

/**
 * FAALİYET TİPİ İKONLARI — "tedarikçi türü" süzgecinde ve ürün sayfasında
 * kullanılır (Europages kalıbı: seçenek satırı ikonla taranır).
 *
 * Etiketin tek kaynağı `@rothern/shared` `company-activities.ts`; burada
 * YALNIZ ikon eşlemesi var. Yeni bir faaliyet tipi eklenirse ikonu
 * olmayanda satır ikonsuz çizilir (kırılmaz) — sözlük ile ikonun tek
 * dosyada birleşmemesi bilinçli: shared paket React bileşeni taşımaz.
 */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  MANUFACTURER: Factory,
  CONTRACT_MANUFACTURER: Hammer,
  DISTRIBUTOR: Package,
  SERVICE_PROVIDER: Wrench,
  IMPORTER_EXPORTER: Truck,
};

export function ActivityIcon({ code, className = "size-4" }: { code: string; className?: string }) {
  const Icon = ICONS[code];
  if (!Icon) return null;
  return <Icon className={className} />;
}

export function hasActivityIcon(code: string): boolean {
  return code in ICONS;
}
