"use client";

import { EmptyState } from "@/components/list";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Disclosure } from "@/components/ui/disclosure";
import { Pagination } from "@/components/ui/pagination";
import { Sheet } from "@/components/ui/sheet";
import { Skeleton, SkeletonCard, SkeletonText } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { ArrowRight, Filter, Inbox, Lock } from "lucide-react";
import { useState } from "react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
      <div className="flex flex-wrap items-start gap-3">{children}</div>
    </section>
  );
}

/** Tüm varyantlar bir sayfada — tasarım incelemesi ve klavye denetimi için. */
export function UiGallery() {
  const [sheet, setSheet] = useState<"bottom" | "right" | null>(null);
  const [page, setPage] = useState(6);
  const [chips, setChips] = useState<string[]>(["İstanbul"]);
  return (
    <main className="mx-auto max-w-5xl space-y-12 px-6 py-12">
      <header>
        <h1>UI primitive galerisi</h1>
        <p className="mt-1 text-sm text-zinc-500">Yalnız geliştirmede. Sözlük: components/ui — monokrom palet.</p>
      </header>

      <Section title="Button">
        <Button variant="primary">Kaydol</Button>
        <Button variant="secondary">Filtreleri temizle</Button>
        <Button variant="ghost">Vazgeç</Button>
        <Button variant="link">Tüm talepler</Button>
        <Button variant="danger">Sil</Button>
        <Button variant="primary" loading>
          Gönderiliyor
        </Button>
        <Button variant="secondary" iconLeft={<Filter data-slot="icon" />}>
          Filtrele (3)
        </Button>
        <Button variant="primary" iconRight={<ArrowRight data-slot="icon" />} href="/urunler">
          Ürünlere git
        </Button>
      </Section>

      <Section title="Badge">
        <Badge tone="verified">Doğrulanmış</Badge>
        <Badge tone="gold">Gold Üye</Badge>
        <Badge tone="new">Yeni</Badge>
        <Badge tone="neutral">Üretici</Badge>
        <Badge tone="danger">3 gün kaldı</Badge>
        <Badge tone="verified" size="sm">
          Doğrulanmış
        </Badge>
        <Badge tone="gold" size="sm" icon={false}>
          Gold
        </Badge>
      </Section>

      <Section title="Chip">
        <Chip>Elektrik</Chip>
        <Chip selected count={12}>
          İstanbul
        </Chip>
        <Chip count={0} disabled>
          Van
        </Chip>
        {chips.map((c) => (
          <Chip key={c} selected onRemove={() => setChips((x) => x.filter((y) => y !== c))} removeLabel={`${c} süzgecini kaldır`}>
            {c}
          </Chip>
        ))}
        <Chip href="/urunler?kategori=39000000">Elektrik malzemeleri</Chip>
      </Section>

      <Section title="Card">
        <Card padding="sm" className="w-56">
          <p className="text-sm">Küçük dolgu</p>
        </Card>
        <Card className="w-56">
          <p className="text-sm">Orta dolgu (varsayılan)</p>
        </Card>
        <Card padding="lg" interactive className="w-56">
          <p className="text-sm">Büyük + etkileşimli (hover kalkış)</p>
        </Card>
      </Section>

      <Section title="Avatar (monogram, deterministik pastel)">
        <Avatar name="Samsun Oluklu Mukavva" size={24} />
        <Avatar name="Samsun Oluklu Mukavva" size={32} />
        <Avatar name="İzmir Demir Çelik" size={48} />
        <Avatar name="Ege Tekstil" size={64} />
        <Avatar name="Karadeniz Enerji" size={96} />
        <Avatar name="Logo var" size={48} src="/rothern-icon-black.svg" />
      </Section>

      <Section title="Skeleton">
        <div className="w-56 space-y-3">
          <Skeleton className="h-6 w-1/2" />
          <SkeletonText lines={3} />
        </div>
        <div className="w-56">
          <SkeletonCard />
        </div>
      </Section>

      <Section title="EmptyState">
        <div className="w-full rounded-2xl ring-1 ring-zinc-950/5">
          <EmptyState
            icon={Inbox}
            title="Bu kriterlerle ürün bulunamadı"
            description="Süzgeçleri gevşetin ya da talep açın; tedarikçiler size teklif versin."
            action={<Button variant="primary">Talep aç</Button>}
            secondaryAction={<Button variant="secondary">Filtreleri temizle</Button>}
            variant="no-results"
          />
        </div>
      </Section>

      <Section title="Tabs (hash ile senkron)">
        <div className="w-full">
          <Tabs
            hashSync
            items={[
              { id: "aciklama", label: "Açıklama", content: <p className="text-sm text-zinc-700">Ürün açıklaması.</p> },
              { id: "ozellikler", label: "Özellikler", content: <p className="text-sm text-zinc-700">Özellik tablosu.</p> },
              { id: "firma", label: "Firma", content: <p className="text-sm text-zinc-700">Firma kartı.</p> },
              { id: "gizli", label: "Gizli", content: null, hidden: true },
            ]}
          />
        </div>
      </Section>

      <Section title="Disclosure">
        <div className="w-80 divide-y divide-zinc-200 rounded-2xl px-4 ring-1 ring-zinc-950/5">
          <Disclosure title="Şehir (2)" defaultOpen>
            <p className="text-sm text-zinc-600">İstanbul, İzmir</p>
          </Disclosure>
          <Disclosure title="Faaliyet tipi">
            <p className="text-sm text-zinc-600">Üretici, Distribütör</p>
          </Disclosure>
        </div>
      </Section>

      <Section title="Sheet">
        <Button variant="secondary" onClick={() => setSheet("bottom")}>
          Alt çekmece (süzgeç)
        </Button>
        <Button variant="secondary" onClick={() => setSheet("right")}>
          Sağ çekmece (menü)
        </Button>
        <Sheet
          open={sheet !== null}
          onClose={() => setSheet(null)}
          side={sheet ?? "bottom"}
          title="Filtreler"
          footer={
            <Button variant="primary" fullWidth onClick={() => setSheet(null)}>
              Sonuçları göster (30)
            </Button>
          }
        >
          <SkeletonText lines={8} />
        </Sheet>
      </Section>

      <Section title="Tooltip">
        <Tooltip label="Teklifler birbirini görmez">
          <span className="inline-flex items-center gap-1 text-sm text-zinc-700">
            <Lock aria-hidden className="size-4" /> Kapalı zarf
          </span>
        </Tooltip>
        <Tooltip label="Alta açılır" side="bottom">
          <Button variant="ghost">Bilgi</Button>
        </Tooltip>
      </Section>

      <Section title="Breadcrumb (mobilde son 2)">
        <Breadcrumb
          items={[
            { label: "Anasayfa", href: "/" },
            { label: "Elektrik malzemeleri ve aydınlatma", href: "/urunler/kategori/39000000" },
            { label: "Samsun Oluklu Mukavva", href: "/firma/samsun-oluklu-mukavva" },
            { label: "Fındık ihracat kolisi 25 kg" },
          ]}
        />
      </Section>

      <Section title="Pagination (7 yuva)">
        <div className="w-full space-y-3">
          <Pagination page={page} total={20 * 24} pageSize={24} onChange={setPage} />
          <Pagination page={2} total={5 * 24} pageSize={24} hrefBuilder={(p) => `/urunler?sayfa=${p}`} />
        </div>
      </Section>
    </main>
  );
}
