/**
 * DOSYA İNDİRME VE YAZDIRMA — TEK YOL (mobil kabuk 2026-10-16).
 *
 * Tarayıcıda bugünkü davranış aynen sürer: `<a download>` + `URL.createObjectURL`
 * ile indirme, `about:blank` penceresine yazılıp yazdırılan belge. Mobil kabukta
 * (Capacitor WebView) ikisi de çalışmaz — WebView `blob:` indirmesini yok sayar,
 * `window.open` pencere açmaz. Kabukta:
 *  - dosya → kabuğun `Filesystem` eklentisiyle önbellek klasörüne yazılır, sonra
 *    `Share` eklentisinin paylaşım sayfasıyla verilir (Dosyalar'a kaydet, e-posta…);
 *  - yazdırma → kabuğun kendi `RothernPrint` eklentisi sistem yazdırma penceresini
 *    açar ("PDF olarak kaydet" orada).
 * Eklentileri taşımayan ESKİ uygulama sürümü `"unsupported"` alır; çağıran
 * kullanıcıya işlemi siteden yapmasını söyler (`hooks/use-save-file.ts`).
 *
 * Kural: uygulama kodu `URL.createObjectURL` + `<a download>` ya da
 * `window.print` / yazdırma penceresini DOĞRUDAN kullanmaz — buradan geçer.
 * Web paketinde Capacitor bağımlılığı yoktur; eklentiler kabuğun enjekte ettiği
 * `window.Capacitor.Plugins`ten okunur (`lib/native-shell.ts`).
 */
import {
  isNativeShell,
  nativeFilesystemPlugin,
  nativePrintPlugin,
  nativeSharePlugin,
} from "./native-shell";

/**
 * `downloaded`: tarayıcı indirmesi başladı · `shared`: kabukta paylaşım sayfası
 * tamamlandı · `cancelled`: kullanıcı paylaşım sayfasını kapattı (hata değil) ·
 * `unsupported`: kabuğun bu sürümünde eklenti yok.
 */
export type SaveFileOutcome = "downloaded" | "shared" | "cancelled" | "unsupported";

/**
 * `printed`: yazdırma penceresi açıldı · `blocked`: tarayıcı açılır pencereyi
 * engelledi (çağıran söyler) · `unsupported`: kabuğun bu sürümünde eklenti yok.
 */
export type PrintOutcome = "printed" | "blocked" | "unsupported";

/**
 * Nesne adresi tıklamadan hemen sonra DEĞİL, bir süre sonra bırakılır: bazı
 * tarayıcılar (Firefox, Safari) indirmeyi tıklamadan sonra başlatır ve hemen
 * bırakılan adres boş / bozuk dosya indirir.
 */
export const REVOKE_DELAY_MS = 1_000;

/** Dosya adı (uzantı hariç) üst sınırı — Android'in 255 bayt sınırının güvenli altı. */
const MAX_BASE_LENGTH = 100;

/**
 * Önbelleğe yazılacak güvenli dosya adı: yol ve dosya sistemi ayırıcıları
 * (`/ \ : * ? " < > |`) ve denetim karakterleri atılır, baştaki nokta / boşluk
 * düşer (gizli dosya ya da `..` olmaz), uzantı korunur. Türkçe (ve her Unicode)
 * harf KALIR; ad boş kalırsa `fallback`.
 */
export function safeFileName(name: string, fallback = "dosya"): string {
  const cleaned = String(name ?? "")
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && /^\.[\p{L}\p{N}]{1,10}$/u.test(cleaned.slice(dot)) ? cleaned.slice(dot) : "";
  const stripped = (ext ? cleaned.slice(0, dot) : cleaned).replace(/^[.\s-]+/, "").replace(/[.\s]+$/, "");
  // Kod noktası başına kırp: UTF-16 `slice` vekil çiftini (emoji) ortadan bölüp
  // geçersiz dosya adı üretirdi.
  const base = Array.from(stripped)
    .slice(0, MAX_BASE_LENGTH)
    .join("")
    .replace(/[.\s]+$/, "");
  return `${base || fallback}${ext}`;
}

/** Blob → base64 (`data:…;base64,` öneki olmadan) — `Filesystem.writeFile` biçimi. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.onload = () => {
      const s = String(reader.result ?? "");
      // Boş blob'da bazı motorlar virgülsüz "data:" döner — öneki veri sanma.
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : "");
    };
    reader.readAsDataURL(blob);
  });
}

function errorText(err: unknown): string {
  if (typeof err === "string") return err;
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" ? message : "";
}

/** Paylaşım sayfasını kullanıcı kapattı (iOS / Android "Share canceled"). */
export function isUserCancel(err: unknown): boolean {
  return /cancell?ed/i.test(errorText(err));
}

/**
 * Eklenti adı köprüde var ama bu platformda / sürümde yöntemi yok (Capacitor
 * `UNIMPLEMENTED`) — eksik eklenti gibi ele alınır.
 */
function isUnimplemented(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === "UNIMPLEMENTED" || /not implemented/i.test(errorText(err));
}

function currentWindow(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

/** Tarayıcı indirmesi — bugünkü yol, bire bir. */
function downloadInBrowser(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}

/**
 * Dosyayı kullanıcıya verir. Tarayıcıda indirir; kabukta önbelleğe yazıp
 * paylaşım sayfasını açar (`title` paylaşım sayfasının başlığı, yoksa dosya
 * adı). Kullanıcının kapattığı paylaşım `cancelled` (sessiz); eklentisiz eski
 * kabuk `unsupported`. Başka yerel hata FIRLATILIR.
 */
export async function saveFile(
  blob: Blob,
  filename: string,
  opts: { title?: string } = {},
): Promise<SaveFileOutcome> {
  const win = currentWindow();
  if (!isNativeShell(win)) {
    downloadInBrowser(blob, filename);
    return "downloaded";
  }
  const fs = nativeFilesystemPlugin(win);
  const share = nativeSharePlugin(win);
  if (!fs || !share) return "unsupported";
  const path = safeFileName(filename);
  try {
    const data = await blobToBase64(blob);
    const written = await fs.writeFile({ path, data, directory: "CACHE" });
    if (!written?.uri) throw new Error("Filesystem.writeFile returned no uri");
    const title = opts.title?.trim() || path;
    await share.share({ title, dialogTitle: title, files: [written.uri] });
    return "shared";
  } catch (err) {
    if (isUnimplemented(err)) return "unsupported";
    if (isUserCancel(err)) return "cancelled";
    throw err;
  }
}

/**
 * Tarayıcı yazdırması — sipariş sayfasının önceki yolu, bire bir: boş pencere
 * aç, belgeyi yaz, kapat, odakla, yazdır. Yazdırmayı EBEVEYN tetikler — üretilen
 * HTML'de inline `<script>` yok (strict CSP `script-src`'i `about:blank`
 * pencerede miras alınan nonce'suz inline'ı bloklardı). Harici kaynak yoksa
 * (sistem fontu, resim yok) `close` sonrası içerik hazırdır.
 */
function printInBrowser(win: Window | undefined, html: string): PrintOutcome {
  const w = win?.open("", "_blank", "width=800,height=900");
  if (!w) return "blocked";
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
  return "printed";
}

/**
 * Tam HTML belgesini yazdırır. Tarayıcıda yeni pencere (açılır pencere
 * engellenirse `blocked`); kabukta `RothernPrint` eklentisi (`name` iş / PDF
 * adı, uzantısız); eklentisiz eski kabuk `unsupported`. Başka yerel hata
 * FIRLATILIR.
 *
 * Tarayıcı yolu ilk `await`ten ÖNCE, yani tıklamanın kullanıcı etkinliği
 * içinde pencere açar — çağıran belgeyi tıklama işleyicisinde eşzamanlı
 * üretip buraya vermeli.
 */
export async function printHtml(html: string, name: string): Promise<PrintOutcome> {
  const win = currentWindow();
  if (!isNativeShell(win)) return printInBrowser(win, html);
  const printer = nativePrintPlugin(win);
  if (!printer) return "unsupported";
  try {
    const job = safeFileName(name, "rothern");
    await printer.print({ html, name: job });
    return "printed";
  } catch (err) {
    if (isUnimplemented(err)) return "unsupported";
    throw err;
  }
}
