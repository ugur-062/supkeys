/**
 * GERİ/İLERİ SONRASI BAYAT SAYFA KORUMASI (arayüz testi D-283 / DN-07).
 *
 * Belirti: sipariş listesinde bir karta tıklayıp adres `/company/siparis/<id>`
 * olur olmaz Geri'ye basınca adres listeye döner ama ekranda sipariş detayı
 * kalır (masaüstünde 5'te 4).
 *
 * Kök neden (Next 15.5 App Router, uygulama kodu değil): `loading.tsx` olan
 * düzenlerde otomatik ön-getirme yalnız yükleme sınırına kadar iner; sayfa
 * kesiminin verisi yoktur. Gezinme yükleme iskeletiyle anında işlenir (adres
 * değişir), `layout-router` eksik veriyi kendisi ister ve yanıt gelince
 * `ACTION_SERVER_PATCH` gönderir. Bu arada Geri basılırsa `popstate` →
 * `ACTION_RESTORE` liste ağacını doğru geri yükler; ~60-130 ms sonra gelen
 * bayat yama ise `serverPatchReducer`da "hâlâ geçerli mi" denetimi olmadan
 * (yalnız kesim yolu ağaçta var mı diye bakılır) GERİ YÜKLENMİŞ liste ağacına
 * uygulanır: ağaç yeniden detaya döner, `canonicalUrl` liste kalır, Next de
 * liste girdisinin geçmiş durumunu detay ağacıyla ezer. Sonuç: adres liste,
 * ekran detay; yenilemeden düzelmez.
 *
 * Çare: Geri/İleri'den sonra kısa bir pencere boyunca İŞLENMİŞ ağaç
 * (`useSelectedLayoutSegments`) `popstate`in taşıdığı ağaçla karşılaştırılır.
 * Adres (yol) değişmemişken ağaç başka bir sayfayı gösteriyor VE Next bu
 * girdinin geçmiş durumuna başka bir ağaç yazmışsa (yalnız işlenmiş bir durum
 * yazılır; geri yükleme henüz sürüyorsa geçmiş durumu `popstate`inkiyle
 * aynıdır → dokunulmaz) bu yalnız bayat yamadan olabilir: `popstate`in ağacı
 * geçmiş girdisine geri yazılır ve aynı olay yeniden gönderilir — Next'in
 * kendi geri yükleme yolu (ağ isteği yok, önbellekten). Döngüye karşı her
 * gerçek Geri/İleri için en çok `MAX_REPAIRS` onarım.
 *
 * Next'e yama (pnpm patch) yerine bu yol seçildi: yama üç Dockerfile'ı ve
 * kilit dosyasını değiştirirdi. Next yükseltmesinde (`serverPatchReducer` bayat
 * yamayı atıyorsa) bu koruma hiçbir şey yapmadan durur; kaldırılabilir.
 */

/** Next'in geçmiş durumunda taşıdığı yönlendirici ağacı (FlightRouterState) anahtarı. */
export const NEXT_TREE_KEY = "__PRIVATE_NEXTJS_INTERNALS_TREE";
const PAGE_SEGMENT_KEY = "__PAGE__";

/** Bayat yama Geri'den bu kadar sonra bile gelebilir (yavaş ağ). */
export const GUARD_WINDOW_MS = 10_000;
/** Geçişler toplu işlenip ara durum hiç çizilmezse diye ek denetim anları. */
export const GUARD_CHECK_DELAYS_MS = [400, 1500, 4000] as const;
/** Birden çok bayat yama (farklı kesimlerin tembel istekleri) için üst sınır. */
export const MAX_REPAIRS = 2;

type HistoryState = Record<string, unknown> & { __NA?: boolean };

/**
 * Ağacın etkin kesim yolu — `useSelectedLayoutSegments`in kökten itibaren
 * verdiği dizinin aynısı (dinamik kesim → değeri; `__PAGE__`ta durur).
 * Ağaç tanınmıyorsa `null`.
 */
export function treeSegmentPath(tree: unknown): string[] | null {
  if (!Array.isArray(tree) || typeof tree[1] !== "object" || tree[1] === null) return null;
  const out: string[] = [];
  let node: unknown = tree;
  for (let depth = 0; depth < 64; depth++) {
    const routes = (node as unknown[])[1] as Record<string, unknown> | undefined;
    if (!routes || typeof routes !== "object") break;
    const child = (routes.children ?? Object.values(routes)[0]) as unknown[] | undefined;
    if (!Array.isArray(child)) break;
    const seg = child[0];
    const value = Array.isArray(seg) ? seg[1] : seg;
    if (typeof value !== "string" || !value || value.startsWith(PAGE_SEGMENT_KEY)) break;
    out.push(value);
    node = child;
  }
  return out;
}

function sameSegments(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((s, i) => s === b[i]);
}

export interface PopstateRestoreGuardOptions {
  /** İşlenmiş ağacın kesimleri (koruyucunun bulunduğu düzenin altından). */
  getSegments: () => readonly string[];
  /** Koruyucunun bulunduğu düzenin kökten derinliği (`[locale]` düzeni → 1). */
  depth: number;
  win?: Window;
  now?: () => number;
}

export interface PopstateRestoreGuard {
  /** İşlenmiş ağaç değişti (bileşen efekti çağırır). */
  check: () => void;
  dispose: () => void;
}

export function installPopstateRestoreGuard(
  opts: PopstateRestoreGuardOptions,
): PopstateRestoreGuard {
  const win = opts.win ?? window;
  const now = opts.now ?? Date.now;
  let pending: {
    state: HistoryState;
    expected: string[];
    pathname: string;
    at: number;
    repairs: number;
  } | null = null;
  let dispatching = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const check = () => {
    const p = pending;
    if (!p || p.repairs >= MAX_REPAIRS) return;
    if (now() - p.at > GUARD_WINDOW_MS || win.location.pathname !== p.pathname) {
      pending = null; // yeni bir gezinme oldu ya da pencere kapandı
      return;
    }
    if (sameSegments(opts.getSegments(), p.expected)) return; // ağaç doğru
    // Next bu girdiye başka bir ağaç İŞLEMEDİyse geri yükleme hâlâ sürüyordur.
    const written = treeSegmentPath((win.history.state as HistoryState | null)?.[NEXT_TREE_KEY]);
    if (!written || sameSegments(written.slice(opts.depth), p.expected)) return;
    p.repairs += 1;
    try {
      // Ezilen geçmiş durumunu geri yaz, Next'in geri yüklemesini yeniden tetikle.
      win.history.replaceState(p.state, "", win.location.href);
      dispatching = true;
      win.dispatchEvent(new PopStateEvent("popstate", { state: p.state }));
    } catch {
      /* onarılamadı — en kötü ihtimalle eski davranış */
    } finally {
      dispatching = false;
    }
  };

  const onPopState = (e: PopStateEvent) => {
    if (dispatching) return; // kendi gönderdiğimiz olay
    const state = e.state as HistoryState | null;
    const full = state && state.__NA ? treeSegmentPath(state[NEXT_TREE_KEY]) : null;
    if (!state || !full) {
      pending = null;
      return;
    }
    pending = {
      state,
      expected: full.slice(opts.depth),
      pathname: win.location.pathname,
      at: now(),
      repairs: 0,
    };
    for (const ms of GUARD_CHECK_DELAYS_MS) {
      const t = setTimeout(() => {
        timers.delete(t);
        check();
      }, ms);
      timers.add(t);
    }
  };

  win.addEventListener("popstate", onPopState);
  return {
    check,
    dispose: () => {
      win.removeEventListener("popstate", onPopState);
      for (const t of timers) clearTimeout(t);
      timers.clear();
      pending = null;
    },
  };
}
