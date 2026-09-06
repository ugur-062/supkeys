# Europages kalitesi — PROMPT 0 Keşif Raporu (2026-09-06)

Kod değişikliği YOK. Üç bağımsız okuma taramasının birleşimi; her iddia
`dosya:satır` taşır. Sonraki prompt'lar ("keşif raporuna göre") bu dosyayı okur.

## 0. Uyum notları — prompt serisinin bu repoyla çeliştiği yerler

| Konu | Seri | Repo (bugün) | Karar gerekir mi |
|------|------|--------------|------------------|
| Tailwind | `tailwind.config` | **v4.2.4, config yok**; tema `apps/web/src/app/globals.css:9-98` `@theme` | Hayır — PROMPT 1 `@theme`'e uyarlanır; `container` ayarı v4'te yok |
| Renk | lacivert brand (#0B1F3A…) | **monokrom zinc** (Catalyst kararı, `globals.css:10-23`); `.card` iki kez tanımlı (103 / 199), 11 tanımsız semantik ton kullanılıyor | **EVET** — palet |
| Font | Inter + **Manrope** | `next/font` Inter (variable) + Geist Mono (`layout.tsx:3-17`); **Plus Jakarta Sans kodda yok** (CLAUDE.md markası ile çelişir); `--font-display` = Inter | **EVET** — başlık fontu |
| Bileşen adları | ProductCard, RequestCard, FilterSidebar, SearchTypeahead… | çoğu var ama farklı adla (`components/marketplace/*`, `ui/*` Catalyst sarmalayıcı) | **EVET** — yeniden adlandırma mı, eşleme mi |
| URL şeması | `min/max`, `sirala=uygunluk\|fiyat-artan` | `fiyatMin/fiyatMax/moqMax`, `sirala=yeni\|fiyat\|fiyat-azalan` (uygunluk = boş), `nitelik=` (tek kaynak `lib/public/product-filter-params.ts`, testli) | Öneri: mevcut şema kalsın |
| PROMPT 3 sorun listesi | "sidebar link, sticky max-height yok, mobil süzgeç yok, sayfalama yok, boş durum yok" | `/urunler` için **hepsi çözülmüş** (v3); eksikler `/alim-talepleri` ve `/firmalar`da | PROMPT 3 daralır, PROMPT 4 büyür |
| Kategori fotoğrafı | CategoryTile "fotoğraf kullanma" | 58 segment fotoğrafı kullanıcı kararıyla eklendi (`public/categories/*.webp`, CC0) | **EVET** |
| "Temsili" etiketi | ProductCard stok görselde etiket | kullanıcı kararıyla KALDIRILDI (2026-09-04) | **EVET** |
| Komut | `npm run lint && npm run build` | `pnpm --filter @rothern/web lint` (`next lint`) ve `build` | Hayır |
| Araçlar | axe-core, Lighthouse, knip | yalnız `@playwright/test`; `jest-axe` var (birim) | PROMPT 10'da bağımlılık raporu |
| `/dev/ui` | geliştirme galerisi | yok; public rota CSP listesi `lib/public-routes.ts` | Hayır |
| Metin | "Türkçe metinleri değiştirme" | PROMPT 9 hero h1 ve bazı CTA'lar metin değişikliği gerektiriyor | Not |

Ek gerçekler: `<html lang="tr">` (`layout.tsx:63`) olduğu için CSS `uppercase`
dil-duyarlı çalışır; asıl tehlike JS `toUpperCase()` (6 kullanım, hepsi veri
normalizasyonu). Anasayfa kaynağında "Talep aç" 12 kez geçiyor (kabul ölçütü ≤2).


---

# Bölüm A — Çerçeve, stil, font, primitive katmanı

# Discovery — framework, styling, fonts, UI wrappers (`apps/web`)

Read-only pass. No files modified. All claims carry `file:line` evidence.
Repo root: `/home/noah/projects/supkeys` · app: `/home/noah/projects/supkeys/apps/web`
All paths below are relative to `apps/web` unless stated otherwise.

---

## 1. Framework, React, Tailwind, App Router, tailwind.config

| Thing | Value | Evidence |
|---|---|---|
| Next.js | **15.5.18** (declared and resolved — exact pin, no caret) | `apps/web/package.json:28`; `node_modules/next/package.json` version 15.5.18 |
| React | `^19.0.0` declared, **19.2.5** resolved | `apps/web/package.json:29` |
| react-dom | `^19.0.0` declared, **19.2.5** resolved | `apps/web/package.json:30` |
| Tailwind | `^4.0.0` declared, **4.2.4** resolved | `apps/web/package.json:57` |
| `@tailwindcss/postcss` | `^4.0.0` declared, **4.2.4** resolved | `apps/web/package.json:43` |
| `@headlessui/react` | `^2.2.10`, resolved 2.2.10 | `apps/web/package.json:17` |
| eslint-config-next | `15.5.18` | `apps/web/package.json:53` |

- **App Router: YES.** `src/app/` holds `layout.tsx`, `page.tsx`, `globals.css`, `robots.ts`, `sitemap.ts`, `error.tsx`, `global-error.tsx`, `not-found.tsx`, plus route dirs `alim-talepleri`, `company`, `davet-kapat`, `firma`, `firmalar`, `hakkimizda`, `iletisim`, `nasil-calisir`, `reset-password`, `sozlesmeler`, `talep`, `talep-onayla`, `urunler`. Route groups are in use, e.g. `src/app/company/(authed)/`.
- `src/` top level: `app`, `components`, `hooks`, `lib`, `middleware.ts`.
- **NO `tailwind.config.*` ANYWHERE IN THE REPO.** A repo-wide `find … -name 'tailwind.config.*' -not -path '*/node_modules/*'` returned zero results. Theme is entirely `@theme` in CSS — `src/app/globals.css:9`.
- PostCSS config is the only build-side style config: `postcss.config.mjs:1-5`, single plugin `@tailwindcss/postcss` (line 3).
- Monorepo: pnpm + Turborepo — root `package.json:4` (`"packageManager": "pnpm@10.33.0"`), root `package.json:6-11` (`turbo run …`), workspace deps `"@rothern/shared": "workspace:*"` at `apps/web/package.json:21`.
- Other style-relevant deps: `clsx ^2.1.1` (`:24`), `tailwind-merge ^2.6.0` (`:36`), `lucide-react ^0.468.0` (`:26`), `@heroicons/react ^2.2.0` (`:18`), `motion ^12.40.0` (`:27`), `recharts ^3.8.1` (`:33`), `sonner ^1.7.1` (`:35`), `@radix-ui/react-dropdown-menu ^2.1.16` (`:20`).
- Test/build tooling: `vitest ^4.1.9` (`:59`), `@testing-library/react ^16.3.2` (`:45`), `jest-axe ^11.0.0` (`:54`), `@playwright/test ^1.60.0` (`:42`).

---

## 2. Font setup

Loaded through **`next/font/google`** — `src/app/layout.tsx:3`:

```
import { Geist_Mono, Inter } from "next/font/google";
```

**Inter** — `src/app/layout.tsx:8-12`

```
const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});
```

- **No `weight` array** is passed — it is loaded as a variable font (full weight axis available).
- Comment at `src/app/layout.tsx:7`: "Catalyst ile birebir: variable Inter (cv11 stylistic set globals.css'te aktif)".

**Geist Mono** — `src/app/layout.tsx:13-17`

```
const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});
```

**Where applied**

- `<html>` gets both CSS variables — `src/app/layout.tsx:63`: `className={\`${inter.variable} ${geistMono.variable}\`}`, with `lang="tr"`.
- `<body>` carries only `className="antialiased"` — `src/app/layout.tsx:64`. The family itself is applied from CSS, not from a body class.
- Sonner toasts pin the family explicitly — `src/app/layout.tsx:79`: `fontFamily: "var(--font-inter), system-ui, sans-serif"`.

**CSS variable bindings** — `src/app/globals.css`

| Line | Declaration |
|---|---|
| 56 | comment: "Fonts — Catalyst ile birebir: variable Inter (next/font) + cv11" |
| 57 | `--font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;` |
| 58 | `--font-sans--font-feature-settings: "cv11";` |
| 59 | `--font-display: var(--font-inter), ui-sans-serif, system-ui, sans-serif;` |
| 60 | `--font-display--font-feature-settings: "cv11";` |
| 61 | `--font-mono: var(--font-geist-mono), ui-monospace, "SFMono-Regular", monospace;` |

Body consumption — `src/app/globals.css:158-166`: `font-family: var(--font-sans)` (161) and `font-feature-settings: "cv11"` (162), plus `-webkit-font-smoothing: antialiased` (163), `-moz-osx-font-smoothing: grayscale` (164), `text-rendering: optimizeLegibility` (165).

**Display font: THERE IS NONE, and Plus Jakarta Sans DOES NOT EXIST in this app.**

- A repo grep across `apps/web/src` for `Jakarta`, `Plus_Jakarta`, `font-display`, `--font-display` returned exactly four hits:
  - `src/app/globals.css:59` — `--font-display` aliased to `var(--font-inter)`
  - `src/app/globals.css:60` — its feature settings
  - `src/components/tenders/logistics-info.tsx:64` — `className="font-display font-bold text-base text-zinc-900"`
  - `src/components/list/empty-state.tsx:48` — `className="text-lg font-display font-semibold text-zinc-900 mb-2"`
- `grep -rn "next/font" src/` returns only `src/app/layout.tsx:3` and the comment at `src/app/globals.css:56`. No other font loader exists anywhere in the app.
- So the two `font-display` class uses render in **Inter**, identical to `font-sans`. The brand line in the root `CLAUDE.md` ("Inter (UI) + Plus Jakarta Sans (display)") does **not** match the code.

---

## 3. `src/app/globals.css` — full structure (**331 lines total**)

### 3.1 Block map

| Line | Block |
|---|---|
| 1 | `@import "tailwindcss";` |
| 7 | `@custom-variant dark (&:where(.dark, .dark *));` |
| 9-98 | `@theme { … }` |
| 102-117 | `@layer components { … }` — `.card`, `.card-hover` (plain CSS) |
| 119-181 | `@layer base { … }` |
| 183-215 | `@layer components { … }` — `.btn-primary`, `.btn-secondary`, `.card`, `.input-base`, `.label-base` (all `@apply`) |
| 221-227 | `@media (max-width: 640px)` — iOS zoom-on-focus guard |
| 230-297 | keyframes + animation classes (`rt-*`) |
| 301-306 | `[data-sonner-toast] [data-close-button]` override |
| 322-331 | global `prefers-reduced-motion` kill-switch |

There is **no `@layer utilities` block** and **no custom `tabular-nums` utility** — `tabular-nums` in components comes from Tailwind's built-in utility.

### 3.2 Dark mode is structurally disabled

`src/app/globals.css:3-7`. The `dark` variant is redefined as class-based (`&:where(.dark, .dark *)`) and the comment states `.dark` is never added, so every `dark:` utility in the codebase is inert even when the OS prefers dark. Reinforced by `:root { color-scheme: light; }` at lines 154-156, which also keeps native controls and scrollbars light.

### 3.3 `@theme` tokens (lines 9-98) — complete list

**Brand — monochrome zinc** (13-23). Header comment 10-12: brand-\* is used only on tenant surfaces and is mapped to black/zinc so all blue accents match the supplier side.

| Token | Value | Note in source |
|---|---|---|
| `--color-brand-50` | `#FAFAFA` | zinc-50 |
| `--color-brand-100` | `#F4F4F5` | zinc-100 |
| `--color-brand-200` | `#E4E4E7` | zinc-200 |
| `--color-brand-300` | `#D4D4D8` | zinc-300 |
| `--color-brand-400` | `#A1A1AA` | zinc-400 |
| `--color-brand-500` | `#52525B` | zinc-600 — focus ring / mid accent |
| `--color-brand-600` | `#18181B` | zinc-900 — primary / active → black |
| `--color-brand-700` | `#09090B` | zinc-950 — hover |
| `--color-brand-800` | `#09090B` | zinc-950 — active |
| `--color-brand-900` | `#18181B` | zinc-900 — heading / text |
| `--color-brand-950` | `#09090B` | zinc-950 |

**Semantic status colors** (25-35). Comment 25-26: brand may be monochrome, but success/warning/error stay colored for legibility.

| Token | Value |
|---|---|
| `--color-success-50` | `#ECFDF5` |
| `--color-success-500` | `#10B981` |
| `--color-success-600` | `#059669` |
| `--color-warning-50` | `#FFFBEB` |
| `--color-warning-500` | `#F59E0B` |
| `--color-warning-600` | `#D97706` |
| `--color-danger-50` | `#FEF2F2` |
| `--color-danger-500` | `#EF4444` |
| `--color-danger-600` | `#DC2626` |

**Surface** (37-41) — comment: "net/kurumsal (Linear/Stripe tarzı, nötr)".

| Token | Value |
|---|---|
| `--color-surface-base` | `#FFFFFF` |
| `--color-surface-subtle` | `#FAFAFA` |
| `--color-surface-muted` | `#F4F4F5` |
| `--color-surface-border` | `#E4E4E7` |

**Slate remapped onto the zinc ramp** (43-54) — comment 43: converts slate to a clean neutral (zinc) scale for all `text-/bg-/border-slate-*`.

| Token | Value |
|---|---|
| `--color-slate-50` | `#FAFAFA` |
| `--color-slate-100` | `#F4F4F5` |
| `--color-slate-200` | `#E4E4E7` |
| `--color-slate-300` | `#D4D4D8` |
| `--color-slate-400` | `#A1A1AA` |
| `--color-slate-500` | `#71717A` |
| `--color-slate-600` | `#52525B` |
| `--color-slate-700` | `#3F3F46` |
| `--color-slate-800` | `#27272A` |
| `--color-slate-900` | `#18181B` |
| `--color-slate-950` | `#09090B` |

`zinc` itself is **not** redefined — Tailwind v4 defaults apply.

**Fonts** (56-61) — see section 2.

**Shadows**

| Line | Token | Value |
|---|---|---|
| 64 | `--shadow-card` | `0 1px 2px rgba(0,0,0,.04), 0 1px 3px rgba(0,0,0,.05)` |
| 65 | `--shadow-card-hover` | `0 4px 16px rgba(0,0,0,.08)` **(overridden — see 3.7)** |
| 89 | `--shadow-card-hover` | `0 8px 24px rgba(15,23,42,.07)` **(winner)** |
| 90 | `--shadow-table-top` | `0 1px 0 0 oklch(0.21 0.006 286 / 0.05)` |
| 91 | `--shadow-table-bottom` | `0 -1px 0 0 oklch(0.21 0.006 286 / 0.08)` |
| 92-93 | `--shadow-overlay` | `0 20px 25px -5px rgba(0,0,0,.12), 0 8px 10px -6px rgba(0,0,0,.08)` |

**Radii** (67-70, plus role aliases 94-97)

| Line | Token | Value |
|---|---|---|
| 68 | `--radius-lg` | `0.5rem` |
| 69 | `--radius-xl` | `0.75rem` |
| 70 | `--radius-2xl` | `1rem` |
| 95 | `--radius-control` | `0.5rem` |
| 96 | `--radius-card` | `0.75rem` |
| 97 | `--radius-overlay` | `1rem` |

**"P1 token completion" group** (72-97) — header comment 72 marks these as added by the frontend audit.

| Line | Token | Value | Purpose per comment |
|---|---|---|---|
| 74 | `--color-line` | `#E8E8EA` | border: 5 values collapsed to 2 (comment 73) |
| 75 | `--color-line-strong` | `#D9D9DE` | |
| 77 | `--color-fg` | `#27272A` | text family (comment 76) |
| 78 | `--color-fg-muted` | `#71717A` | |
| 79 | `--color-fg-subtle` | `#A1A1AA` | |
| 81 | `--color-info-50` | `#EFF6FF` | completes the semantic set (comment 80) |
| 82 | `--color-info-500` | `#3B82F6` | |
| 83 | `--color-info-600` | `#2563EB` | |
| 85 | `--color-rating` | `#FBBF24` (amber-400) | comment 84: deliberate exception, star ratings ONLY |

### 3.4 `@layer base` (119-181)

| Lines | Rule |
|---|---|
| 120-124 | `*, ::before, ::after { border-color: var(--color-surface-border) }` |
| 126-128 | Comment (P0 — cursor): Tailwind v4 Preflight does not set `cursor:pointer` on buttons; 41/41 buttons measured showing an arrow cursor |
| 129-133 | `button:not(:disabled), [role="button"]:not([aria-disabled="true"]), summary { cursor: pointer }` |
| 134-137 | `button:disabled, [aria-disabled="true"] { cursor: not-allowed }` |
| 139-141 | Comment (P0 — one focus ring): collapses header blue ring / account-menu outline-2 / unstyled sidebar into one |
| 142-146 | `:focus-visible { outline: 2px solid var(--color-zinc-950, #09090b); outline-offset: 2px; border-radius: 0.5rem }` |
| 148-151 | `html, body { height: 100% }` |
| 154-156 | `:root { color-scheme: light }` |
| 158-166 | **body**: `background-color: var(--color-surface-subtle)` (#FAFAFA) · `color: var(--color-slate-900)` (#18181B, "Catalyst nötr metin") · `font-family: var(--font-sans)` · `font-feature-settings: "cv11"` · webkit/moz smoothing · `text-rendering: optimizeLegibility` |
| 169-180 | 0.15s ease transition on `color, background-color, border-color, box-shadow` for `a, button, input, textarea, select, [role="button"]`. Comment 168: only safe properties — no `transform`/`all`, so Radix animations are untouched |

**There are NO heading rules in `@layer base`.** `h1`–`h6` are unstyled at base level; heading typography comes from utility classes or `catalyst/heading.tsx`.

### 3.5 Component utilities

First `@layer components` block (102-117), preceded by comment 100-101 ("ortak kart dili (tek kaynak)"):

| Lines | Class | Definition |
|---|---|---|
| 103-108 | `.card` | `border-radius: var(--radius-xl, .75rem)`; `border: 1px solid rgb(226 232 240 / .8)` (slate-200/80); `background-color:#fff`; `box-shadow: 0 1px 2px rgba(15,23,42,.04)` |
| 109-111 | `.card-hover` | `transition: all 200ms` |
| 112-116 | `.card-hover:hover` | `translateY(-1px)`; `border-color: rgb(203 213 225)` (slate-300); `box-shadow: 0 8px 24px rgba(15,23,42,.07)` |

Second `@layer components` block (183-215), all `@apply`:

| Lines | Class | Definition |
|---|---|---|
| 184-190 | `.btn-primary` | `inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg select-none bg-brand-600 text-white font-medium text-sm shadow-sm hover:bg-brand-700 hover:shadow active:bg-brand-800 active:scale-[0.98] transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100` |
| 192-197 | `.btn-secondary` | `… bg-white text-brand-700 font-medium text-sm border border-surface-border shadow-sm hover:bg-brand-50 hover:border-brand-200 active:scale-[0.98] transition focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2` |
| 199-201 | `.card` | `@apply bg-white rounded-xl shadow-sm ring-1 ring-zinc-950/5` **(collides with 103)** |
| 203-210 | `.input-base` | `w-full px-3.5 py-2.5 rounded-lg border border-surface-border bg-white shadow-sm text-brand-900 text-sm placeholder:text-slate-400 hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 transition` |
| 212-214 | `.label-base` | `block text-sm font-medium text-brand-900 mb-1.5` |

### 3.6 Animations, media queries, overrides

| Lines | Content |
|---|---|
| 217-227 | Comment (Polish-3) + `@media (max-width:640px) { input, textarea, select { font-size:16px } }` — stops iOS zoom-on-focus; desktop keeps `text-sm` |
| 230-233 / 238 | `@keyframes rt-float` (translateY 0 → -12px) · `.rt-float` 6s ease-in-out infinite |
| 234-237 / 239 | `@keyframes rt-float-slow` (0 → -8px) · `.rt-float-slow` 8s |
| 240-242 | reduced-motion off-switch for the two float classes |
| 245-252 / 253-254 | `rt-nudge-r` / `rt-nudge-l` (translateX ±5px) · 1.4s each |
| 255-257 | reduced-motion off-switch |
| 260-263 / 264 | `rt-fade-in` (opacity 0 + translateY(10px) scale(.99) → 1) · 0.45s ease-out |
| 265-267 | reduced-motion off-switch |
| 270-273 / 274 | `rt-marquee` (translateX 0 → -50%) · 40s linear infinite — sector marquee |
| 275-277 | reduced-motion off-switch |
| 280-283 / 284 | `rt-breathe` (opacity .5→.85, scale 1→1.06) · 5s — assistant empty-state halo |
| 285-287 | reduced-motion off-switch |
| 290-293 / 294 | `rt-dot` (translateY -3px, opacity .4→1) · 1.2s — assistant thinking dots |
| 295-297 | reduced-motion off-switch (leaves `opacity:.6`) |
| 299-306 | Sonner close button (`[data-sonner-toast] [data-close-button]`) moved inside the box, top-right: `left:auto; right:6px; top:6px; transform:none` |
| 308-321 | Long comment (Dalga B-4 / audit P10) explaining why a blanket reduced-motion rule was needed: per-animation opt-outs missed Tailwind's `animate-pulse`/`animate-bounce` and every `transition-*`; `animate-spin` is a deliberate exception because a frozen spinner reads as a hung UI |
| 322-331 | `@media (prefers-reduced-motion: reduce) { *:not(.animate-spin), …::before, …::after { animation-duration:.01ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; scroll-behavior:auto !important } }` |

### 3.7 Two collisions and eleven undefined tokens (factual findings)

**Duplicate definitions.** Later definition wins in both cases:

- `--shadow-card-hover` — `globals.css:65` then `globals.css:89`, both inside the same `@theme` block.
- `.card` — `globals.css:103` (plain CSS, slate-200/80 border + drop shadow) then `globals.css:199` (`@apply … ring-1 ring-zinc-950/5`). Both live in `@layer components`, so the second wins and the first block's border/shadow never apply. `.card-hover` (109) still references the visual language of the first.

**Semantic color classes used in components but absent from `@theme`.** Tailwind v4 generates custom color utilities only from `@theme` tokens, so each of these emits no CSS:

| Token | Uses | Locations |
|---|---|---|
| `success-700` | 11 | `src/lib/tenders/labels.ts:31`, `:86`, `:117`, +8 more |
| `success-900` | 5 | `src/components/tcmb-rates-widget.tsx:147`, `:174`, `:181`, +2 |
| `warning-700` | 4 | `src/lib/tenders/labels.ts:27`, `:35`, `:82`, +1 |
| `danger-300` | 3 | `src/components/tenders/wizard/step-2-items.tsx:264`, `:475`, `:493` |
| `warning-200` | 3 | `src/components/tenders/wizard/step-2-items.tsx:491`, `wizard/publish-confirm-dialog.tsx:70`, `wizard/item-question-modal.tsx:158` |
| `danger-700` | 2 | `src/lib/tenders/labels.ts:47`, `src/components/tenders/wizard/item-question-modal.tsx:282` |
| `success-200` | 2 | `src/components/tcmb-rates-widget.tsx:144`, `src/components/tenders/wizard/step-1-info.tsx:1226` |
| `warning-800` | 2 | `src/components/tenders/wizard/item-question-modal.tsx:158`, `wizard/publish-confirm-dialog.tsx:70` |
| `success-100` | 1 | `src/components/tenders/wizard/step-0-type-scope.tsx:51` |
| `success-800` | 1 | `src/components/tenders/wizard/step-1-info.tsx:1232` |
| `warning-100` | 1 | `src/components/tenders/wizard/step-2-items.tsx:491` |

Defined-and-usable shades are only `-50`, `-500`, `-600` for `success`, `warning`, `danger`, plus `info`, and the full `brand` ramp.

---

## 4. UI primitive layer

### 4.1 `src/components/ui/` — 25 `.tsx` files + `__tests__/money-input.test.ts`

| File | Lines | Description | Wraps Catalyst |
|---|---|---|---|
| `alert.tsx` | 89 | Inline alert box (`export function Alert`) | no |
| `avatar-initials.tsx` | 34 | Initials avatar, sized `md` default | no |
| `button.tsx` | 64 | App-wide button, `forwardRef` | **yes** — `catalyst/button` |
| `callout.tsx` | 75 | Variant-typed callout (`CalloutVariant`) | no |
| `date-time-input.tsx` | 77 | Split date + time; user picks date only, `defaultTime` fills the hour | no |
| `dropzone.tsx` | 88 | File drop area (react-dropzone) | no |
| `error-state.tsx` | 46 | Error placeholder block | no |
| `field.tsx` | 53 | Field context; `aria-describedby` = error id, else hint id; `aria-invalid` source | no |
| `iban.tsx` | 74 | P2 audit §9 — single IBAN display, masked by default (`TR17 •••• •••• 8381`) with reveal | no |
| `icon-button.tsx` | 35 | Tailwind Plus / Catalyst icon-button pattern (zinc ghost); `danger` → red hover. Comment notes Catalyst has no separate primitive | no (styled to match) |
| `input.tsx` | 31 | App-wide input; `hasError` → Catalyst `invalid` | **yes** — `catalyst/input` |
| `label.tsx` | 25 | Label with `required` marker | no |
| `missing-fields.tsx` | 43 | Single missing-field list component (2026-09-03) | no |
| `money-input.tsx` | 122 | Thousands-separated money entry; display `tr-TR` (100.000,50), state raw (`100000.50`) | no |
| `money.tsx` | 89 | Money formatting/display. Header note: symbol table single source is `lib/tenders/labels.ts`; a local copy previously disagreed on CHF/AED | no |
| `phone-input.tsx` | 97 | International phone: flag + country code select, national number; value is full `+90 5xxxxxxxxx` | no |
| `role-badge.tsx` | 19 | C31 — single role display: Kurucu amber, operational roles zinc; labels from central dictionary | **yes** — `catalyst/badge` |
| `select-menu.tsx` | 90 | Select menu control | no |
| `star-rating.tsx` | 93 | P2 audit §9 — SVG stars (not `★` glyph), fill `--color-rating`, `role="radiogroup"` | no |
| `status-badge.tsx` | 72 | P1 audit §8.4 — badge discipline, exports `StatusTone` | no |
| `textarea.tsx` | 33 | App-wide textarea; `hasError` → `invalid` | **yes** — `catalyst/textarea` |
| `thumb.tsx` | 66 | Single thumbnail component (v2 audit, 2026-09-03) | no |
| `trend-badge.tsx` | 46 | Tailwind Plus stats "with-trending" — green ↑ / red ↓ percent delta | no |
| `unit-select.tsx` | 144 | Unit-of-measure picker | **yes** — `catalyst/select` |
| `waiting-state.tsx` | 70 | P2 audit §5 — "cannot act, waiting on the other side"; exists because `EmptyState` forces an action | no |

**Five wrappers, confirmed by import:** `button.tsx` → `@/components/catalyst/button`; `input.tsx` → `catalyst/input`; `textarea.tsx` → `catalyst/textarea`; `role-badge.tsx` → `catalyst/badge`; `unit-select.tsx` → `catalyst/select`. No other file in `ui/` imports from `catalyst/`.

**`EmptyState` is NOT in `ui/`** — it lives at `src/components/list/empty-state.tsx` (referenced by the `waiting-state.tsx` header comment, and one of the two `font-display` users at line 48).

### 4.2 `src/components/catalyst/` — 21 files (upstream Tailwind Catalyst, monochrome zinc)

| File | Lines | Exports | `"use client"` |
|---|---|---|---|
| `avatar.tsx` | 87 | `Avatar`, `AvatarButton` | no |
| `badge.tsx` | 82 | `Badge`, `BadgeButton` | no |
| `button.tsx` | 213 | `Button`, `TouchTarget` | no |
| `checkbox.tsx` | 157 | `CheckboxGroup`, `CheckboxField`, `Checkbox` | no |
| `description-list.tsx` | 37 | `DescriptionList`, `DescriptionTerm`, `DescriptionDetails` | no |
| `dialog.tsx` | 86 | `Dialog`, `DialogTitle`, `DialogDescription`, `DialogBody`, `DialogActions` | no |
| `divider.tsx` | 20 | `Divider` | no |
| `dropdown.tsx` | 186 | `Dropdown`, `DropdownButton`, `DropdownMenu`, `DropdownItem`, `DropdownHeader`, `DropdownSection`, `DropdownHeading`, `DropdownDivider`, `DropdownLabel`, `DropdownDescription`, `DropdownShortcut` | **yes** |
| `fieldset.tsx` | 91 | `Fieldset`, `Legend`, `FieldGroup`, `Field`, `Label`, `Description`, `ErrorMessage` | no |
| `heading.tsx` | 27 | `Heading`, `Subheading` | no |
| `input.tsx` | 92 | `InputGroup`, `Input` | no |
| `link.tsx` | 20 | `Link` — bound to the Next.js App Router (header comment) | no |
| `navbar.tsx` | 96 | `Navbar`, `NavbarDivider`, `NavbarSection`, `NavbarSpacer`, `NavbarItem`, `NavbarLabel` | **yes** |
| `radio.tsx` | 142 | `RadioGroup`, `RadioField`, `Radio` | no |
| `select.tsx` | 68 | `Select` | no |
| `sidebar-layout.tsx` | 82 | `SidebarLayout` | **yes** |
| `sidebar.tsx` | 142 | `Sidebar`, `SidebarHeader`, `SidebarBody`, `SidebarFooter`, `SidebarSection`, `SidebarDivider`, `SidebarSpacer`, `SidebarHeading`, `SidebarItem`, `SidebarLabel` | **yes** |
| `switch.tsx` | 195 | `SwitchGroup`, `SwitchField`, `Switch` | no |
| `table.tsx` | 132 | `Table`, `TableHead`, `TableBody`, `TableRow`, `TableHeader`, `TableCell` | **yes** |
| `text.tsx` | 40 | `Text`, `TextLink`, `Strong`, `Code` | no |
| `textarea.tsx` | 54 | `Textarea` | no |

Note for section 5: `catalyst/table.tsx:38-43` bakes `uppercase` into `TableHead` itself — comment at line 38 calls it "§9 DataTable (frontend denetimi): sunken zemin + mikro-uppercase başlık", class string at line 43 is `bg-zinc-50/80 text-xs tracking-wide text-zinc-500 uppercase`.

### 4.3 Other component directories (for orientation)

`src/components/` also contains: `__tests__`, `bids`, `brand`, `categories`, `company`, `company-shell`, `dashboard`, `ihale`, `inquiries`, `list`, `marketing`, `marketplace`, `messaging`, `orders`, `products`, `providers`, `reports`, `tenders`, `ui`, `catalyst`, plus loose files `countdown-timer.tsx`, `currency-multi-select.tsx`, `tcmb-rates-widget.tsx`.

---

## 5. `uppercase` / `text-transform: uppercase` (Turkish İ/ı hazard)

**97 occurrences of the token `uppercase` in `src/`. Zero of them are in test files** (verified: `grep … | grep '\.test\.' | wc -l` = 0).

Of those 97, exactly **one is CSS `text-transform: uppercase`**:

- `src/app/company/(authed)/siparis/[id]/_components/order-print.ts:71` — print stylesheet: `th{text-align:left;color:#71717a;font-size:11px;text-transform:uppercase}`

The other 96 are the Tailwind `uppercase` class. **Two of them sit in shared primitives and therefore fan out across the whole app:**

- `src/components/catalyst/table.tsx:43` — every `TableHead` in the product
- `src/components/catalyst/avatar.tsx:38` — `className="size-full fill-current p-[5%] text-[48px] font-medium uppercase select-none"` (avatar initials)

### Complete list, grouped by file

**`src/app/company/(authed)/`**
- `ilan/[id]/teklif-ver/page.tsx:1559`, `:1666`
- `ilan/[id]/page.tsx:130`, `:994`, `:1483`, `:2011`
- `ilan/[id]/teklif/[bidId]/page.tsx:325`
- `ilan/[id]/_components/my-bid-status-panel.tsx:144`, `:152`, `:164`
- `ilan/[id]/_components/auction-live-card.tsx:49`
- `ayarlar/page.tsx:203`
- `ayarlar/ai-kullanim/page.tsx:73`, `:89`, `:107`, `:145`
- `ayarlar/_components/company-users-section.tsx:119`, `:198`, `:450`
- `ayarlar/_components/approval-flows-section.tsx:618`, `:668`, `:808`, `:814`, `:822`, `:832`
- `ayarlar/_components/account-settings-section.tsx:200`, `:317`, `:442`
- `siparis/[id]/_components/order-print.ts:71` **(CSS `text-transform`)**

**`src/app/` (other)**
- `company/onboarding/_components/onboarding-client.tsx:601`
- `nasil-calisir/marketing-page.tsx:411`

**`src/components/catalyst/`**
- `avatar.tsx:38`
- `table.tsx:43` (comment at `:38`)

**`src/components/categories/`**
- `category-selector-modal.tsx:219`, `:454`, `:463`

**`src/components/company/`**
- `company-overview.tsx:275`
- `company-action-center.tsx:132`
- `connections-view.tsx:619`, `:650`, `:785`, `:837`, `:890`
- `company-profile-view.tsx:101`, `:118`, `:310`, `:324`
- `approval-detail-panel.tsx:60`, `:132`, `:168`, `:202`
- `permission-table.tsx:133`, `:178`, `:229`
- `visitors-view.tsx:103`
- `profile-editor.tsx:499`, `:794`
- `orders-list.tsx:544`
- `reports/savings-report-view.tsx:203`
- `reports/general-report-view.tsx:284`

**`src/components/company-shell/`**
- `live-toasts.tsx:114`
- `sidebar.tsx:277`
- `premium-gate.tsx:74`, `:109`
- `assistant/assistant-panel.tsx:442`, `:534`

**`src/components/dashboard/`**
- `satinalma-ihale-tab.tsx:303`, `:314`, `:420`
- `action-center.tsx:249`
- `panel-hero-search.tsx:262`

**`src/components/marketplace/`**
- `product-detail.tsx:431`, `:458`
- `facets.tsx:41`
- `listing-card.tsx:283`
- `filter-primitives.tsx:63`
- `listing-detail.tsx:323`
- `hero-search.tsx:151`

**`src/components/tenders/`**
- `logistics-info.tsx:23`, `:157`, `:175`
- `general-info-tab.tsx:78`, `:159`, `:294`
- `wizard/step-1-info.tsx:381`, `:415`, `:1612`
- `wizard/step-3-suppliers.tsx:444`, `:582`
- `wizard/step-0-type-scope.tsx:51`
- `excel-import/excel-import-dialog.tsx:202`

**Other components**
- `src/components/ihale/IhaleItemsPanel.tsx:61`
- `src/components/orders/order-payments-card.tsx:412`
- `src/components/products/import-dialog.tsx:224`
- `src/components/bids/bid-import-dialog.tsx:301`

**No occurrences at all in `src/components/ui/`.**

### `toUpperCase()` in JS — 6 hits, all data normalization, none display-facing

- `src/lib/company/request-filter-params.ts:104` — currency codes from URL
- `src/lib/public/marketplace.ts:85` — regex capture normalization
- `src/app/company/(authed)/ayarlar/dogrulama/page.tsx:59` — country code compare
- `src/app/company/(authed)/ayarlar/dogrulama/page.tsx:96` — IBAN normalization
- `src/app/company/(authed)/ayarlar/dogrulama/page.tsx:112` — IBAN `^TR\d{24}$` test
- `src/hooks/use-company-docs.ts:38` — country code compare

Plus one locale-aware comment at `src/lib/avatar-utils.ts:28` ("İlk 2 kelimenin baş harfleri (TR uppercase locale)").

---

## 6. Primary-black and verified-green class counts

### 6.1 Black button classes — raw totals across `src/`

| Class | Total | Solid (no `/alpha`) | Alpha variants |
|---|---|---|---|
| `bg-zinc-950` | 119 | **78** | 36 (`bg-zinc-950/5` etc.) |
| `bg-zinc-900` | 55 | **55** | 0 |
| `bg-black` | 4 | **0** | 4 (all alpha) |
| `bg-neutral-900` | **0** | 0 | 0 |

The remaining `bg-zinc-950` hits (119 − 78 − 36 = 5) are matches where the token is followed by other characters in class strings.

### 6.2 Top 15 files by SOLID black-button classes (`bg-zinc-950` / `bg-zinc-900` / `bg-black`, no alpha)

| Count | File |
|---|---|
| 13 | `src/app/nasil-calisir/marketing-page.tsx` |
| 5 | `src/components/marketing/marketing-header.tsx` |
| 5 | `src/app/company/(authed)/ayarlar/_components/approval-flows-section.tsx` |
| 4 | `src/components/catalyst/sidebar-layout.tsx` |
| 3 | `src/components/marketplace/two-cards.tsx` |
| 3 | `src/components/marketplace/product-showcase.tsx` |
| 3 | `src/components/company/connections-view.tsx` |
| 3 | `src/components/categories/category-selector-modal.tsx` |
| 2 | `src/components/products/products-view.tsx` |
| 2 | `src/components/products/__tests__/products-view.test.tsx` |
| 2 | `src/components/messaging/company-message-thread.tsx` |
| 2 | `src/components/marketplace/rfq-banner.tsx` |
| 2 | `src/components/marketplace/inquiry-dialog.tsx` |
| 2 | `src/components/marketplace/hero-search.tsx` |
| 2 | `src/components/inquiries/panel-inquiry-dialog.tsx` |

Including alpha variants, the ranking shifts slightly and these also appear high: `src/components/company-shell/topbar.tsx` (4), `src/components/catalyst/navbar.tsx` (4), `src/components/catalyst/button.tsx` (4), `src/app/company/(authed)/ilan/[id]/page.tsx` (4), `src/components/company/profile-editor.tsx` (3). `catalyst/button.tsx` is the canonical primary-button style source.

### 6.3 Verified-green classes

| Class | Total uses |
|---|---|
| `text-emerald-6xx` | 33 |
| `bg-emerald-50` (excluding `-500`) | 52 |

**Top 10 files — combined (`text-emerald-6xx` + `bg-emerald-50`)**

| Count | File |
|---|---|
| 7 | `src/app/nasil-calisir/marketing-page.tsx` |
| 6 | `src/app/company/(authed)/ilan/[id]/page.tsx` |
| 4 | `src/components/ihale/BrowseTenderRow.tsx` |
| 4 | `src/app/company/(authed)/ilan/[id]/teklif-ver/page.tsx` |
| 3 | `src/components/company/visitors-view.tsx` |
| 3 | `src/components/company/connections-view.tsx` |
| 3 | `src/app/company/(authed)/ayarlar/dogrulama/page.tsx` |
| 2 | `src/lib/tenders/seller-state.ts` |
| 2 | `src/lib/public/category-visual.ts` |
| 2 | `src/components/ihale/IhaleListRow.tsx` |

**Top 10 — `text-emerald-6xx` alone**

| Count | File |
|---|---|
| 2 | `src/components/company/visitors-view.tsx` |
| 2 | `src/app/company/(authed)/ilan/[id]/teklif-ver/page.tsx` |
| 2 | `src/app/company/(authed)/ilan/[id]/page.tsx` |
| 2 | `src/app/company/(authed)/ayarlar/dogrulama/page.tsx` |
| 2 | `src/app/company/(authed)/ayarlar/_components/account-settings-section.tsx` |
| 1 | `src/lib/public/category-visual.ts` |
| 1 | `src/components/ui/trend-badge.tsx` |
| 1 | `src/components/products/product-showcase-form.tsx` |
| 1 | `src/components/marketplace/trust-strip.tsx` |
| 1 | `src/components/marketplace/product-detail.tsx` |

**Top 10 — `bg-emerald-50` alone**

| Count | File |
|---|---|
| 7 | `src/app/nasil-calisir/marketing-page.tsx` |
| 4 | `src/app/company/(authed)/ilan/[id]/page.tsx` |
| 3 | `src/components/ihale/BrowseTenderRow.tsx` |
| 2 | `src/lib/tenders/seller-state.ts` |
| 2 | `src/components/ihale/IhaleListRow.tsx` |
| 2 | `src/components/company/connections-view.tsx` |
| 2 | `src/components/bids/bid-import-dialog.tsx` |
| 2 | `src/app/company/(authed)/ilan/[id]/teklif-ver/page.tsx` |
| 2 | `src/app/company/(authed)/ayarlar/_components/approval-flows-section.tsx` |
| 1 | `src/lib/public/category-visual.ts` |

Note that emerald tone decisions also originate in two `lib/` modules, not only components: `src/lib/tenders/seller-state.ts` and `src/lib/public/category-visual.ts`.

---

## 7. Public marketplace layout / header / footer

### 7.1 `src/components/marketplace/public-layout.tsx` — 36 lines, **SERVER component** (no `"use client"`)

Full source:

```tsx
import { MarketingHeader } from "@/components/marketing/marketing-header";   // 1
import { MarketplaceFooter } from "./marketplace-footer";                    // 2
import type { ReactNode } from "react";                                      // 3
                                                                             // 4
/**                                                                          // 5
 * HERKESE AÇIK SAYFA KABUĞU — tek header, tek footer (2026-09-04).          // 6
 * … three separate templates were found in the audit (marketplace,          // 8-10
 *   company profile with its own inline header/footer carrying "e-ihale"    //
 *   text, and /nasil-calisir with a dark pill + inline dark footer);        //
 *   visitors saw three different sites. Every public page now goes through  // 11
 *   here; /hakkimizda and /iletisim too (they previously had NO header or   // 12-13
 *   footer at all — the visitor could not leave the page).                  //
 *                                                                           // 14
 * Header is `fixed`; the PAGE supplies the top padding (hero carries its    // 15-16
 *   own pt-32, plain pages pt-28). The shell DOES NOT READ SESSION —        // 16-17
 *   public routes are static/ISR with nonce-less CSP (see lib/public-routes.ts).
 */
export function PublicLayout({                                               // 19
  children,                                                                  // 20
  tone = "light",                                                            // 21
  className = "bg-white",                                                    // 22
}: {                                                                         // 23
  children: ReactNode;                                                       // 24
  tone?: "light" | "dark";                                                   // 25
  /** Gövde zemini — pazar yeri beyaz, firma profili `bg-zinc-50`. */        // 26
  className?: string;                                                        // 27
}) {                                                                         // 28
  return (                                                                   // 29
    <div className={`min-h-dvh ${className}`}>                               // 30
      <MarketingHeader tone={tone} />                                        // 31
      <main>{children}</main>                                                // 32
      <MarketplaceFooter />                                                  // 33
    </div>                                                                   // 34
  );                                                                         // 35
}                                                                            // 36
```

### 7.2 `src/components/marketing/marketing-header.tsx` — 238 lines, **CLIENT component**

- `"use client"` at line **1**.
- `import { useHeroGone } from "@/hooks/use-hero-gone";` — line 14.
- `export function MarketingHeader({ tone = "light" }: { tone?: "light" | "dark" })` — lines 47-50; `const dark = tone === "dark"` at line 52.
- Comment 56-66 explains the compact search: it shows when the hero's large search box is out of view; `const heroGone = useHeroGone();` at line 66.
- `<header className="fixed inset-x-0 top-0 z-50 px-4">` — line 77; `<nav …>` opens at line 78.
- Logo link `<Link href="/" className="-m-1.5 p-1.5">` — line 93.
- Mobile drawer: backdrop `<div className="fixed inset-0 z-50" />` at line 169; panel `fixed inset-y-0 right-0 z-50 w-full overflow-y-auto p-6 sm:max-w-sm sm:ring-1` at line 171; drawer logo link at line 176.

### 7.3 `src/components/marketplace/marketplace-footer.tsx` — 95 lines, **SERVER component** (no `"use client"`)

- Line 1: `import { RothernLogo } from "@/components/brand/logo";`
- `export function MarketplaceFooter()` — line 49.
- `<footer className="border-t border-zinc-200 bg-zinc-50">` — line 51.

### 7.4 Consumers of `PublicLayout` (12 modules)

Pages:
- `src/app/page.tsx`
- `src/app/alim-talepleri/page.tsx`
- `src/app/urunler/page.tsx`
- `src/app/urunler/kategori/[slug]/page.tsx`
- `src/app/firma/[slug]/page.tsx`
- `src/app/firmalar/page.tsx`
- `src/app/hakkimizda/page.tsx`
- `src/app/iletisim/page.tsx`
- `src/app/nasil-calisir/marketing-page.tsx`
- `src/app/talep-onayla/page.tsx`

Components:
- `src/components/marketplace/listing-detail.tsx`
- `src/components/marketplace/product-detail.tsx`

### 7.5 `src/components/marketplace/` full inventory (42 entries)

`__tests__`, `category-grid.tsx`, `category-image.tsx`, `category-visual-box.tsx`, `coming-soon.tsx`, `company-card.tsx`, `company-grid.tsx`, `company-products.tsx`, `count-up.tsx`, `facets.tsx`, `filter-primitives.tsx`, `filter-shell.tsx`, `floating-cta.tsx`, `gated-field.tsx`, `hero-search.tsx`, `hero.tsx`, `how-it-works-flow.tsx`, `inquiry-button.tsx`, `inquiry-dialog.tsx`, `listing-card.tsx`, `listing-detail.tsx`, `listing-index.tsx`, `listing-page.test.ts`, `listing-page.ts`, `listing-teaser-card.tsx`, `marketplace-footer.tsx`, `pagination.tsx`, `popular-chips.tsx`, `product-card.tsx`, `product-detail.tsx`, `product-filters.tsx`, `product-index.tsx`, `product-showcase.tsx`, `public-empty-state.tsx`, `public-layout.tsx`, `public-list-page.tsx`, `rfq-banner.tsx`, `search-form.tsx`, `stats-strip.tsx`, `trust-band.tsx`, `trust-strip.tsx`, `two-cards.tsx`, `view-beacon.tsx`.

`src/components/marketing/` holds only three files: `auth-shell.tsx`, `legal-doc.tsx`, `marketing-header.tsx`.

Only two files in `src/components/` contain a `<footer` element: `src/components/marketplace/marketplace-footer.tsx` and `src/components/marketplace/coming-soon.tsx`.

---

# Bölüm B — Rotalar, /urunler süzgeci, tipler, anasayfa verisi

# Public marketplace discovery — routes, filters, types, homepage

Read-only survey of `/home/noah/projects/supkeys/apps/web/src`. All paths below are
relative to that directory unless written absolute.

---

## 1. ROUTES

All public pages are **server components** — no `"use client"` in any of them.
No `loading.tsx` or `error.tsx` sits next to any public route. The only special
files in the whole app tree:

- `app/error.tsx`
- `app/not-found.tsx`
- `app/company/(authed)/error.tsx`
- `app/company/(authed)/loading.tsx`

No `export const dynamic` appears in any of the public route files.
`generateStaticParams` exists on exactly one route (the product category page).

| Route | Page file | Rendering directives |
|---|---|---|
| `/` | `app/page.tsx` | `export const revalidate = 60` (:46); static `metadata` const (:64) that swaps to a `robots: {index:false}` "Çok Yakında" object when `MARKETPLACE_LIVE` is false; body returns `<ComingSoon/>` early (:73) |
| `/urunler` | `app/urunler/page.tsx` | `export const revalidate = 300` (:19); static `export const metadata` (:25-35); `notFound()` when not live (:42) |
| `/urunler/kategori/[slug]` | `app/urunler/kategori/[slug]/page.tsx` | param name is **`[slug]`** (value is the code-first slug `<kod>-<ad>`, parsed via `parseCategoryCode`, :53 and :76); `export const revalidate = 600` (:31); `generateStaticParams` (:33-39); `generateMetadata` (:47-65); `permanentRedirect` to canonical path (:88) |
| `/firmalar` | `app/firmalar/page.tsx` | `export const revalidate = 300` (:22); static `export const metadata` (:24-34); `notFound()` when not live (:47) |
| `/alim-talepleri` | `app/alim-talepleri/page.tsx` | `export const revalidate = 60` (:17); static `export const metadata` (:19-29); comment at :14-15 explicitly forbids `force-dynamic` (public route, nonce-less CSP) |
| `/firma/[slug]` | `app/firma/[slug]/page.tsx` | `export const revalidate = 300` (:14); `generateMetadata` (:59-97) |
| `/firma/[slug]/urun/[urunSlug]` | `app/firma/[slug]/urun/[urunSlug]/page.tsx` | second param is **`[urunSlug]`**; `export const revalidate = 300` (:16); `generateMetadata` (:20); **not** gated on `MARKETPLACE_LIVE` — only the `robots` tag is (comment :56-59) |
| `/talep/[slug]` | `app/talep/[slug]/page.tsx` | `export const revalidate = 120` (:11); `generateMetadata` (:13-41) with `robots` derived from `listing.indexable` (:33); `notFound()`/`permanentRedirect` via `resolveListingPage` (:51-53) |
| `/nasil-calisir` | `app/nasil-calisir/page.tsx` | `export const revalidate = 3600` (:11); non-async default export (:20) |

### Category route details (`app/urunler/kategori/[slug]/page.tsx`)

```ts
export const revalidate = 600;                                    // :31

export async function generateStaticParams() {                    // :33
  if (!MARKETPLACE_LIVE) return [];
  const facets = await fetchProductFacets();
  return facets.categories.map((c) => ({
    slug: categoryPath(c.id, c.name).split("/").pop() as string,
  }));
}
```
`resolveCategory` (:42-45) resolves a code against the facet list; unknown or
product-less codes `notFound()` (:82); a non-canonical slug 308s to
`categoryPath(cat.id, cat.name)` (:87-88).

### Redirects touching these routes — `apps/web/next.config.ts`, `redirects()` at :85

All are `permanent: true` (308).

| Source | Destination | Line |
|---|---|---|
| `/tedarikciler/:path*` | `/firmalar/:path*` | :89-93 |
| `/alim-talepleri/:number(rot-\d+)` | `/talep/:number` | :98 |
| `/giris` | `/company/login` | :99 |
| `/kayit` | `/company/kayit` | :100 |
| `/satilik` | `/urunler` | :128 |
| `/ilan/:path*` | `/urunler` | :129 |

Panel-only redirects in the same block (not public marketplace routes):
`/company/satinalma/ihalelerim/:path*` → `taleplerim` (:101-105);
`/company/satis/acik-ihaleler/:path*` → `/company/satis` (:106-110);
`/company/satinalma/sablonlar/ihale/:path*` (:111-115);
`/company/satinalma/profilim` and `/company/satis/profilim` → `/company/sirketim/profil` (:121-122);
`/company/satinalma/raporlar[/:path*]` → `/company/sirketim/raporlar` (:123-124);
`/company/satinalma/urunler` → `/company/satinalma` (:127);
`/company/satis/ilanlarim/:path*` and `/company/satis/sablonlar/:path*` → `/company/satis/urunlerim` (:130-139);
`/company/satinalma/satin-al/:path*` (:140-144);
`/company/satinalma/tekliflerim/:path*` → `/company/satis/tekliflerim` (:145-151);
`/company/satis/acik-talepler/:path*` → `/company/satis` (:152-158);
`/company/satis/raporlar/:path*` → `/company/satinalma/raporlar` (:159-164).

---

## 2. `/urunler` FILTERS

### Composition

`app/urunler/page.tsx:46` renders `ProductIndex`
(`components/marketplace/product-index.tsx:39`, **server**), which wraps
`FilterShell` (:52) around `PublicListPage` (:53).

- **Sidebar filter tree**: `components/marketplace/product-filters.tsx:22`
  `ProductFilters` (**client**, `"use client"` at :1).
- **Shared building blocks**: `components/marketplace/filter-primitives.tsx`
  (**client**) — `SHOW = 6` (:17), `useOpenState` (:19), `Group` (:40),
  plus `Check`, `ShowMore`, `ShowMoreRadio`, `FilterChipBar`, `FilterChip`
  type. Header comment (:6-16) states the same primitives back both the
  product filter and the panel request filter (`company/request-filters.tsx`).
- **State shell**: `components/marketplace/filter-shell.tsx` (**client**) —
  `FilterShellCore<S>` (:46) is state-type agnostic; `FilterShell` (:105) is
  the product-specific wrapper carrying the category-path URL rules.

`ProductIndex` fetch block:

```ts
const state = parseProductFilters(searchParams, category?.id);     // :40
const params = toProductListParams(state);                          // :41
const basePath = MARKETPLACE_ROUTES.products;                       // :42

const [page, facets] = await Promise.all([                          // :44
  fetchProducts(params),
  fetchProductFacets({ category: params.category, q: params.q, city: params.city,
    activity: params.activity, verified: params.verified, price: params.price }),  // :46
]);
```

### How filter changes are applied

`router.replace` inside `startTransition`, `scroll: false`. No `<Link>`-based
filters on `/urunler` (unlike `/alim-talepleri` and `/firmalar`, which are
link-based):

```ts
// filter-shell.tsx:66-79
const router = useRouter();
const [isPending, startTransition] = useTransition();
const [mobileOpen, setMobileOpen] = useState(false);

const navigate = (next: S) => startTransition(() => router.replace(toUrl(next), { scroll: false }));
const update: Ctx<S>["update"] = (patch) => {
  const next = typeof patch === "function" ? patch(state) : { ...state, ...patch };
  // Süzgeç değişince 1. sayfaya dönülür; sayfa YALNIZ açıkça istenince korunur
  const explicitPage = typeof patch === "function" ? next.page !== state.page : "page" in patch;
  navigate(explicitPage ? next : { ...next, page: 1 });
};
const clear = () => navigate(clearState(state));
```

Product-specific URL rule (`filter-shell.tsx:123-130`): on a category *path*
page, the path is kept while the category is unchanged; any category change or
extra filter switches to the query schema on `basePath`.

```ts
const toUrl = (next: ProductFilterState) => {
  const onPathPage = !!fixedCategory && pathname !== basePath;
  const keepPath = onPathPage && next.category === fixedCategory;
  const target = keepPath ? pathname : basePath;
  return `${target}${buildProductFilterQuery(keepPath ? { ...next, category: undefined } : next)}`;
};
```

`clearState` for products (`filter-shell.tsx:136`) keeps `q` and drops
everything else: `(s) => ({ cities: [], activities: [], verified: false, attrs: [], page: 1, q: s.q })`.

Pending feedback:

```tsx
// filter-shell.tsx:147-154 — results dim, stay in place
export function FilterResults({ children }: { children: ReactNode }) {
  const { isPending } = useFilters();
  return (
    <div aria-busy={isPending} className={isPending ? "pointer-events-none opacity-60 transition-opacity" : "transition-opacity"}>
      {children}
    </div>
  );
}

// filter-shell.tsx:157-164 — aria-live count
export function ResultCount({ noun }: { noun: string }) {
  const { total, isPending } = useFilters();
  return (
    <p aria-live="polite" className="text-sm text-zinc-600">
      {isPending ? "Güncelleniyor…" : total > 0 ? `${total.toLocaleString("tr-TR")} ${noun} bulundu` : `${noun} bulunamadı`}
    </p>
  );
}
```

Price/MOQ inputs debounce 400 ms before calling `update`
(`product-filters.tsx:155-162`).

### Mobile filter presentation

Headless UI `Dialog` + `DialogPanel` bottom-sheet drawer,
`components/marketplace/filter-shell.tsx:181-208`:

```tsx
function MobileDrawer({ open, onClose, children }) {
  const { total, clear, isPending } = useFilters();
  return (
    <Dialog open={open} onClose={onClose} className="lg:hidden">
      <div className="fixed inset-0 z-50 bg-zinc-950/40" aria-hidden />
      <DialogPanel className="fixed inset-x-0 bottom-0 z-50 flex max-h-[88vh] flex-col rounded-t-3xl bg-white shadow-2xl">
        ... "Temizle" / "Filtreler" / close ...
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="border-t border-zinc-950/5 px-5 py-3">
          <button type="button" onClick={onClose} className="w-full rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white">
            {isPending ? "Güncelleniyor…" : `Sonuçları göster (${total.toLocaleString("tr-TR")})`}
          </button>
        </div>
      </DialogPanel>
    </Dialog>
  );
}
```

Trigger (`filter-shell.tsx:167-179`):

```tsx
export function MobileFilterButton() {
  const { activeCount, openMobile } = useFilters();
  return (
    <button type="button" onClick={openMobile}
      className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm font-semibold text-zinc-900 lg:hidden">
      <AdjustmentsHorizontalIcon aria-hidden className="size-4" />
      Filtrele{activeCount > 0 ? ` (${activeCount})` : ""}
    </button>
  );
}
```

Two instances of the filter tree exist: drawer copy
`drawer={<ProductFilters facets={facets} idPrefix="m" />}` (`product-index.tsx:52`)
and desktop copy `sidebar={<ProductFilters facets={facets} idPrefix="d" />}` (:79).
Imports at `filter-shell.tsx:3-4`: `@headlessui/react` `Dialog`, `DialogPanel`;
`@heroicons/react/20/solid` `AdjustmentsHorizontalIcon`, `XMarkIcon`.

### searchParams parsing — `lib/public/product-filter-params.ts` (single source)

Documented schema (:10-12):

```
?q=&kategori=42000000&sehir=İstanbul,İzmir&faaliyet=MANUFACTURER,DISTRIBUTOR
&dogrulanmis=1&fiyat=var|teklif&fiyatMin=&fiyatMax=&moqMax=&sirala=yeni|fiyat|fiyat-azalan
&nitelik=anahtar:değer (tekrarlanır)&sayfa=2
```

Exported state type (:18-31):

```ts
export interface ProductFilterState {
  q?: string;
  category?: string;
  cities: string[];
  activities: string[];
  verified: boolean;
  price?: "var" | "teklif";
  priceMin?: number;
  priceMax?: number;
  moqMax?: number;
  sort?: "yeni" | "fiyat" | "fiyat-azalan";
  attrs: string[];
  page: number;
}

export type SearchParamsLike = Record<string, string | string[] | undefined> | URLSearchParams;  // :33
```

Parser (:52-71) — accepts both a plain object and `URLSearchParams`:

```ts
export function parseProductFilters(sp: SearchParamsLike, fixedCategory?: string): ProductFilterState {
  const cat = fixedCategory ?? get(sp, "kategori");
  const sort = get(sp, "sirala");
  const price = get(sp, "fiyat");
  const page = num(get(sp, "sayfa"));
  return {
    q: get(sp, "q")?.trim() || undefined,
    category: cat && /^\d{8}$/.test(cat) ? cat : undefined,
    cities: list(get(sp, "sehir") ?? get(sp, "il")),
    activities: list(get(sp, "faaliyet")).filter(isCompanyActivity),
    verified: get(sp, "dogrulanmis") === "1",
    price: price === "var" || price === "teklif" ? price : undefined,
    priceMin: num(get(sp, "fiyatMin")),
    priceMax: num(get(sp, "fiyatMax")),
    moqMax: num(get(sp, "moqMax")),
    sort: sort === "yeni" || sort === "fiyat" || sort === "fiyat-azalan" ? sort : undefined,
    attrs: getAll(sp, "nitelik").filter((a) => a.includes(":")).slice(0, 6),
    page: page && page > 1 ? page : 1,
  };
}
```

Helpers: `num` (:45-49) truncates to a non-negative integer; `list` (:50) splits
on commas, trims, drops empties, `.slice(0, 10)`.

State → API params (:74-89), i.e. the Turkish→English boundary:

```ts
export function toProductListParams(f: ProductFilterState): ProductListParams & { page?: number } {
  return {
    q: f.q,
    category: f.category,
    city: f.cities.length ? f.cities.join(",") : undefined,
    activity: f.activities.length ? f.activities.join(",") : undefined,
    verified: f.verified || undefined,
    price: f.price === "var" ? "has" : f.price === "teklif" ? "request" : undefined,
    priceMin: f.priceMin,
    priceMax: f.priceMax,
    moqMax: f.moqMax,
    sort: f.sort === "yeni" ? "newest" : f.sort === "fiyat" ? "price" : f.sort === "fiyat-azalan" ? "price_desc" : undefined,
    attr: f.attrs.length ? f.attrs : undefined,
    page: f.page > 1 ? f.page : undefined,
  };
}
```

State → URL (:92-108) writes `q`, `kategori`, `sehir`, `faaliyet`,
`dogrulanmis=1`, `fiyat`, `fiyatMin`, `fiyatMax`, `moqMax`, `sirala`, repeated
`nitelik`, `sayfa`; page 1 and empty fields are omitted.

Active-count (:111-116) excludes search, sort and page:

```ts
export function activeFilterCount(f: ProductFilterState): number {
  return (
    (f.category ? 1 : 0) + f.cities.length + f.activities.length + (f.verified ? 1 : 0) + (f.price ? 1 : 0) +
    (f.priceMin != null || f.priceMax != null ? 1 : 0) + (f.moqMax != null ? 1 : 0) + f.attrs.length
  );
}

export const EMPTY_FILTERS: ProductFilterState = { cities: [], activities: [], verified: false, attrs: [], page: 1 };  // :118
```

**Sort values**: URL `sirala` accepts `yeni | fiyat | fiyat-azalan`; API `sort`
accepts `relevance | newest | price | price_desc` (`marketplace-api.ts:465`).
`SortControl` (`product-filters.tsx:203-245`) renders chips on `sm+` —
"Uygunluk" (undefined), "En yeni", and a "Fiyat" chip that toggles
asc↔desc with an ↑/↓ arrow — and a `<select>` below `sm` with four options
(`""`, `yeni`, `fiyat`, `fiyat-azalan`).

### Filter groups rendered (`product-filters.tsx:22-80`)

Order: Kategori (`CategoryGroup`, :87) → "Firma profili" (single `Doğrulanmış`
check, :28-36) → "Faaliyet tipi" (:38-50) → "Şehir" (:52-59) → "Fiyat"
(`PriceGroup`, :139) → one `Group` per attribute facet (:63-78).
Each group is a `<fieldset><legend>` with a selected count and a "Temizle"
link, collapsible with state in `localStorage` under
`rothern.filters.<key>` (`filter-primitives.tsx:19-38`). Long lists show the
first 6 then "Tümünü göster (n)". The category group grows a search box when
`facets.categories.length > SHOW` (:106-123). Selecting a category clears
`attrs` (:105, :125, :131) since attributes are category-scoped.

Active chips (`ActiveFilterChips`, :188-200) cover category, each city, each
activity, verified, price mode, price range, MOQ cap and each attribute, and
render through `FilterChipBar` with `onClearAll={clear}`.

### Pagination

Yes — `components/marketplace/pagination.tsx:7`, **link-based** (`<Link>` with
`rel="prev"`/`rel="next"`, comment :3-6 says a bot only follows `<a href>`),
param `sayfa` (:31), hidden when `lastPage <= 1` (:24).

```ts
export function Pagination({ page, total, pageSize, basePath, params, repeated }: {
  page: number; total: number; pageSize: number; basePath: string;
  params: Record<string, string | undefined>;
  repeated?: Record<string, string[]>;
})
```

Wired at `product-index.tsx:112-124` with
`basePath={category ? `/urunler/kategori/${category.id}` : basePath}` and
`repeated={{ nitelik: state.attrs }}`.

### Empty state

`components/marketplace/public-empty-state.tsx:11` `PublicEmptyState` — the one
empty state for every public list (comment :3-10).

```tsx
export function PublicEmptyState({ noun, clearHref, extra }: {
  noun: string;                          // "Ürün", "Alım talebi", "Firma"
  clearHref?: string;                    // "Filtreleri temizle" only when filters are on
  extra?: { label: string; href: string };
})
```
Text: `{noun} bulunamadı.` (:25); buttons "Filtreleri temizle" (:41) and
"Kategorilere göz at" → `/#kategoriler` (:44).
`/urunler` passes `noun="Bu kriterlerle ürün"`,
`clearHref={hasFilter || category ? basePath : undefined}` and
`extra={{ label: "Talep aç — tedarikçiler teklif versin", href: talepHref }}`
(`product-index.tsx:92-96`); `talepHref` is
`signupHref("talep", state.q ? `/company/satinalma/taleplerim/yeni?q=…` : undefined)` (:49).

### Sticky aside + max-height

`components/marketplace/public-list-page.tsx:105-108`:

```tsx
<aside
  aria-label="Süzgeçler"
  className={`${chipsNode ? "hidden lg:block" : ""} lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-2 [scrollbar-width:thin]`}
>
  {sidebar}
</aside>
```

Layout grid (:102): `mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[16rem_1fr]`.
Comment :103-104 records that the sidebar used to stick at a fixed ~1450 px and
hide its lower groups. When `chipsNode` is supplied (the product index case) the
aside is `hidden lg:block`, since mobile has the drawer.

Results grid `ResultGrid` (:124-146): `sm:grid-cols-2 xl:grid-cols-3` at ≥3
items, `sm:grid-cols-2` at 2, `sm:max-w-sm` at 1 (:134-135); an `sr-only` `h2`
keeps heading order intact (:138-142).

Summary row (`product-index.tsx:80-88`) holds `MobileFilterButton`,
`ResultCount noun="ürün"` and `SortControl`; `public-list-page.tsx:112-114`
notes the wrapper had to be a `<div>` because `<p aria-live>` + `<div>` inside a
`<p>` produced React #418.

### Facet counts — contextual

Yes. `fetchProductFacets` is called with the current category, q, city,
activity, verified and price (`product-index.tsx:46`), and
`marketplace-api.ts:514` documents it: "Facet sayaçları BAĞLAMA DUYARLI: diğer
seçimler de gönderilir." Note the attribute selections (`attr`) are **not**
forwarded to the facet endpoint (:515-522). Zero-count options render dimmed and
disabled unless already selected (`product-filters.tsx:14-17` comment;
implemented in `Check`).

### Product fetch signatures — `lib/public/marketplace-api.ts`

```ts
export function fetchProducts(
  params: ProductListParams = {},
): Promise<ProductIndexPage>                                        // :491 → GET /public/products      (revalidate 300)

export function fetchProductFacets(
  params: Pick<ProductListParams, "category" | "q" | "city" | "activity" | "verified" | "price"> = {},
): Promise<ProductFacets>                                           // :515 → GET /public/products/facets (revalidate 300)

export function fetchCompanyProducts(
  companySlug: string,
  params: { q?: string; categoryId?: string; page?: number } = {},
): Promise<PublicProductPage>                                       // :527 → GET /public/companies/:slug/products (300)

export function fetchFeaturedProducts(): Promise<ProductIndexCard[]>            // :327 → GET /public/products/featured (300)

export function fetchRelatedProducts(
  companySlug: string, productSlug: string,
): Promise<RelatedProducts>                                         // :331 → GET /public/companies/:s/products/:p/related (300)

export async function fetchProduct(
  companySlug: string,
  productSlug: string,
): Promise<{ product: PublicProduct; company: PublicProductCompany } | null>   // :572 → GET /public/companies/:s/products/:p (300)

export function fetchProductSitemap(): Promise<ProductSitemapRow[]>            // :600 → GET /public/companies/products/sitemap (900)
```

Listing / company / misc fetchers in the same file:

```ts
export function fetchListings(params: ListParams = {}): Promise<PublicListPage>          // :172 → GET /public/listings (60)
export async function fetchListing(number: string): Promise<PublicListingDetail | null>  // :181 → GET /public/listings/:number (120)
export function fetchFacets(): Promise<PublicFacets>                                     // :207 → GET /public/listings/facets (300)
export function fetchListingSitemap(): Promise<PublicSitemapRow[]>                       // :211 → GET /public/listings/sitemap (900)
export function fetchPublicDirectory(params: PublicDirectoryParams = {}): Promise<PublicDirectoryResult>  // :406 → GET /public/companies/directory (300)
export function fetchPublicDirectoryFacets(): Promise<PublicDirectoryFacets>             // :423 → GET /public/companies/directory/facets (600)
export function fetchStats(): Promise<PublicStats>                                       // :352 → GET /public/stats (600)
export function fetchSegments(): Promise<CategorySegment[]>                              // :550 → GET /categories/segments (3600)
export function fetchDirectorySummary(): Promise<DirectorySummary>                       // :560 → GET /public/companies/summary (600)
```

`ProductListParams` (:457-472):

```ts
export interface ProductListParams {
  q?: string;
  category?: string;
  city?: string;
  /** `anahtar:değer` çiftleri — uçta tekrarlanan `attr` parametresine döner. */
  attr?: string[];
  /** Satıcının faaliyet tipi kodu — virgüllü çoklu. */
  activity?: string;
  sort?: "relevance" | "newest" | "price" | "price_desc";
  verified?: boolean;
  price?: "has" | "request";
  priceMin?: number;
  priceMax?: number;
  moqMax?: number;
  page?: number;
}
```

`ListParams` (:145-156):

```ts
export interface ListParams {
  type?: PublicListingType;
  q?: string;
  category?: string;
  city?: string;
  state?: "open" | "all";
  /** Yurtiçi / uluslararası — `isInternational`. */
  scope?: "domestic" | "international";
  /** 7 ya da 30 gün içinde kapanacaklar. */
  closesWithin?: "7" | "30";
  page?: number;
}
```

Transport (:113-136): a single `getJson<T>(path, fallback, revalidate = 60)`
using `fetch(`${base}${path}`, { next: { revalidate }, headers: { accept: "application/json" } })`.
No cookies are sent (header comment :4-15 explains: a cookie-bearing response
would be user-specific and must not enter a shared ISR cache). Non-OK and thrown
errors return the fallback and log to the server console. Base URL from
`lib/resolve-api-url.ts:15` `resolveApiBaseUrl()` — `NEXT_PUBLIC_API_URL`, empty
string in production when unset, `http://localhost:4000/api` in dev.

### Other public list surfaces, for contrast

- `/alim-talepleri` → `components/marketplace/listing-index.tsx:69` `ListingIndex`
  (server). Its params are a **separate** Turkish schema
  `MarketplaceSearchParams` (:26-36: `q, kategori, il, sayfa, durum, kapsam, sure`)
  mapped by `toListParams` (:45-60). Filters are plain `<Link>` hrefs built by
  `filterHref`/`toggle` (:86-102) through `FacetGroup`; no client shell, no
  drawer, facets are global (`fetchFacets()` takes no params).
- `/firmalar` → `app/firmalar/page.tsx:46`, local `SP` interface (:36-44:
  `q, il, kategori, faaliyet, dogrulanmis, urunlu, sayfa`), link-based
  `FacetGroup` filters (:103-133), `fetchPublicDirectoryFacets()` with **no**
  params, so its counts are **not** contextual.

---

## 3. TYPES

### Product types — `lib/public/marketplace-api.ts`

```ts
export interface PriceTier {            // :224
  minQty: number;
  unitPrice: number;
}

/** Fiyat alanları — v2'de herkese açık uç da döndürür. */
export interface ProductPriceFields {   // :230
  priceAmount: string | null;
  priceTiers: PriceTier[] | null;
  priceCurrency: string;
  moq: string | null;
}

/** Herkese açık ürün kartı — FİYATLI (görünürlük v2, Europages kalıbı). */
export interface PublicProductCard extends ProductPriceFields {   // :238
  slug: string;
  name: string;
  images: string[];
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  unit: string;
  categoryId: string | null;
  excerpt: string | null;
}

export interface PublicProduct extends Omit<PublicProductCard, "excerpt"> {   // :248
  description: string | null;
  specification: string | null;
  brand: string | null;
  mpn: string | null;
  unitCode: string | null;
  videoUrl: string | null;
  externalUrl: string | null;
  documents: { url: string; title: string }[] | null;
  keywords: string[];
  attributes: Record<string, string | string[]> | null;
  /**
   * Gösterim için ETİKETLENMİŞ nitelikler — ham `attributes` anahtarları
   * ziyaretçiye gösterilmez ("koruma_sinifi" değil "Koruma sınıfı (IP)").
   * Kategori tanımı bulunamayan anahtar bu listede YOKTUR.
   */
  attributeList: { key: string; label: string; value: string; unit: string | null }[];
  /** Kırıntı için kategori adı. */
  category?: { id: string; name: string } | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface PublicProductCompany {   // :271
  name: string;
  slug: string | null;
  city: string | null;
  country: string | null;
  logoUrl: string | null;
  industry: string | null;
  activities: string[];
  verified?: boolean;
  /** Ücretsiz üye satıcı — "yanıtlayamayabilir" notu (2026-09-06). */
  freeMember?: boolean;
}

export interface PublicProductPage {      // :284
  items: PublicProductCard[];
  total: number;
  page: number;
  pageSize: number;
}

/** Dizin kartı firma REFERANSI taşır — firma altı `PublicProductCard` taşımaz. */
export interface ProductIndexCard extends PublicProductCard {   // :307
  /** Panel Ürün Ara (uygunluk sırası): alıcının ALIM kategorisiyle örtüşüyor. */
  matchesProfile?: boolean;
  company: {
    name: string;
    slug: string;
    city: string | null;
    country: string | null;
    activities: string[];
    verified: boolean;
  };
}

export interface RelatedProducts {        // :320
  fromCompany: { items: ProductIndexCard[]; total: number };
  similar: ProductIndexCard[];
  /** Görüntülenme verisi yok — "kategoride yeni" (dürüst etiket). */
  popular: ProductIndexCard[];
}

export interface ProductIndexPage {       // :431
  items: ProductIndexCard[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ProductAttributeFacet {  // :438
  key: string;
  nameTr: string;
  unit: string | null;
  values: { value: string; count: number }[];
}

export interface ProductFacets {          // :445
  categories: { id: string; name: string; level: number; count: number }[];
  cities: { city: string; count: number }[];
  activities: { activity: string; count: number }[];
  /** v3: bağlama duyarlı sayaçlar. */
  verified: number;
  price: { has: number; request: number };
  /** YALNIZ kategori seçiliyken dolu — nitelikler kategoriye özgü. */
  attributes: ProductAttributeFacet[];
  truncated: boolean;
}

export interface ProductSitemapRow { companySlug: string; slug: string; updatedAt: string }  // :594
```

Card component prop types — `components/marketplace/product-card.tsx` (client):

```ts
export type ProductCardProduct = Pick<               // :31
  PublicProductCard,
  "slug" | "name" | "images" | "categoryId" | "unit" | "priceMode"
> &
  Partial<Pick<PublicProductCard, "excerpt"> & ProductPriceFields>;

export interface ProductCardCompany {                // :37
  name: string;
  city?: string | null;
  /** KYC doğrulaması tamam — "Doğrulanmış" rozeti. */
  verified?: boolean;
  /** Faaliyet tipi kodları (CompanyActivity) — ilk ikisi gösterilir. */
  activities?: string[];
}
```
`ProductCard` props (:46-88) also take `companySlug`, legacy `companyName`/
`companyCity`, `href`, `variant?: "tile" | "row"`, `features?: string[]`,
`cta`, `badge`, `meta`, `trailing`, `onClick`, `priority`, `className`.
Default target is `/firma/${companySlug}/urun/${product.slug}` (:89).

Detail body props — `components/marketplace/product-detail.tsx:244-265`:

```ts
export function ProductDetailBody({ product, company, companyHref, cta, priceBox, sellerSite }: {
  /** Panel fiyatlı (üye katmanı), public fiyatsız — ikisi de aynı gövde. */
  product: PublicProduct & Partial<ProductPriceFields>;
  company: PublicProductCompany;
  /** Satıcı kartındaki bağlantı — public profil ya da panel firma sayfası. */
  companyHref: string;
  cta: React.ReactNode;
  /** Fiyat kutusunun YERİNE basılacak içerik (herkese açık sayfada `GatedField`). */
  priceBox?: React.ReactNode;
  /** "Firmanın web sitesi" satırı — public sayfada kapılı, panelde gerçek bağlantı. */
  sellerSite?: React.ReactNode;
})
```
Attribute rendering uses `product.attributeList ?? []` (:274).

### Company types

Directory card / result / facets / params — `lib/public/marketplace-api.ts`:

```ts
/** Herkese açık dizin kartı (v2) — kimlik yok (Rothern ID/iletişim üyeye). */
export interface PublicDirectoryCard {   // :367
  name: string;
  slug: string;
  city: string | null;
  country: string | null;
  industry: string | null;
  activities: string[];
  logoUrl: string | null;
  verified: boolean;
  mainCategory: { id: string; name: string } | null;
  productCount: number;
  productPreview: { slug: string; name: string; image: string | null }[];
}

export interface PublicDirectoryResult { items: PublicDirectoryCard[]; total: number; page: number; pageSize: number }  // :381

export interface PublicDirectoryFacets {  // :388
  total: number;
  verified: number;
  withProducts: number;
  cities: { city: string; count: number }[];
  activities: { activity: string; count: number }[];
}

export interface PublicDirectoryParams {  // :396
  q?: string; city?: string; category?: string; activity?: string;
  verified?: boolean; hasProducts?: boolean; page?: number;
}

/** Anonim dizin özeti — sayı + kategori dağılımı, kimlik yok. */
export interface DirectorySummary {       // :555
  verifiedCompanies: number;
  topCategories: { id: string; name: string; count: number }[];
}
```

`CompanyCard` props — `components/marketplace/company-card.tsx:13-23`
(`company: PublicDirectoryCard`, optional `href`, optional `badge`), default
link `/firma/${c.slug}` (:27), shows first two activities (:24).

Public profile fetch type is declared **locally on the page**, not in the api
module — `app/firma/[slug]/page.tsx:21-42`:

```ts
/**
 * HERKESE AÇIK PROFİL v2 (2026-09-04): tamamen gezilebilir — Hakkında,
 * hizmet, sertifika, kuruluş, çalışan, ortalama puan. Rothern ID, iletişim,
 * puan dağılımı, sipariş sayıları, talep/ilan listesi ÜYEYE (API döndürmez).
 */
interface PublicProfile {
  name: string;
  goldMember?: boolean;
  verified?: boolean;
  slug: string | null;
  industry: string | null;
  activities?: string[];
  categories: { id: string; name: string }[];
  city: string | null;
  country: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  photos: string[];
  aboutText: string | null;
  services: string[];
  certifications: string[];
  certificateImages: string[];
  foundedYear: number | null;
  employeeCount: string | null;
  ratingAvg: number | null;
  productCount: number;
}

async function fetchProfile(slug: string): Promise<PublicProfile | null>   // :44 → GET /public/companies/:slug (revalidate 300)
```

The shared render type used by both public and panel profile pages —
`components/company/company-profile-view.tsx:36-88`:

```ts
export interface ProfileViewData {
  name: string;
  /** Faz T: "Gold Üye" rozeti — yalnız GOLD kademe (güven iddiası taşımaz). */
  goldMember?: boolean;
  /** KYC doğrulaması tamam — "Doğrulanmış" rozeti. */
  verified?: boolean;
  rothernId?: string | null;
  industry: string | null;
  /** Faaliyet tipi kodları (üretici/bayi/hizmet/dış ticaret/fason). */
  activities?: string[];
  /** Firma kategori beyanı (L1 ad) — herkese açık profilde çip olarak. */
  categories?: { id: string; name: string }[];
  city: string | null;
  country: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  aboutText: string | null;
  /**
   * Aşağıdakiler OPSİYONEL: herkese açık sayfa (anonim katman) bu alanları
   * HİÇ vermez — `null` bile yazılsa RSC yüküne anahtar adı düşer ve "gizli
   * alan HTML'de yok" sözleşmesi grep'te kırılır (2026-09-04).
   */
  services?: string[];
  certifications?: string[];
  certificateImages?: string[];
  photos?: string[];
  foundedYear?: number | null;
  employeeCount?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  instagramUrl?: string | null;
  rating?: { avg: number; count: number } | null;
  /** Herkese açık profil (v2): yalnız ortalama, sayı ve dağılım üyeye. */
  ratingAvg?: number | null;
  /** 2026-08-22 — firma bazında gruplu değerlendirme özeti (shared ReviewSummary). */
  reviewSummary?: ReviewSummary | null;
  /** Kamuya açık ticari sicil bilgileri (tüzel kişi verisi). */
  trade?: {
    legalName: string | null;
    taxNumber: string | null;
    taxOffice: string | null;
    mersisNo: string | null;
    tradeRegistryNo: string | null;
    kepAddress: string | null;
  } | null;
}
```
Related slot interfaces in the same file: `ProfileEditSlots` (:133),
`ProfileGateSlots` (:166); the view component takes `profile: ProfileViewData` (:183).

### Listing / request types — `lib/public/marketplace-api.ts`

```ts
/**
 * İlan sahibinin ANONİM tarifi — ad/slug/logo YOK. Backend bu alanları zaten
 * DÖNDÜRMÜYOR (`PUBLIC_LISTING_SELECT`), tip de onu yansıtıyor.
 */
export interface PublicCompanyRef {      // :26
  city: string | null;
  country: string | null;
  industry: string | null;
  activities: string[];
  /** KYC tamam — "Doğrulanmış alıcı/tedarikçi" (kimlik değil nitelik). */
  verified: boolean;
}

export interface PublicCategoryRef { id: string; name: string; level: number }   // :35

export interface PublicListingCard {     // :41
  number: string;
  type: PublicListingType;
  title: string;
  status: string;
  /**
   * Kart/OG görseli. Sahibi seçmediyse ilk kalemin ilk görselinden TÜRETİLİR
   * (backend); o da yoksa `null` ve kategori görseline düşülür.
   */
  coverImageUrl: string | null;
  closesAt: string | null;
  publishedAt: string | null;
  primaryCurrency: string;
  isInternational: boolean;
  itemCount: number;
  /** Kapsam özeti — sayı + (aynı birimde) toplam miktar. Ad yok. */
  itemSummary: { count: number; totalQuantity: string | null; unit: string | null };
  excerpt: string | null;
  company: PublicCompanyRef;
  categories: PublicCategoryRef[];
}

export interface PublicListingDetail extends Omit<PublicListingCard, "excerpt"> {   // :63
  description: string | null;
  format: string | null;
  allowedCurrencies: string[];
  targetCountries: string[];
  categoryIds: string[];
  keywords: string[];
  requireAllItems: boolean;
  requireBidDocument: boolean;
  requireGuaranteeLetter: boolean;
  isSealedBid: boolean;
  isLogistics: boolean;
  deliveryTerm: string | null;
  paymentCategory: string;
  paymentTiming: string;
  advancePercent: number | null;
  paymentDays: number | null;
  lcType: string | null;
  lcConfirmed: boolean;
  updatedAt: string;
  indexable: boolean;
  /** Satırlar: sıra + miktar + birim — AD ÜYEYE (görünürlük v2). */
  items: { lineNo: number; quantity: string; unit: string }[];
}

export interface PublicListPage { items: PublicListingCard[]; total: number; page: number; pageSize: number }  // :88

export interface PublicFacets {          // :95
  categories: (PublicCategoryRef & { count: number })[];
  cities: { city: string; count: number }[];
  types: { type: string; count: number }[];
  scopes: { scope: "domestic" | "international"; count: number }[];
  truncated: boolean;
}

export interface PublicSitemapRow { number: string; title: string; type: PublicListingType; updatedAt: string }  // :103

export interface PublicStats {           // :339
  products: number;
  companies: number;
  categories: number;
  openDemands: number;
  /** Hareket metrikleri (v3). */
  productsThisWeek: number;
  bidsLast24h: number;
  verifiedCompanies: number;
  /** Ürün sayısı en yüksek 20 alt kategori (arama logu yok). */
  popularCategories: { id: string; name: string; count: number }[];
}

export interface SuggestResult {         // :360
  products: { name: string; slug: string; companySlug: string }[];
  categories: { id: string; name: string; level: number }[];
  companies: { name: string; slug: string; city: string | null }[];
}

export interface CategorySegment { id: string; nameTr: string; childCount?: number }  // :544
```

`PublicListingType` is `"ALIM"` only — `lib/public/marketplace.ts:57`.
Routes/labels in the same file:

```ts
export const MARKETPLACE_ROUTES = {   // :33
  demands: "/alim-talepleri",         // ALIM ilanları listesi
  products: "/urunler",               // firmalar-arası ÜRÜN dizini
  companies: "/firmalar",             // firma dizini — HERKESE AÇIK
  demand: "/talep",                   // tekil ALIM talebi
} as const;

export const MARKETPLACE_LABELS = {   // :44
  demands: "Alım Talepleri",
  products: "Ürünler",
  companies: "Firmalar",
  demandOne: "Alım talebi",
} as const;
```

Panel-side normalized card type — `components/marketplace/listing-card.tsx:62-90`:

```ts
export interface ListingCardData {
  id: string;
  href: string;
  number: string | null;
  title: string;
  /** "ilan" = kapak taşıyabilen kayıt (tarihsel), "talep" = asla görsel. */
  kind: "ilan" | "talep";
  coverImageUrl?: string | null;
  categoryIds: string[];
  status: { label: string; className: string };
  /** Sol kenar rengi (row). */
  strip?: string;
  /** Başlık altı rozetler (davet, eşleşme, bağlantı, paket…). */
  chips?: ReactNode;
  /** Tile: firma · şehir · kalem sayısı satırı. */
  subtitle?: string | null;
  /** Sabit sütunlar — sırayla. */
  facts: { label: string; value: ReactNode }[];
  /** Sağ alt metrik (Teklifler / Teklifim). */
  metric?: { label: string; value: ReactNode } | null;
  /** Sağ alt eylem bağlantısı ("Teklif ver"). */
  action?: { label: string; href: string } | null;
  /** Durumun yanında zaman notu. */
  timeNote?: string | null;
  /** Row: soldaki küçük kontrol (favori yıldızı). */
  leading?: ReactNode;
  /** Row: "Kalemler" açılır paneli. */
  expandable?: { id: string; render: () => ReactNode } | null;
}
```
`ListingCard` props (:95-107) accept either `listing?: PublicListingCard`
(public marketplace) or `data?: ListingCardData` (panel), plus
`variant?: "tile" | "row"`, `dense`, `imageMode`, `className`.
`ListingTeaserCard` (`listing-teaser-card.tsx:30`) takes
`{ listing: PublicListingCard }`; it prints the big quantity only when both
`itemSummary.totalQuantity` and `unit` exist (:37), and tones "N gün kaldı"
rose ≤3 / amber ≤7 (:24-28).

### Visibility / locked fields — `lib/public/visibility.ts`

```ts
export type Viewer = "anon" | "member" | "connected" | "premium";     // :14
const RANK: Record<Viewer, number> = { anon: 0, member: 1, connected: 2, premium: 3 };  // :16

/** Alanı görmek için gereken EN DÜŞÜK katman; `never` = herkese açık yüzeyde asla. */
export const VISIBILITY = {                                          // :19
  product: {
    gallery: "anon", name: "anon", category: "anon",
    price: "anon",          // fiyat / aralık / "teklif isteyin"
    moq: "anon", features: "anon", attributes: "anon", description: "anon",
    documents: "anon",      // ad + boyut; indirme üyeye
    documentDownload: "member",
    companyIdentity: "anon",// ad + logo + Doğrulanmış + faaliyet + şehir
    moreFromCompany: "anon", similar: "anon",
    inquiry: "member",      // "Bilgi iste" formu
    companyWebsite: "member",
  },
  company: {
    identity: "anon", about: "anon", services: "anon", certifications: "anon",
    gallery: "anon", products: "anon", foundedYear: "anon", employeeCount: "anon",
    ratingAvg: "anon",
    rothernId: "member", contact: "member", ratingDistribution: "member",
    orderCounts: "member", reviewTexts: "member", listings: "member",
  },
  directory: {
    list: "anon",           // koşul: publicEnabled ∧ (≥1 ürün ∨ tamlık ≥ %60)
    rothernId: "member", contact: "member",
  },
  listing: {
    title: "anon", category: "anon", scope: "anon",
    itemSummary: "anon",    // "2 kalem · 1.200 adet"
    itemQuantities: "anon", // "Kalem 1 · 500 adet" — ad yok
    buyerCity: "anon", buyerActivity: "anon", verifiedBadge: "anon",
    closesAt: "anon", format: "anon",
    buyerName: "member", itemNames: "member", specification: "member",
    files: "member",
    targetPrice: "never",
    bid: "member",          // ayrıca SILVER+/KYC panel kapıları
    buyerOtherListings: "member",
  },
} as const;

export type Entity = keyof typeof VISIBILITY;                        // :80
export type FieldOf<E extends Entity> = keyof (typeof VISIBILITY)[E];// :81
export function canSee<E extends Entity>(viewer: Viewer, entity: E, field: FieldOf<E>): boolean  // :83
export function safeRedirect(redirect?: string | null): string | null   // :90
export function loginHref(redirect?: string): string                    // :95  → /company/login?next=
export function signupHref(intent?: string, redirect?: string): string  // :101 → /company/kayit?intent=&redirect=

/** Panel karşılıkları — GatedField hedefleri buradan. */
export const PANEL_TARGET = {                                        // :111
  product: (companySlug: string, productSlug: string) => `/company/satinalma/urunler/${companySlug}/${productSlug}`,
  company: (companySlug: string) => `/company/firma/${companySlug}`,
  listing: (number: string) => `/company/satis?q=${encodeURIComponent(number)}#acik-talepler`,
  directory: "/company/satinalma/tedarikcilerim",
} as const;
```
Header comment (:6-12): public pages are static/ISR and session-blind, so
`viewer` is always `anon` there; hidden fields are never written into the HTML
at all (the API projection omits them — even `null` would leak the key name into
the RSC payload).

---

## 4. HOMEPAGE DATA

`app/page.tsx` is a server component with `revalidate = 60` (:46). All server
data is fetched in one `Promise.all` (:76-85) and passed down as props; no child
component fetches on the server.

```ts
const [featured, newest, priced, productFacets, segments, demands, directory, stats] = await Promise.all([
  fetchFeaturedProducts(),                              // GET /public/products/featured
  fetchProducts({ sort: "newest", page: 1 }),           // GET /public/products?sort=newest
  fetchProducts({ price: "has", sort: "price", page: 1 }),
  fetchProductFacets(),                                 // GET /public/products/facets (no filters)
  fetchSegments(),                                      // GET /categories/segments
  fetchListings({ type: "ALIM", page: 1 }),             // GET /public/listings?type=ALIM
  fetchPublicDirectory({ hasProducts: true }),          // GET /public/companies/directory?hasProducts=1
  fetchStats(),                                         // GET /public/stats
]);
```

Derived values:
- `showcase = buildShowcase({ segments, counts: productFacets.categories, productCovers: [...featured, ...newest.items], limit: 12 })` (:87-92), from `lib/public/category-showcase.ts`.
- `featuredKeys` / `newestOnly` dedupe the "Yeni" tab against "Öne çıkan" (:96-97).
- `demandCards` = `demands.items` sorted by `closesAt` ascending, `.slice(0, 6)` (:113-115).
- `MIN_DEMANDS = 3` (:49); `SITE = resolveSiteUrl()` (:48).

Render order (:117-193):

| # | Component | File | Data / props |
|---|---|---|---|
| 1 | `PublicLayout` | `components/marketplace/public-layout.tsx` (server) | wraps everything: shared header + footer |
| 2 | JSON-LD `<script>` | inline `app/page.tsx:99-119` | `WebSite` + `SearchAction` pointing at `${MARKETPLACE_ROUTES.products}?q=` |
| 3 | `MarketplaceHero` | `components/marketplace/hero.tsx:16` (server) | `popular={stats.popularCategories}`; two search tabs (Ürünler → `/urunler`, Firmalar → `/firmalar`), sentinel `data-hero-search` at :55 |
| 3a | `HeroSearch` | `components/marketplace/hero-search.tsx` (**client**) | fetches its own suggestions: `${base}/public/suggest?q=…` at :46 |
| 4 | `StatsStrip` | `components/marketplace/stats-strip.tsx:14` (server) | `stats`; returns `null` under `STATS_MIN = { products: 50, companies: 20 }` (:12-15) or with fewer than 2 non-zero rows (:22); rows are `productsThisWeek`, `bidsLast24h`, `openDemands`, `verifiedCompanies`; renders client `CountUp` |
| 5 | `HowItWorksFlow` | `components/marketplace/how-it-works-flow.tsx:36` (server) | static three-step buyer flow, no data |
| 6 | "Açık alım talepleri" section | inline `app/page.tsx:127-164` | `demandCards` via `ListingTeaserCard` (`listing-teaser-card.tsx:30`); grid and "Tüm talepler (n)" link only when `demandCards.length >= 3`, otherwise a one-line fallback with `signupHref("teklif")` |
| 7 | `ProductShowcase` | `components/marketplace/product-showcase.tsx:29` (**client**) | three tab groups: `featured`, `newestOnly`, `priced.items`, each with an href (`/urunler`, `?sirala=yeni`, `?fiyat=var&sirala=fiyat`) |
| 8 | `CategoryGrid` | `components/marketplace/category-grid.tsx:21` (server) | `categories={showcase}`; renders nothing when empty; section `id="kategoriler"` |
| 9 | `TwoCards` | `components/marketplace/two-cards.tsx:7` (server) | static, uses `signupHref("vitrin")` |
| 10 | `CompanyGrid` | `components/marketplace/company-grid.tsx:10` (server) | `companies={directory.items}`; `null` below `COMPANY_GRID_MIN`; slices to 6; each row is `CompanyCard` |
| 11 | `TrustBand` | `components/marketplace/trust-band.tsx:37` (server) | static supplier flow, `id="nasil-calisir"` |
| 12 | `PopularChips` | `components/marketplace/popular-chips.tsx:9` (server) | `items={stats.popularCategories}`; `null` when empty |
| 13 | `FloatingCta` | `components/marketplace/floating-cta.tsx:11` (**client**) | `href={signupHref("talep")}`; visibility from `useHeroGone()` |
| 14 | SEO paragraph | inline `app/page.tsx:185-192` | static two-sentence copy |

Client components among these: `hero-search.tsx`, `count-up.tsx`,
`product-showcase.tsx`, `floating-cta.tsx`. Everything else on the homepage is a
server component.

Full client/server split across `components/marketplace/`:
client — `category-image.tsx`, `count-up.tsx`, `filter-primitives.tsx`,
`filter-shell.tsx`, `floating-cta.tsx`, `hero-search.tsx`, `inquiry-button.tsx`,
`inquiry-dialog.tsx`, `listing-card.tsx`, `product-card.tsx`,
`product-filters.tsx`, `product-showcase.tsx`, `view-beacon.tsx`.
Server — everything else (`category-grid`, `category-visual-box`, `coming-soon`,
`company-card`, `company-grid`, `company-products`, `facets`, `gated-field`,
`hero`, `how-it-works-flow`, `listing-detail`, `listing-index`,
`listing-teaser-card`, `marketplace-footer`, `pagination`, `popular-chips`,
`product-detail`, `product-index`, `public-empty-state`, `public-layout`,
`public-list-page`, `rfq-banner`, `search-form`, `stats-strip`, `trust-band`,
`trust-strip`, `two-cards`).

---

# Bölüm C — Kategori ağacı, nitelik süzgeci, bileşen envanteri, next/image, arama

# Discovery — categories, attributes, components, images, search

Read-only discovery over `/home/noah/projects/supkeys`. No files modified.
All paths relative to repo root unless noted. `file:line` throughout.

---

## 1. CATEGORY TREE

### 1.1 Prisma model

`packages/db/prisma/schema.prisma:219-294` — `@@map("categories")`

```prisma
model Category {
  id         String @id @default(cuid())
  /** UNSPSC 8-haneli kod (10000000=segment, 10100000=family, 10101500=class, 10101501=commodity) */
  code       String @unique
  nameTr     String
  /** TR-katlanmış arama metni (foldSearchText(nameTr)) — 'İ'/aksan sorunsuz */
  searchText String @default("")
  /** Küratörlü eşanlamlı/jargon listesi; searchText'e katlanarak dahil edilir */
  keywords   String @default("")
  /** 1=Segment, 2=Family, 3=Class, 4=Commodity */
  level      Int
  /** Kategori GÖRSELİ — kart/ızgara arka planı. NULL bırakılabilir. */
  imageUrl   String?
  /** Ariba Discovery kataloğunda da var mı? */
  inDiscovery Boolean @default(true)

  parentId String?
  parent   Category?  @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: Cascade)
  children Category[] @relation("CategoryHierarchy")

  /** Sadece level 1: PratisPro tarzı harf prefix (A, B, C...) */
  segmentLetter String?
  sortOrder     Int     @default(0)
  isActive      Boolean @default(true)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([parentId, sortOrder])
  @@index([level, sortOrder])
  @@index([code])
  @@index([searchText(ops: raw("gin_trgm_ops"))], type: Gin, map: "categories_searchText_trgm_idx")
  @@index([nameTr(ops: raw("gin_trgm_ops"))],     type: Gin, map: "categories_nameTr_trgm_idx")
  @@map("categories")
}
```

Level/parent scheme:

- **Yes, exactly 4 levels.** Declared in the doc comment at `schema.prisma:238-240`:
  `1=Segment, 2=Family, 3=Class, 4=Commodity`.
- Hierarchy is derived from the 8-digit code, 2 digits per level
  (`10000000` segment → `10100000` family → `10101500` class → `10101501` commodity).
  `parentId` holds the parent's code. `Category.id` is written by the seed as the
  8-digit code (the `@default(cuid())` is never exercised by the seed path).
- `onDelete: Cascade` on the self-relation.
- Two `pg_trgm` GIN indexes declared at `schema.prisma:288-291`; the extension itself
  is created in migration `20260902100100_category_search_trgm` (Prisma cannot model
  `CREATE EXTENSION`). Comment notes they must be declared here or the CI drift gate
  (`migrate diff --exit-code`) fails on every push.

Related model — `CategorySearchMiss` at `schema.prisma:305-326` (`@@map("category_search_misses")`):
unresolved-search curation queue, `query` is the folded form and is `@unique`,
`rawQuery` keeps the last raw spelling, `count`, `firstSeenAt`, `lastSeenAt`,
`resolvedAt`, `resolvedNote`, `@@index([resolvedAt, count])`.

`CompanyAffinity` at `schema.prisma:345+` deliberately has **no FK to Category**
(`schema.prisma:340-344`): `seed-categories` does delete+recreate, so a FK would
either block the seed or cascade-delete these rows. Same reason listing/company
category selections are `String[]` of codes.

### 1.2 API endpoints

Single controller: `apps/api/src/modules/categories/controllers/category.controller.ts`,
`@Controller("categories")` at `:12`. **No auth guard — public.**
Module: `apps/api/src/modules/categories/categories.module.ts`.

| Route | Line | Cache-Control | Params | Notes |
|---|---|---|---|---|
| `GET /categories/all` | `:26-30` | `public, max-age=60` | none | L1 + L2 flat, ~616 rows ≈ 90 KB |
| `GET /categories/segments` | `:36-40` | `public, max-age=300` | none | L1 only |
| `GET /categories/children` | `:50-60` | `public, max-age=60` | `parentId`, `catalog` | `parseCategoryCatalog(catalog)`; default `full` |
| `GET /categories/search-tree` | `:62-72` | `no-cache` | `q`, `catalog` | |
| `GET /categories/by-ids` | `:81-90` | none | `ids` (comma list) | **no catalog filter, deliberate** |

Deliberate omissions documented in-file:

- `:22-25` — `/all` takes **no** `catalog` param: the two catalogs differ only at L4,
  so L1-L2 are byte-identical; adding the param would produce two cache entries for
  the same bytes.
- `:74-80` — `/by-ids` does **not** filter by catalog: its job is to resolve an
  already-saved code. A company can declare a non-discovery leaf; filtering would make
  its own chosen category render as "…" on its own screen.
- `:8-10` — history note: lazy `/roots` + `/children` architecture was folded into
  `/all`; old `/roots` removed.

Service — `apps/api/src/modules/categories/services/category.service.ts`:

| Method | Line |
|---|---|
| `getAllActive()` | `:54` |
| `getSegments()` | `:80` |
| `childrenOf(parentId, catalog = "full")` | `:105` |
| `attachChildCount<T>()` (private) | `:130` |
| `searchHierarchical()` | `:153` |
| `getByIds(ids)` | `:520` |
| `recordSearchMiss(raw, folded)` (private) | `:568` |
| `validateIds()` | `:599` |
| `buildBreadcrumb(node)` (exported fn) | `:658` |

Catalog parsing single source: `@rothern/shared` `constants/category-catalog.ts`
(`parseCategoryCatalog`, `categoryCatalogWhere`) — imported at
`category.controller.ts:2`.

### 1.3 Web helpers

**`apps/web/src/lib/public/category-showcase.ts`**

- `SHOWCASE_ORDER` at `:15-32` — 16 hand-curated segment codes
  (`23000000` machinery, `31000000` components, `39000000` electrical, `30000000`
  construction, `11000000` metals, `12000000` chemicals, `40000000` distribution,
  `27000000` tools, `24000000` material handling, `43000000` IT, `78000000`
  transport, `50000000` food, `25000000` vehicles, `26000000` power, `32000000`
  electronics, `53000000` apparel).
- `ShowcaseCategory` interface at `:34-42`: `{ id, name, count, imageSrc }`.
- `buildShowcase({segments, counts, productCovers, limit})` at `:44-83`.
  - default `limit = 11` (`:52`, comment: 1 big 2×2 + 5×2 small fills a 7-col
    two-row grid).
  - product covers are mapped to a segment by `code.slice(0,2) + "000000"` (`:60-65`).
  - ordering at `:66-75`: categories **with products first** (desc by count), then
    `SHOWCASE_ORDER`, then whatever segments remain.
  - image resolution at `:80`: `categoryPhotoSrc(id) ?? coverBySeg.get(id) ?? null`.
  - Header comment `:3-13`: grid is **always full** even at zero inventory; the count
    badge is printed only when `> 0` so "0 ürün" never announces thin inventory.
- Test: `apps/web/src/lib/public/category-showcase.test.ts`.

**`apps/web/src/lib/public/category-photos.ts`**

- `CATEGORY_PHOTOS: ReadonlySet<string>` at `:18-29` — **58 segment codes**, all
  present.
- `categoryPhotoSrc(code)` at `:31-33` → `/categories/${code}.webp`, exact segment
  code only, else `null`.
- `segmentPhotoSrc(categoryIds)` at `:40-48` → derives segment from any-level code
  (first 2 digits + `000000`), first match wins, `null` if none.
- Header `:1-17` documents the fallback ladder used by `categoryGridImage` /
  `CategoryImage` / `CategoryVisualBox`:
  1. the record's own image (product cover, listing cover),
  2. the category's **segment photo** (this manifest),
  3. generated visual (`lib/public/category-visual.ts`, icon + tone).
  Manifest is hand-maintained **on purpose** so a server component never stats the
  filesystem.
- Test: `apps/web/src/lib/public/category-photos.test.ts` (locks manifest ↔ files
  1:1 and the 58-segment icon mapping).

**`apps/web/src/lib/public/marketplace.ts`**

- `MARKETPLACE_ROUTES` at `:33-42`: `demands: "/alim-talepleri"`,
  `products: "/urunler"`, `companies: "/firmalar"`, `demand: "/talep"`.
  Comment `:29-32`: must stay consistent with `lib/public-routes.ts`
  `PUBLIC_ROUTE_PREFIXES`, else the route gets a nonce'd CSP and cannot be statically
  generated. `marketplace.test.ts` asserts this.
- `MARKETPLACE_LABELS` at `:44-56`: `demands: "Alım Talepleri"`,
  `products: "Ürünler"`, `companies: "Firmalar"`, `demandOne: "Alım talebi"`.
- `listingSlug` `:74`, `parseListingNumber` `:83`, `listingPath` `:88`,
  `publicState` `:115`, `STATE_LABEL` `:119`, `isIndexableState` `:132`.
- `CATEGORY_CODE_RE = /^(\d{8})(?:-|$)/` at `:152`.
- `categoryPath(code, name?)` at `:154-158`:

```ts
export function categoryPath(code: string, name?: string): string {
  const tail = name ? slugifyText(name) : "";
  const slug = tail ? `${code}-${tail}` : code;
  return `${MARKETPLACE_ROUTES.products}/kategori/${slug}`;
}
```

- `parseCategoryCode(slug)` at `:161-164`.
- Rationale at `:140-151`: filter is a **path segment, not a query param**, so the
  page can be statically generated and each category earns its own indexable address;
  code goes **first** so parsing is one non-slipping regex.

### 1.4 Does the public UI have subcategories today?

**No.** Every public category surface is flat L1 (plus one flat facet list):

- **Homepage** `apps/web/src/app/page.tsx`:
  - `:76` fetches `[featured, newest, priced, productFacets, segments, demands, directory, stats]`.
  - `:87-90` `buildShowcase({ segments: segments.map(s => ({id: s.id, name: s.nameTr})), ... })`
    — **segments only, i.e. L1**.
  - `:121` `<MarketplaceHero popular={stats.popularCategories} />`.
  - `:176` `<CategoryGrid categories={showcase} />`.
  - `:181` `<PopularChips items={stats.popularCategories} />` — L3 classes, computed
    server-side (see §5).
  - File is 195 lines total.
- **`components/marketplace/category-grid.tsx`** (97 lines):
  - `:21-54` `CategoryGrid` renders `categories.slice(0, 12)` (`:46`) in a
    `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4` list.
  - `:56-96` `Row` — a single `<Link href={categoryPath(c.id, c.name)}>`; 16:10 photo
    on top (`:66-75`) or toned icon fallback (`:76-80`).
  - Header comment `:8-20` explains 12 cards / 4 cols, always visible, count only
    when > 0, click goes to the SSG breakout page.
  - **No children rendered, no hover panel, no nesting.**
- **Header** `components/marketing/marketing-header.tsx`:
  - `navigation` array at `:22-35` — 4 static entries only: Ürünler, Firmalar,
    Alım Talepleri (all three gated on `MARKETPLACE_LIVE`), plus "Nasıl Çalışır".
  - No `Popover` / `Menu` / `Disclosure` in the file; the only overlay is the mobile
    `Dialog` at `:165`. **No mega-menu component exists anywhere.**
  - Two tones (`light` / `dark`) documented at `:37-45`.
- **Category breakout page** `app/urunler/kategori/[slug]/page.tsx`:
  - `:35-38` `generateStaticParams` is fed from `fetchProductFacets().categories`
    (only categories that actually have products — comment `:25`).
  - `:41-44` name resolution from the same facet list.
  - Renders **no child categories**.
- **Only drill-down that exists** is the sidebar filter, and it is a **flat radio
  list**, not a tree: `components/marketplace/product-filters.tsx:104-134`
  (`ShowMoreRadio` + a "Kategori ara" text box at `:107-122`; the facet rows carry a
  `level` field but it is not used for indentation or grouping).

### 1.5 The 58 segment photos

- Location: `apps/web/public/categories/<8-digit-code>.webp`
- Count verified: **58 files**. Total size **4.5 MB** (`du -sh`).
- First entries: `10000000.webp`, `11000000.webp`, `12000000.webp`, `13000000.webp`,
  `14000000.webp`, `15000000.webp`, `20000000.webp`, `21000000.webp`, …
- Manifest that must match them: `apps/web/src/lib/public/category-photos.ts:18-29`.
- Credits/licence record: `docs/category-photo-credits.md` (CC0 / PDM only).
- Served from the repo (not CDN) so `next/image` optimizes a local file.

---

## 2. ATTRIBUTE FILTERS

### 2.1 Prisma model

`packages/db/prisma/schema.prisma:1825-1882` — `@@map("category_attributes")`

```prisma
model CategoryAttribute {
  id         String   @id @default(cuid())
  /** Hangi kategori düğümünde TANIMLI (Category.id = 8 haneli kod). Altındaki
   *  her düğüm bunu devralır. */
  categoryId String
  /** Makine adı — ürünün `attributes` JSON'ında anahtar olarak kullanılır.
   *  Ada göre değil ANAHTARA göre eşleşiriz ki etiket çevrilse bile veri
   *  bozulmasın. */
  groupKey   String
  nameTr     String
  type       CategoryAttributeType
  /** SINGLE_SELECT / MULTI_SELECT için kapalı değer listesi. */
  options    String[] @default([])
  /** NUMBER için birim ("mm", "V", "kg"). */
  unit       String?
  /** Zorunlu nitelik ürünün yayımlanmasını ENGELLEMEZ; yalnız tamamlanma
   *  skorunu düşürür. */
  isRequired Boolean  @default(false)
  sortOrder  Int      @default(0)
  createdAt  DateTime @default(now())
  updatedAt  DateTime @default(now()) @updatedAt

  @@unique([categoryId, groupKey])
  @@index([categoryId])
  @@map("category_attributes")
}
```

Enum — `schema.prisma:1670-1675`:

```prisma
enum CategoryAttributeType {
  SINGLE_SELECT // kapalı listeden tek seçim
  MULTI_SELECT  // kapalı listeden çoklu seçim
  NUMBER        // sayı (+ birim)
  TEXT          // serbest kısa metin — SON ÇARE, süzülemez
}
```

Model doc comment `schema.prisma:1800-1824` explains inheritance: 158.018 categories
make per-code curation impossible, so attributes are defined on an upper node and
inherited downward; a product's attributes = every row on its code's **ancestor
chain**; the chain is derived from the code (`categoryAncestors`, @rothern/shared) —
4 exact-match lookups, no tree walk. An unpopulated branch simply asks no attribute
questions and still works.

Example seed rows — `packages/db/src/seeds/category-attributes.ts`:

- `:252-256` `{ key: "gerilim", nameTr: "Gerilim aralığı", options: ["Alçak gerilim (<1 kV)", "Orta gerilim (1-36 kV)", "Yüksek gerilim (>36 kV)"] }`
- `:259-260` `{ key: "koruma_sinifi", nameTr: "Koruma sınıfı (IP)" }`
- `:634-637` same `gerilim` definition repeated on a second node (family-level override)
- `:663` `{ key: "calisma_gerilimi", nameTr: "Çalışma gerilimi", type: "NUMBER", unit: "V" }`
- `:170` `nameTr: "Besleme gerilimi"`

Seed command: `pnpm --filter @rothern/db seed-category-attributes` (idempotent,
fail-loud, deletes rows absent from source).

### 2.2 API resolver

`apps/api/src/common/company/category-attributes.ts` (91 lines, TEK KAYNAK).

Shape at `:19-28`:

```ts
export interface ResolvedAttribute {
  key: string;
  nameTr: string;
  type: string;
  options: string[];
  unit: string | null;
  isRequired: boolean;
  /** Hangi düğümden geldi — formda "segmentten miras" göstermek için. */
  definedAt: string;
}
```

`resolveCategoryAttributes(prisma, categoryId)` at `:30-65`:

```ts
if (!categoryId || !isCategoryCode(categoryId)) return [];
const chain = categoryAncestors(categoryId);
const rows = await prisma.categoryAttribute.findMany({
  where: { categoryId: { in: chain } },
  orderBy: [{ sortOrder: "asc" }, { nameTr: "asc" }],
});
// Spesifiklik = zincirdeki sıra (segment en genel, yaprak en özel).
const rank = new Map(chain.map((c, i) => [c, i]));
const byKey = new Map<string, (typeof rows)[number]>();
for (const r of rows) {
  const cur = byKey.get(r.groupKey);
  if (!cur || (rank.get(r.categoryId) ?? 0) >= (rank.get(cur.categoryId) ?? 0)) {
    byKey.set(r.groupKey, r);
  }
}
```

Then sorted by `sortOrder`, tie-broken by `nameTr.localeCompare(…, "tr")` (`:51-55`)
and mapped to `ResolvedAttribute` (`:56-64`).

Header `:4-18` states the two consumers that must not diverge: the panel product form
(which fields to ask) and the public product page (what label a stored key gets).

`labelAttributes(stored, defs)` at `:74-91` — display helper; returns
`{ key, label, value, unit }[]`; array values are joined with `", "` (`:85`); keys
present in the record but absent from the definitions are **deliberately dropped**
(`:67-73`, `:88`).

### 2.3 Public facet endpoint

Route: `GET /public/products/facets` —
`apps/api/src/modules/public-marketplace/public-marketplace.controller.ts:102-106`,
`@Header("Cache-Control", "public, max-age=0, s-maxage=600, stale-while-revalidate=1800")`.
Controller is `@Controller("public")` at `:26`.

Response shape declared inline at
`apps/api/src/modules/public-marketplace/public-marketplace.service.ts:491-504`:

```ts
async productFacets(q: PublicProductFacetQueryDto = {}): Promise<{
  categories: { id: string; name: string; level: number; count: number }[];
  cities: { city: string; count: number }[];
  activities: { activity: string; count: number }[];
  verified: number;
  price: { has: number; request: number };
  attributes: {
    key: string;
    nameTr: string;
    unit: string | null;
    values: { value: string; count: number }[];
  }[];
  truncated: boolean;
}>
```

Implementation `:505-542`:

- one scan `prisma.companyItem.findMany({ where: { ...publicProductWhere(), ...(q.q ? { AND: productSearchClauses(q.q) } : {}) }, select: { categoryId, priceMode, attributes, company: { city, activities, companyVerificationStatus } }, take: FACET_SCAN_CAP + 1 })` (`:509-518`)
- `FACET_SCAN_CAP = 5000` at `:50`; `truncated` computed at `:519-520`
- category prefix narrowing in memory via `categoryPrefix(q.category)` (`:521-522`)
- contextual counts (a dimension is counted with the *other* selections applied) via
  `contextualFacetCounts` (`:523-525`)
- sector list stays category-independent so the user can jump branches (`:505-508`)
- `attributes: await this.attributeFacets(q.category, inCategory)` at `:539`

`attributeFacets(category, rows)` at `:558-…`:

- returns `[]` unless `category` matches `/^\d{8}$/` (`:564`)
- definitions come from `resolveCategoryAttributes(this.prisma, category)` — the
  **same** inheritance source the panel form uses (`:565`)
- filtered to `FACETABLE_TYPES = new Set(["SINGLE_SELECT", "MULTI_SELECT"])`
  (`:54`, applied `:565-566`) — free text and numbers would give each product its own
  value, making counts meaningless (`:552-554`)
- attributes with **no values in the scanned set are omitted** (`:555-556`) — a filter
  row that narrows nothing is not shown

Doc comment `:544-557` states plainly why attribute facets exist only with a category
selected.

### 2.4 Query DTO

`apps/api/src/modules/public-marketplace/dto/public-product-query.dto.ts`

`PublicProductQueryDto` at `:22-118`:

| Field | Line | Validation |
|---|---|---|
| `q` | `:23-27` | `@MaxLength(120)`, trimmed |
| `category` | `:29-32` | `@Matches(/^\d{8}$/)` — ancestor chain expanded server-side |
| `city` | `:34-39` | `@MaxLength(400)`, comma list |
| `sort` | `:41-44` | `@IsIn(["relevance","newest","price","price_desc"])` |
| `priceMin` / `priceMax` | `:46-59` | int, 0…1e9 |
| `moqMax` | `:61-67` | int, 1…1e9 |
| `verified` | `:69-72` | `@IsIn(["1"])` |
| `price` | `:74-77` | `@IsIn(["has","request"])` |
| `activity` | `:79-83` | `@MaxLength(200)`, comma list |
| **`attr`** | `:97-107` | see below |
| `page` | `:109-117` | int 1…200 |

The attribute filter (`:85-107`):

```ts
/**
 * Nitelik süzgeci — `anahtar:değer` çiftleri, tekrarlanabilir
 * (`?attr=malzeme:Çelik&attr=koruma_sinifi:IP65`).
 *
 * Neden tek param değil de tekrar: değerler serbest metin (kategori
 * tanımından gelir, ayraç içerebilir) — "|" gibi bir ayraçla birleştirmek
 * ilk "|" içeren seçenekte sessizce bölerdi.
 *
 * Tavan 6: her çift ayrı bir JSON koşulu üretir ve bu uçlar kenar
 * önbelleğine yazılıyor; sınırsız kombinasyon hem pahalı sorgu hem sınırsız
 * önbellek anahtarı demek.
 */
@IsOptional()
@Transform(({ value }) =>
  value == null ? undefined : Array.isArray(value) ? value : [value],
)
@IsArray()
@ArrayMaxSize(6)
@Matches(/^[a-z0-9_]{1,40}:[^\n\r]{1,60}$/, {
  each: true,
  message: "Nitelik süzgeci anahtar:değer biçiminde olmalı",
})
attr?: string[];
```

`PublicProductFacetQueryDto` at `:127+` — takes **only** `category` (`:128-130`)
plus the contextual dimensions added in v3 (`:132-140`: `q`, city, activity,
verified, price). Deliberately not reusing `PublicProductQueryDto` so unused params
(search, page) do not multiply the edge-cache key (`:120-126`).

### 2.5 Where-clause builder

`apps/api/src/common/company/product-index.ts`

- `ProductIndexParams` interface `:13`
- `multi(v?)` `:32`
- `productSearchClauses(raw?)` `:39`
- **`attributeClauses(raw?)` `:60-76`** — doc `:56-59`:

```ts
/**
 * Nitelik süzgeci — `attributes` JSON'ı üzerinde. Değer tekli seçimde dize,
 * çoklu seçimde dizi; ikisi OR'lanır (tek biçim aransa kategorinin yarısı
 * sessizce boş dönerdi). `attributes` üzerinde indeks YOK (bilinen sınır).
 */
export function attributeClauses(raw?: string[]): Prisma.CompanyItemWhereInput[] {
  const out: Prisma.CompanyItemWhereInput[] = [];
  for (const entry of raw ?? []) {
    const i = entry.indexOf(":");
    if (i <= 0) continue;
    const key = entry.slice(0, i);
    const value = entry.slice(i + 1).trim();
    if (!value) continue;
    out.push({
      OR: [
        { attributes: { path: [key], equals: value } },
        { attributes: { path: [key], array_contains: [value] } },
      ],
    });
  }
  return out;
}
```

- `productCategoryWhere(code?)` `:79` — uses `categoryPrefix` so the filter covers the
  **subtree**
- `productIndexWhere(...)` `:85`
- `productIndexOrderBy(...)` `:130`
- `ProductFacetRow` `:140`
- `contextualFacetCounts(rows, sel)` `:153-186` — per-dimension predicates at
  `:156-160`
- `productFacetCounts(rows)` `:188`

**Known limit (stated in-code):** no index on the `attributes` JSON column.

### 2.6 Web URL param + sidebar rendering

**`apps/web/src/lib/public/product-filter-params.ts`** (118 lines, TEK KAYNAK)

Documented schema `:10-12`:

```
?q=&kategori=42000000&sehir=İstanbul,İzmir&faaliyet=MANUFACTURER,DISTRIBUTOR
&dogrulanmis=1&fiyat=var|teklif&fiyatMin=&fiyatMax=&moqMax=&sirala=yeni|fiyat|fiyat-azalan
&nitelik=anahtar:değer (tekrarlanır)&sayfa=2
```

State `:18-31`:

```ts
export interface ProductFilterState {
  q?: string;
  category?: string;
  cities: string[];
  activities: string[];
  verified: boolean;
  price?: "var" | "teklif";
  priceMin?: number;
  priceMax?: number;
  moqMax?: number;
  sort?: "yeni" | "fiyat" | "fiyat-azalan";
  attrs: string[];
  page: number;
}
```

- parse `:52-71`; attribute line `:68`:
  `attrs: getAll(sp, "nitelik").filter((a) => a.includes(":")).slice(0, 6)`
- to API params `:74-89`; attribute line `:86`: `attr: f.attrs.length ? f.attrs : undefined`
- to URL `:92-108`; attribute line `:104`: `for (const a of f.attrs) sp.append("nitelik", a)`
- `activeFilterCount` `:111-116` counts `f.attrs.length`
- `EMPTY_FILTERS` `:118`
- Header note `:14-16`: category also lives in the query now; the path pages
  (`/urunler/kategori/<kod>-<ad>`) remain as SEO entry points.
- Test: `apps/web/src/lib/public/product-filter-params.test.ts`

**`apps/web/src/components/marketplace/product-filters.tsx`** (245 lines, `"use client"`)

Header `:11-21` — checkbox-based multi-select; every group is
`<fieldset><legend>` with a selected count + section clear; collapsible via
`<details>` with `localStorage`; long lists show 6 then "Tümünü göster (12)";
zero-count options dimmed + disabled; price/MOQ debounced 400 ms; state lives in the
URL (`filter-shell.tsx`); **public `/urunler` and panel "Ürün Ara" use the same
component**.

Group order in `ProductFilters` `:22-80`:

1. `CategoryGroup` `:26` (defined `:85-134`)
2. "Firma profili" / Doğrulanmış `:28-36`
3. "Faaliyet tipi" `:38-51`
4. "Şehir" `:53-60`
5. `PriceGroup` `:62`
6. **attribute groups `:63-78`** — one per facet attribute:

```tsx
{facets.attributes.map((a) => (
  <Group
    key={a.key}
    title={a.unit ? `${a.nameTr} (${a.unit})` : a.nameTr}
    count={state.attrs.filter((x) => x.startsWith(`${a.key}:`)).length}
    onClear={() => update((s) => ({ ...s, attrs: s.attrs.filter((x) => !x.startsWith(`${a.key}:`)) }))}
    storageKey={`attr-${a.key}`}
  >
    <ShowMore
      items={a.values.map((v) => ({ key: `${a.key}:${v.value}`, label: v.value, count: v.count }))}
      selected={state.attrs}
      idPrefix={`${idPrefix}-attr-${a.key}`}
      onToggle={(k, on) => update((s) => ({ ...s, attrs: on ? [...s.attrs, k] : s.attrs.filter((x) => x !== k) }))}
    />
  </Group>
))}
```

Attribute state is cleared whenever the category changes — `:105` (group clear),
`:125` (deselect via the pinned selected row), `:131` (`onSelect`), `:191` (chip
remove). Active-filter chips include one per attribute at `:198`, labelled with the
value only (`a.slice(a.indexOf(":") + 1)`).

`CategoryGroup` `:85-134` is **flat**: an optional "Kategori ara" text input when
`facets.categories.length > SHOW` (`:106-123`), a pinned row for a selected category
missing from the filtered list (`:124-126`), then `ShowMoreRadio` (`:127-133`) with
`emptyText="Eşleşen kategori yok"`. The `level` field returned by the facet endpoint
is not used for nesting.

Shared building blocks (`Check`, `FilterChipBar`, `Group`, `SHOW`, `ShowMore`,
`ShowMoreRadio`, `FilterChip`) come from `./filter-primitives` (`:7`), shared with the
seller-side request filters.

---

## 3. COMPONENT INVENTORY

### 3.1 `apps/web/src/components/marketplace/` — 43 files

| File | Lines | Purpose (from file header) |
|---|---|---|
| `category-grid.tsx` | 97 | "KATEGORİYE GÖRE KEŞFET" — fotoğraf kartları; 12 kart, 4 sütun |
| `category-image.tsx` | 128 | Kart görseli — gerçek fotoğraf varsa o, yoksa ÜRETİLMİŞ kategori görseli |
| `category-visual-box.tsx` | 34 | ÜRETİLMİŞ kategori görseli — SUNUCU bileşeni (hook yok, olay yok) |
| `coming-soon.tsx` | 41 | Yayın öncesi kök sayfa (marketplace flag kapalıyken) |
| `company-card.tsx` | 92 | FİRMA DİZİNİ KARTI — herkese açık (görünürlük v2, Europages kalıbı) |
| `company-grid.tsx` | 28 | "Rothern'daki firmalar" — 6 dizin kartı; `COMPANY_GRID_MIN = 4` eşiği altında çizilmez |
| `company-products.tsx` | 57 | Firma profilindeki ÜRÜN PORTFÖYÜ — sunucu bileşeni |
| `count-up.tsx` | 46 | Sayı animasyonu — görünüme girince 0'dan hedefe (600 ms, ease-out) |
| `facets.tsx` | 66 | Süzgeç yüzeyi — ilan ve ürün dizinleri ORTAK kullanır |
| `filter-primitives.tsx` | 249 | SÜZGEÇ YAPI TAŞLARI — ürün süzgeci ve açık talep süzgeci ortak |
| `filter-shell.tsx` | 209 | SÜZGEÇ KABUĞU — URL durumu, geçiş (pending) ve mobil çekmece TEK yerde |
| `floating-cta.tsx` | 29 | Yüzen "Talep aç" — hero görünümden çıkınca belirir (B8) |
| `gated-field.tsx` | 77 | KAPILI ALAN — gizlenen değerin YERİNE basılır (görünürlük katmanı) |
| `hero-search.tsx` | 166 | HERO ARAMASI — İKİ sekme (Ürünler · Firmalar) + yazarken öneri |
| `hero.tsx` | 105 | Pazar yeri hero'su — v2 (2026-09-04, Europages kalıbı) |
| `how-it-works-flow.tsx` | 77 | ALICI AKIŞI — üç adım, yatay (B3) |
| `inquiry-button.tsx` | 41 | "Teklif iste" düğmesi — sunucu bileşeni ürün sayfasındaki tek client adası |
| `inquiry-dialog.tsx` | 238 | MİSAFİR BİLGİ TALEBİ KUTUSU — hesap SORMAZ |
| `listing-card.tsx` | 452 | İLAN KARTI — TEK bileşen ailesi (v2 denetimi, 2026-09-03); renk yalnız DURUM anlatır |
| `listing-detail.tsx` | 471 | Tekil alım talebi sayfası — SUNUCU bileşeni |
| `listing-index.tsx` | 205 | Alım talebi dizini; TÜRKÇE URL ↔ İNGİLİZCE API sınırı |
| `listing-teaser-card.tsx` | 115 | ALIM TALEBİ TEASER KARTI (görünürlük v2) — "gizli ama cezbedici" |
| `marketplace-footer.tsx` | 95 | Public sayfaların ortak alt bilgisi — SUNUCU bileşeni |
| `pagination.tsx` | 68 | Sayfalama — bağlantı tabanlı (buton değil), botlar gezebilsin |
| `popular-chips.tsx` | 32 | "POPÜLER KATEGORİLER" çipleri — arama logu yok; ürün sayısı en yüksek 20 alt kategori |
| `product-card.tsx` | 236 | ÜRÜN KARTI — TEK bileşen, iki varyant (tile/row) |
| `product-detail.tsx` | 584 | Ürün sayfası — SUNUCU bileşeni |
| `product-filters.tsx` | 245 | ÜRÜN SÜZGEÇLERİ — istemci, checkbox tabanlı, ÇOKLU seçim (v3) |
| `product-index.tsx` | 135 | ÜRÜN DİZİNİ — süzgeç v3 |
| `product-showcase.tsx` | 213 | SEKMELİ ÜRÜN KAYDIRICISI — TEK kaydırıcı, üç sekme (B5) |
| `public-empty-state.tsx` | 52 | TEK BOŞ DURUM — bütün herkese açık listeler |
| `public-layout.tsx` | 36 | HERKESE AÇIK SAYFA KABUĞU — tek header, tek footer |
| `public-list-page.tsx` | 146 | HERKESE AÇIK LİSTE İSKELETİ — ilan ve ürün dizinleri ORTAK |
| `rfq-banner.tsx` | 54 | "TALEP AÇ" BANNERI — Europages RFQ bannerı; ürün sayfasında ad ön-doldurulur |
| `search-form.tsx` | 80 | Arama — DÜZ HTML FORM, client JS yok (`method="get"`) |
| `stats-strip.tsx` | 38 | SAYI ŞERİDİ — HAREKET metrikleri (B2), envanter değil |
| `trust-band.tsx` | 72 | Tedarikçi akışı bandı; ritim renkle değil YÜZEYLE |
| `trust-strip.tsx` | 57 | GÜVEN BANDI — hero'nun hemen altında, her zaman görünür |
| `two-cards.tsx` | 42 | Europages "Create profile / Request Hub" ikilisi — üçüncü kayıt CTA'sı |
| `view-beacon.tsx` | 44 | Herkese açık profil/ürün görüntülenme beacon'ı (Ziyaret Edenler) |
| `listing-page.ts` | 42 | `/talep/<slug>` sayfasının çözümleyicisi |
| `listing-page.test.ts` | 61 | Test |
| `__tests__/` | — | Test dizini |

### 3.2 `apps/web/src/components/list/` — 11 files (panel-side, Catalyst)

| File | Lines | Purpose |
|---|---|---|
| `active-filter-chips.tsx` | 54 | P2 — aktif filtreler kaldırılabilir chip'ler |
| `empty-state.tsx` | 59 | İki ton: `no-data` (renkli accent, onboarding) / `no-results` (nötr) |
| `filter-bar.tsx` | 41 | Filtre çubuğu sarmalayıcısı |
| `filter-select.tsx` | 111 | Liste sayfaları için pill-tarzı filtre seçici (P0) |
| `list-skeleton.tsx` | 34 | Tablo/satır listeleri için yükleme skeleton'u |
| `page-container.tsx` | 28 | B13 — sayfa genişliği TEK kural (shell 1320px konteyneri) |
| `page-header.tsx` | 40 | Sayfa başlığı standardı — Catalyst Heading + Text |
| `pagination.tsx` | 113 | Catalyst tarzı numaralı sayfalama — kayıt aralığı + Önceki/Sonraki |
| `result-count.tsx` | 43 | Sonuç sayacı; B6: veri yüklenmediyse skeleton |
| `search-input.tsx` | 73 | Debounced search — Catalyst InputGroup + Input |
| `view-toggle.tsx` | 75 | P2 — kart/tablo görünüm anahtarı |
| `index.ts` | 11 | Barrel export |

### 3.3 Duplicated JSX in PUBLIC pages

Scope used for the greps (public app routes + public components):
`app/page.tsx`, `app/alim-talepleri`, `app/firma`, `app/firmalar`, `app/hakkimizda`,
`app/iletisim`, `app/nasil-calisir`, `app/talep`, `app/talep-onayla`, `app/urunler`,
`app/sozlesmeler`, `app/davet-kapat`, `components/marketplace`, `components/marketing`.

#### (a) Buttons — `rounded-full` + `bg-zinc-950` on the same element

**26 occurrences across 22 files.** No shared button component exists —
`grep -rl "PublicButton\|CtaButton\|MarketplaceButton"` → **not found**.
Every one is hand-written Tailwind.

Per-file counts (all files, sorted):

| Count | File |
|---|---|
| 2 | `components/marketplace/rfq-banner.tsx` |
| 2 | `components/marketplace/product-showcase.tsx` |
| 2 | `components/marketplace/inquiry-dialog.tsx` |
| 2 | `app/talep-onayla/page.tsx` |
| 1 | `components/marketplace/two-cards.tsx` |
| 1 | `components/marketplace/trust-band.tsx` |
| 1 | `components/marketplace/search-form.tsx` |
| 1 | `components/marketplace/public-empty-state.tsx` |
| 1 | `components/marketplace/product-index.tsx` |
| 1 | `components/marketplace/product-filters.tsx` |
| 1 | `components/marketplace/product-detail.tsx` |
| 1 | `components/marketplace/product-card.tsx` |
| 1 | `components/marketplace/listing-teaser-card.tsx` |
| 1 | `components/marketplace/listing-detail.tsx` |
| 1 | `components/marketplace/inquiry-button.tsx` |
| 1 | `components/marketplace/hero.tsx` |
| 1 | `components/marketplace/hero-search.tsx` |
| 1 | `components/marketplace/gated-field.tsx` |
| 1 | `components/marketplace/floating-cta.tsx` |
| 1 | `components/marketplace/filter-shell.tsx` |
| 1 | `app/page.tsx` |
| 1 | `app/firma/[slug]/page.tsx` |

Exact lines:

```
app/page.tsx:143
app/firma/[slug]/page.tsx:188
app/talep-onayla/page.tsx:100
app/talep-onayla/page.tsx:127
components/marketplace/filter-shell.tsx:201
components/marketplace/floating-cta.tsx:23
components/marketplace/gated-field.tsx:45
components/marketplace/hero-search.tsx:112
components/marketplace/hero.tsx:66
components/marketplace/inquiry-button.tsx:27
components/marketplace/inquiry-dialog.tsx:122
components/marketplace/inquiry-dialog.tsx:188
components/marketplace/listing-detail.tsx:374
components/marketplace/listing-teaser-card.tsx:107
components/marketplace/product-card.tsx:228
components/marketplace/product-detail.tsx:166
components/marketplace/product-filters.tsx:223
components/marketplace/product-index.tsx:128
components/marketplace/product-showcase.tsx:157
components/marketplace/product-showcase.tsx:166
components/marketplace/public-empty-state.tsx:30
components/marketplace/rfq-banner.tsx:27
components/marketplace/rfq-banner.tsx:45
components/marketplace/search-form.tsx:71
components/marketplace/trust-band.tsx:57
components/marketplace/two-cards.tsx:34
```

Note: a multi-line `className` sweep (Perl, matching whole className string literals
that span lines) produced the **same** counts, so every occurrence is a single-line
class string.

#### (b) "Doğrulanmış" badge — inline `CheckBadgeIcon`

**No shared component.** `grep -rl "VerifiedBadge\|function Verified"` → **not found**.
7 render sites, each with slightly different markup (`aria-label` vs `aria-hidden`,
`size-3.5` vs `size-4`, emerald-600):

| File:line | Markup |
|---|---|
| `components/marketplace/company-card.tsx:47` | `<CheckBadgeIcon aria-label="Doğrulanmış firma" className="size-4 shrink-0 text-emerald-600 …" />` |
| `components/marketplace/product-card.tsx:194` | `<CheckBadgeIcon` (multi-line attrs) |
| `components/marketplace/product-detail.tsx:479` | `<CheckBadgeIcon aria-label="Doğrulanmış firma" className="size-4 text-emerald-6…" />` |
| `components/marketplace/listing-detail.tsx:386` | `<CheckBadgeIcon aria-hidden className="mt-0.5 size-3.5 shrink-0 text-emerald-6…" />` |
| `components/marketplace/listing-teaser-card.tsx:81` | `<CheckBadgeIcon aria-hidden className="size-3.5" />` |
| `components/company/visitors-view.tsx:177` | `{c.verified ? <CheckBadgeIcon aria-hidden className="size-4 text-emerald-600" /> : null}` (panel, not public) |
| `components/marketplace/trust-strip.tsx:20` · `trust-band.tsx:28` | `icon: CheckBadgeIcon` inside a data array — decorative, not a verified badge |

Import sites (8 files): `trust-band.tsx:2`, `listing-teaser-card.tsx`,
`listing-detail.tsx:30`, `product-card.tsx`, `product-detail.tsx:24`,
`company-card.tsx`, `trust-strip.tsx:3`, `components/company/visitors-view.tsx:14`.

Literal string "Doğrulanmış" in public scope, per file:

| Count | File |
|---|---|
| 4 | `app/nasil-calisir/marketing-page.tsx` |
| 3 | `components/marketplace/product-card.tsx` |
| 3 | `app/page.tsx` |
| 2 | `components/marketplace/product-filters.tsx` |
| 2 | `components/marketplace/product-detail.tsx` |
| 2 | `components/marketplace/listing-detail.tsx` |
| 2 | `components/marketplace/company-card.tsx` |
| 2 | `app/firmalar/page.tsx` |
| 1 | `components/marketplace/trust-strip.tsx` |
| 1 | `components/marketplace/stats-strip.tsx` |
| 1 | `components/marketplace/listing-teaser-card.tsx` |

#### (c) Card wrappers — `rounded-2xl` + (`ring-1 ring-zinc-950/5` OR `shadow-sm`)

**19 occurrences / 12 files:**

| Count | File |
|---|---|
| 5 | `components/marketplace/listing-detail.tsx` |
| 4 | `components/marketplace/product-detail.tsx` |
| 1 | `components/marketplace/trust-band.tsx` |
| 1 | `components/marketplace/public-list-page.tsx` |
| 1 | `components/marketplace/product-card.tsx` |
| 1 | `components/marketplace/listing-teaser-card.tsx` |
| 1 | `components/marketplace/listing-card.tsx` |
| 1 | `components/marketplace/company-card.tsx` |
| 1 | `components/marketplace/category-grid.tsx` |
| 1 | `components/marketing/marketing-header.tsx` |
| 1 | `app/talep-onayla/page.tsx` |
| 1 | `app/davet-kapat/page.tsx` |

Bare `rounded-2xl` (any variant), top files:

```
app/nasil-calisir/marketing-page.tsx:10
components/marketplace/listing-detail.tsx:5
components/marketplace/product-detail.tsx:4
components/marketplace/trust-band.tsx:1
components/marketplace/public-list-page.tsx:1
components/marketplace/public-empty-state.tsx:1
components/marketplace/product-card.tsx:1
components/marketplace/listing-teaser-card.tsx:1
components/marketplace/listing-card.tsx:1
components/marketplace/inquiry-dialog.tsx:1
components/marketplace/how-it-works-flow.tsx:1
components/marketplace/hero-search.tsx:1
components/marketplace/gated-field.tsx:1
components/marketplace/company-card.tsx:1
components/marketplace/category-grid.tsx:1
```

`app/nasil-calisir/marketing-page.tsx` has 10 `rounded-2xl` that do **not** use the
ring/shadow pair — that page has its own card chrome.

Concrete example of the shared card chrome, `category-grid.tsx:62`:

```
"group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-zinc-950/10"
```

#### (d) Which surfaces already go through a shared component

| Shared component | Importers (file:line) |
|---|---|
| `ProductCard` (`marketplace/product-card.tsx`) | `marketplace/product-index.tsx:3`, `marketplace/product-showcase.tsx:3`, `marketplace/company-products.tsx:1`, `marketplace/product-detail.tsx:18`, `app/company/(authed)/firma/[id]/page.tsx:15`, `components/products/products-view.tsx:20`, `components/company/product-discovery-section.tsx:4` — **7** |
| `CompanyCard` (`marketplace/company-card.tsx`) | `app/firmalar/page.tsx:1`, `marketplace/company-grid.tsx:1`, `components/company/connections-view.tsx:24` (aliased `DirectoryCard`), `components/dashboard/featured-companies-block.tsx:3` — **4** |
| `ListingTeaserCard` (`marketplace/listing-teaser-card.tsx`) | `app/page.tsx:8`, `marketplace/listing-index.tsx:2`, `marketplace/listing-detail.tsx:17` — **3** |
| `ListingCard` (`marketplace/listing-card.tsx`) | `marketplace/listing-index.tsx:1`, `components/ihale/BrowseTenderRow.tsx:14`, `components/ihale/IhaleListRow.tsx:13` (both also import `ROW_FOCUS`, `ListingCardData`) — **3** |
| `CategoryImage` (`marketplace/category-image.tsx`) | `listing-card.tsx:4`, `listing-detail.tsx:3`, `product-card.tsx:3`, `product-detail.tsx:2` — **4** |
| `Thumb` (`components/ui/thumb.tsx`) | `marketplace/company-card.tsx:2`, `marketplace/product-card.tsx:4`, `components/company/profile-editor.tsx:4`, `components/company/connections-view.tsx:25` — **4** |
| `SearchForm` (`marketplace/search-form.tsx`) | `marketplace/public-list-page.tsx:2,73` — **1** |

**Not shared** (hand-rolled everywhere): buttons, the verified badge, card chrome
(`rounded-2xl` + ring/shadow), section headers.

---

## 4. `next/image` `sizes` AUDIT

Only **6 files** import `next/image`:

```
components/brand/logo.tsx:2
components/marketing/auth-shell.tsx:1
components/marketplace/public-list-page.tsx:5
components/marketplace/category-grid.tsx:5
components/marketplace/category-image.tsx:6
components/dashboard/category-showcase-panel.tsx:6
```

### 4.1 `fill` without `sizes`

**None. Zero occurrences.** Every `fill` usage supplies `sizes`:

| File:line | Form | `sizes` |
|---|---|---|
| `components/marketplace/category-image.tsx:65` | `fill` | `"(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"` (also `priority={priority}`, `onError`) |
| `components/marketplace/category-grid.tsx:68` | `fill` | `"(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"` |
| `components/dashboard/category-showcase-panel.tsx:68` | `fill` | `"(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"` |
| `components/marketplace/public-list-page.tsx:78` | `fill` | `"20rem"` (single-line: `<Image src={image} alt="" fill sizes="20rem" priority className="object-cover" />`) |

Fixed-dimension usages (no `sizes` needed):

| File:line | Dimensions |
|---|---|
| `components/brand/logo.tsx:52` | `width={dimensions.w} height={dimensions.h}` |
| `components/marketing/auth-shell.tsx:106` | `width={205} height={60}` |

### 4.2 `unoptimized`

**2 occurrences, both the logo, both fixed-dimension:**

```
components/brand/logo.tsx:58        unoptimized
components/marketing/auth-shell.tsx:112   unoptimized
```

### 4.3 Context — raw `<img>` (not next/image)

Most imagery in the app bypasses `next/image` entirely. Raw `<img>` per file:

```
components/company/safe-cover-image.tsx:3
components/company/company-profile-view.tsx:3
components/ui/thumb.tsx:2
components/marketplace/category-image.tsx:2
components/company/profile-editor.tsx:2
components/products/image-uploader.tsx:1
components/company/company-logo.tsx:1
components/catalyst/avatar.tsx:1
app/company/(authed)/ayarlar/_components/two-factor-section.tsx:1
```

So **product cards** (via `Thumb`) and **company logos** (via `CompanyLogo`) render
raw `<img>` — no `next/image` optimization, no `sizes`, no srcset.
`category-image.tsx` deliberately falls back to a plain `<img>` for unconfigured
hosts (documented at `:74-76`: `next/image` rejects unknown hosts, and showing the
image beats showing nothing).

False positives excluded from the counts above: `<ImagePlus`, `<ImageOff`,
`<ImageUploader` matched a naive `<Image` grep in
`components/company/profile-editor.tsx:567,852`,
`components/products/product-showcase-form.tsx:301`,
`components/marketplace/category-image.tsx:100`.

---

## 5. SEARCH / TYPEAHEAD

### 5.1 Public suggest endpoint

Route: `GET /public/suggest` —
`apps/api/src/modules/public-marketplace/public-marketplace.controller.ts:54-60`

```ts
/** Hero arama önerisi — kısa önbellek, sorgu başına. */
@Get("suggest")
@Header("Cache-Control", "public, max-age=0, s-maxage=120, stale-while-revalidate=600")
suggest(@Query("q") q?: string) {
  return this.service.suggest((q ?? "").slice(0, 80));
}
```

Query hard-truncated to 80 chars at the controller.

Implementation — `apps/api/src/modules/public-marketplace/public-marketplace.service.ts:401-436`:

```ts
async suggest(raw: string) {
  const q = raw.trim();
  if (q.length < 2) return { products: [], categories: [], companies: [] };
  const tokens = tokenizeQuery(q);
  const [products, categories, companies] = await Promise.all([
    this.prisma.companyItem.findMany({
      where: { ...publicProductWhere(), ...(tokens.length ? { AND: productSearchClauses(q) } : {}) },
      select: { name: true, slug: true, company: { select: { slug: true } } },
      orderBy: [{ completionScore: "desc" }],
      take: 5,
    }),
    this.prisma.category.findMany({
      where: {
        inDiscovery: true,
        level: { gte: 2 },
        AND: tokens.map((t) => ({ searchText: { contains: foldSearchText(t) } })),
      },
      select: { id: true, nameTr: true, level: true },
      orderBy: [{ level: "asc" }],
      take: 5,
    }),
    this.prisma.company.findMany({
      where: { ...PUBLIC_PROFILE_WHERE, name: { contains: q, mode: "insensitive" } },
      select: { name: true, slug: true, city: true },
      take: 5,
    }),
  ]);
  return {
    products: products.map((p) => ({ name: p.name, slug: p.slug ?? "", companySlug: p.company.slug ?? "" })),
    categories: categories.map((c) => ({ id: c.id, name: c.nameTr, level: c.level })),
    companies: companies.map((c) => ({ name: c.name, slug: c.slug as string, city: c.city })),
  };
}
```

**Scopes: three — products, categories, companies.** 5 each, one `Promise.all`.

- products: gated by `publicProductWhere()`, matched by `productSearchClauses(q)`
  (token-folded), ranked by `completionScore desc`
- categories: `inDiscovery: true`, **`level >= 2`** (segments excluded), all tokens
  AND-ed against the folded `searchText`, ordered `level asc` (broader first)
- companies: `PUBLIC_PROFILE_WHERE` + case-insensitive `name contains`
- minimum length **2**, enforced server-side at `:403`

Sibling endpoints on the same controller (`@Controller("public")` at `:26`):

| Route | Line | Cache |
|---|---|---|
| `GET /public/listings` | `:41-46` | |
| `GET /public/stats` | `:48-52` | `s-maxage=600, swr=1800` |
| `GET /public/suggest` | `:55-60` | `s-maxage=120, swr=600` |
| `GET /public/products/featured` | `:62-…` | |
| `GET /public/listings/facets` | `:69-…` | |
| `GET /public/listings/sitemap` | `:76-…` | |
| `GET /public/products` | `:91-94` | |
| `GET /public/products/facets` | `:102-106` | `s-maxage=600, swr=1800` |
| `GET /public/listings/:number` | `:112-116` | `s-maxage=120, swr=600` — declared **after** the static routes so "facets"/"sitemap" are not read as a number (`:108-111`) |

`stats()` at `:439-…` also feeds the homepage: counts at `:443-460`, and
`popularCategories` derived at `:461-471` by folding product `categoryId`s to their
**L3 class** (`slice(0,6) + "00"`) and taking the top 20 — there is no search log
(comment `:461-462`).

### 5.2 Web hero search components

**`apps/web/src/components/marketplace/hero-search.tsx`** (166 lines, `"use client"`)

Header `:10-18`:

> HERO ARAMASI — İKİ sekme (Ürünler · Firmalar, Europages kalıbı) + yazarken öneri
> (ürün + kategori + firma; `GET public/suggest`). Düz `<form method="get">` —
> JavaScript kapalıyken de varsayılan sekmeye (ürünler) arama yapar; sekme yalnız
> `action`ı değiştirir. Öneri kutusu ilerleyici: gelmezse arama yine çalışır. Alım
> talepleri arama sekmesinde DEĞİL — talep gizli/cezbedici, listesi header'dan bir tık.

- `HeroSearchTab` interface `:19-24`: `{ key: "products" | "companies", label, action, placeholder }`
- `EMPTY: SuggestResult` `:26`
- state `:29-33`; `timer` ref for debounce `:33`
- **debounce effect `:35-57`:**

```ts
useEffect(() => {
  if (timer.current) clearTimeout(timer.current);
  const term = q.trim();
  if (term.length < 2) { setSug(EMPTY); return; }
  timer.current = setTimeout(async () => {
    try {
      const base = resolveApiBaseUrl();
      if (!base) return;
      const res = await fetch(`${base}/public/suggest?q=${encodeURIComponent(term)}`);
      if (!res.ok) return;
      setSug((await res.json()) as SuggestResult);
      setOpen(true);
    } catch { /* öneri yoksa arama yine çalışır */ }
  }, 200);
  return () => { if (timer.current) clearTimeout(timer.current); };
}, [q]);
```

  - **debounce = 200 ms** (`:56`)
  - **min length = 2** (`:37`)
  - direct `fetch` to `${resolveApiBaseUrl()}/public/suggest` — not TanStack Query
  - failures are swallowed; the plain form still submits
- `hasSug` `:59` — true when any of the three groups is non-empty
- tablist `:63-83`: `role="tablist"`, `aria-label="Nerede aransın"`, tab buttons with
  `aria-selected`; switching a tab only changes the form `action`
- dropdown renders all three scopes, categories linking through `categoryPath`
  (import `:5`)
- `SuggestResult` type imported from `@/lib/public/marketplace-api` (`:7`)

**`apps/web/src/components/marketplace/hero.tsx`** (105 lines) — the only consumer:

- `tabs` defined `:22-35`:
  - products: `action: MARKETPLACE_ROUTES.products` (`:26`),
    placeholder `"Ürün, marka veya parça numarası"` (`:27`)
  - companies: `action: MARKETPLACE_ROUTES.companies` (`:32`),
    placeholder `"Firma adı, sektör veya hizmet"` (`:33`)
- `:53-55` sentinel: `<div data-hero-search className="mx-auto mt-9 max-w-2xl">` —
  the header and the floating CTA watch this element (`useHeroGone`)
- `:56` `<HeroSearch tabs={tabs} />`

**`apps/web/src/components/marketplace/search-form.tsx`** (80 lines) — no JS at all:

Header `:3-13`:

> Arama — DÜZ HTML FORM, client JS yok. `method="get"` ile tarayıcı alanları kendi
> query string'ine çevirir; sayfa sunucuda yeniden render edilir. Bunu bilinçli
> seçtim: pazar yerinin ilk ekranı statik/ISR üretilebilsin ve arama JavaScript
> kapalıyken de çalışsın (tarayıcı botları da öyle gezer).

- props `:15-30`: `action`, `defaultValue`, `placeholder` (default
  `"Ne arıyorsunuz? (ürün, hizmet, malzeme)"`), `hidden`, `hiddenList`, `size`
- `hiddenList` is a separate prop because repeated filters (nitelik) carry multiple
  values under one key, which `Record<string,string>` cannot express (`:28-30`)
- **no typeahead**
- single consumer: `components/marketplace/public-list-page.tsx:2` (import), `:73` (render)

**Panel counterpart — `apps/web/src/components/dashboard/panel-hero-search.tsx`**

- Suggestions are **supplied by the caller**: props `suggestions` (`:64`, typed `:78`)
  and `onQueryChange` (`:65`, typed `:79`); header `:24` states the box owns no data.
- min length 2 at `:115`: `const hasSug = !aiActive && q.trim().length >= 2 && suggestions.some((g) => g.rows.length > 0)`
- AI toggle at `:166` ("Ara | ✨ AI ile ara" pill)
- suggestion list rendered `:258-…`; chips `:287-…`
- filter preservation `:108`: `new URLSearchParams(action === pathname ? (sp?.toString() ?? "") : "")`
- **No debounce inside the component**; `onQueryChange` fires on every keystroke
  (`:225`).

Callers:

- `app/company/(authed)/satinalma/page.tsx:145` renders it, `:153` wires
  `onQueryChange={setTerm}`. State `:90-91`
  (`const [term, setTerm] = useState(""); const q = term.trim();`), then
  `:92-93`:

```ts
const sugProducts  = useDiscoverProducts({ q, limit: 5 }, q.length >= 2);
const sugCompanies = useCompanySearch({ q }, q.length >= 2);
```

  Suggestion groups assembled `:94-…`: **categories 3** (filtered client-side from
  `facets.data.categories`, `:97-100`), **products 5** (`:101-106`),
  **companies 3** (`:107-…`, excluding self and rows without a `rothernId`).
- `components/dashboard/satis-dashboard-view.tsx:181` renders it, `:189`
  `onQueryChange={setTerm}` (seller side: open demands + sectors).
- Test: `components/dashboard/__tests__/panel-hero-search.test.tsx`.

**Debounce gap (fact, not a recommendation):** the panel path has **no debounce** —
every keystroke past 2 characters triggers `useDiscoverProducts` and
`useCompanySearch`. TanStack Query dedupes/caches per key but does not delay.
A hook exists and is unused here: `apps/web/src/hooks/use-debounced-value.ts:5`
`export function useDebouncedValue<T>(value: T, delay = 300): T`.
The public hero (`hero-search.tsx:56`) is the only search path with an explicit
debounce (200 ms).

---

### Summary of "not found" results

- No mega-menu / subcategory dropdown component anywhere in the public UI.
- No shared public button component (`PublicButton` / `CtaButton` / `MarketplaceButton`).
- No shared `VerifiedBadge` component.
- No `next/image` usage with `fill` and no `sizes`.
- `components/marketplace/category-image.tsx` has no importers outside
  `components/marketplace/` (4 internal consumers only).
