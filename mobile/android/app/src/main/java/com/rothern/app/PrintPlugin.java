package com.rothern.app;

import android.app.Activity;
import android.content.Context;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.HashSet;
import java.util.Set;

/**
 * Yerel yazdırma köprüsü: web `window.Capacitor.Plugins.RothernPrint.print({ html, name })` çağırır.
 *
 * Kabukta `window.open` + `print()` çalışmaz (yeni pencere açılmaz). Bunun yerine HTML belge
 * ekrana EKLENMEYEN bir WebView'e yüklenir ve sistemin yazdırma penceresi
 * (`PrintManager` + `createPrintDocumentAdapter`) açılır; pencere "PDF olarak kaydet"i de sunar.
 * Çağrı pencere açıldığında çözülür. Eski uygulama sürümünde bu eklenti yoktur; web onu tanır ve
 * siteden yazdırmayı söyler.
 *
 * Belge JavaScript'siz yüklenir (web'in ürettiği yazdırma belgesi statiktir) ve içinde gezinme yapılmaz.
 */
@CapacitorPlugin(name = "RothernPrint")
public class PrintPlugin extends Plugin {

    private static final String DEFAULT_NAME = "Rothern";
    private static final int MAX_NAME_LENGTH = 120;

    /**
     * Yükleme sürerken ekrana bağlı olmayan WebView'i başka hiçbir şey tutmaz; çöp toplayıcı onu
     * `onPageFinished`ten önce silebilir (Android'in kendi yazdırma örneğindeki uyarı). Bu küme iş
     * oluşana kadar, ardından yazdırma penceresi kapanana (`onFinish`) kadar güçlü başvuruyu tutar.
     * Yalnız ana iş parçacığında okunur / yazılır.
     */
    private final Set<WebView> activeWebViews = new HashSet<>();

    @PluginMethod
    public void print(PluginCall call) {
        String html = call.getString("html");
        if (html == null || html.trim().isEmpty()) {
            call.reject("RothernPrint.print: \"html\" is required");
            return;
        }
        String jobName = safeJobName(call.getString("name"));

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing()) {
            call.reject("RothernPrint.print: the app is not in the foreground");
            return;
        }

        activity.runOnUiThread(() -> startPrint(activity, call, html, jobName));
    }

    private void startPrint(Activity activity, PluginCall call, String html, String jobName) {
        WebView webView;
        try {
            webView = new WebView(activity);
        } catch (Exception e) {
            call.reject("RothernPrint.print: could not create the print view", e);
            return;
        }
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        activeWebViews.add(webView);
        webView.setWebViewClient(
            new WebViewClient() {
                private boolean handled = false;

                @Override
                public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                    // Yazdırma belgesindeki bağlantı bu görünmez görünümde açılmaz.
                    return true;
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (handled) return;
                    handled = true;
                    try {
                        PrintManager printManager = (PrintManager) activity.getSystemService(Context.PRINT_SERVICE);
                        if (printManager == null) {
                            release(view);
                            call.reject("RothernPrint.print: printing is not available on this device");
                            return;
                        }
                        PrintDocumentAdapter adapter = new ReleasingAdapter(
                            view.createPrintDocumentAdapter(jobName),
                            () -> release(view)
                        );
                        printManager.print(jobName, adapter, new PrintAttributes.Builder().build());
                        call.resolve();
                    } catch (Exception e) {
                        release(view);
                        call.reject("RothernPrint.print: could not open the print dialog", e);
                    }
                }
            }
        );

        try {
            webView.loadDataWithBaseURL(baseUrl(), html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            release(webView);
            call.reject("RothernPrint.print: could not load the document", e);
        }
    }

    /** Göreli adresler (varsa) uygulamanın açtığı siteye çözülür; adres yoksa null. */
    private String baseUrl() {
        try {
            String serverUrl = getBridge().getServerUrl();
            if (serverUrl != null && !serverUrl.trim().isEmpty()) return serverUrl;
        } catch (Exception ignored) {
            // Yapılandırma okunamadı: göreli adres çözülmez, belge yine yazdırılır.
        }
        return null;
    }

    private void release(WebView webView) {
        new Handler(Looper.getMainLooper()).post(() -> {
            if (activeWebViews.remove(webView)) {
                webView.stopLoading();
                webView.destroy();
            }
        });
    }

    /** İş adı "PDF olarak kaydet"te önerilen dosya adı olur: yol / denetim karakteri taşımaz. */
    static String safeJobName(String raw) {
        if (raw == null) return DEFAULT_NAME;
        String cleaned = raw.replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]+", " ").replaceAll("\\s+", " ").trim();
        if (cleaned.isEmpty()) return DEFAULT_NAME;
        return cleaned.length() > MAX_NAME_LENGTH ? cleaned.substring(0, MAX_NAME_LENGTH).trim() : cleaned;
    }

    /** WebView'in bağdaştırıcısını aynen geçirir; yazdırma bitince (ya da iptalde) görünümü bırakır. */
    private static final class ReleasingAdapter extends PrintDocumentAdapter {

        private final PrintDocumentAdapter delegate;
        private final Runnable onFinished;

        ReleasingAdapter(PrintDocumentAdapter delegate, Runnable onFinished) {
            this.delegate = delegate;
            this.onFinished = onFinished;
        }

        @Override
        public void onStart() {
            delegate.onStart();
        }

        @Override
        public void onLayout(
            PrintAttributes oldAttributes,
            PrintAttributes newAttributes,
            CancellationSignal cancellationSignal,
            LayoutResultCallback callback,
            Bundle extras
        ) {
            delegate.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
        }

        @Override
        public void onWrite(
            PageRange[] pages,
            ParcelFileDescriptor destination,
            CancellationSignal cancellationSignal,
            WriteResultCallback callback
        ) {
            delegate.onWrite(pages, destination, cancellationSignal, callback);
        }

        @Override
        public void onFinish() {
            try {
                delegate.onFinish();
            } finally {
                onFinished.run();
            }
        }
    }
}
