"use client";

import { NOTIFICATION_KEY } from "@/hooks/use-notifications";
import { companyApi } from "@/lib/company-auth/api";
import { isCompanyLoggingOut } from "@/lib/company-auth/logout-flag";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import {
  PUSH_CHANNEL_ID,
  PUSH_DEVICES_PATH,
  clearPendingPushUnregister,
  markPushStarted,
  nativePush,
  pushStartedThisSession,
  pushTokenValue,
  runPushDeviceRequest,
  storePushToken,
  unmarkPushStarted,
} from "@/lib/native-push";
import { nativeListener } from "@/lib/native-shell";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

/**
 * Android kanal önemi: 4 = yüksek (bildirim ekranın üstünde belirir). Kanal
 * bir kez oluşunca uygulama önemini DEĞİŞTİREMEZ (yalnız kullanıcı); ad her
 * açılışta güncellenir (dil değişimi yansır).
 */
const CHANNEL_IMPORTANCE = 4;

/**
 * Mobil kabukta anlık bildirim kaydı — firma panelinin oturumlu düzeninde bir
 * kez kurulur; hiçbir şey çizmez, tarayıcıda hiçbir şey yapmaz, hiçbir yolda
 * fırlatmaz.
 *
 * Oturum bilinince (kullanıcı + `/me` eşitlendi) uygulama açılışı başına bir
 * kez (`PUSH_SESSION_KEY`): izin sorulmamışsa ("prompt") bir kez sorulur;
 * verildiyse Android'de önce `default` kanalı (yerelleştirilmiş adla) kurulur,
 * sonra `register()`. `registration` olayında belirteç saklanır ve sunucuya
 * platformla yazılır (belirteç yenilenince de); `register()` istenmeden gelen
 * belirteç (eklentinin açılışta sakladığı) yok sayılır. Akış ancak belirteç (ya da kayıt
 * hatası) GELİNCE biter: `register()` hemen çözülür, belirteç sonra olay olarak
 * gelir ve iOS olayı dinleyicisiz anda düşürür — arada sökülen kurulum işareti
 * geri alır, sonraki kurulum yeniden kaydolur. Çıkış sürerken ya da oturum
 * düştükten sonra gelen belirteç yazılmaz. Kayıt hatası görünmez. Uygulama
 * öndeyken gelen bildirim bir şey göstermez — zil ve Bildirimler sayfası
 * tazelenir (uygulama içi canlı kartlar zaten `LiveToasts`ta). Bildirime
 * dokunma kök düzendeki `NativeShellBridge`'de (soğuk açılışta erken kurulsun).
 */
export function NativePushRegistrar() {
  const userId = useCompanyAuthStore((s) => s.user?.id ?? null);
  const synced = useCompanyAuthStore((s) => s.permissionsSynced);
  const queryClient = useQueryClient();
  const t = useTranslations("web.panel.shell.nativePush");
  const channelName = t("channelName");

  useEffect(() => {
    if (!userId || !synced) return;
    const push = nativePush(window);
    if (!push) return;
    const { plugin, platform } = push;
    let disposed = false;
    let finished = false;
    // Bu kurulum `register()` istedi mi. Android eklentisi FCM'nin açılışta
    // kendiliğinden ürettiği belirteci saklayıp İLK dinleyiciye verir; izin
    // sorulmadan (ya da reddedilmişken) o belirteç sunucuya yazılmasın.
    let requested = false;

    const registration = nativeListener(() =>
      plugin.addListener("registration", (token) => {
        const value = pushTokenValue(token);
        if (!value || disposed || !requested) return;
        // Çıkış bu cihazı sunucudan siliyor; oturum düştüyse (401 anlık
        // görüntüyü sildi, söküm henüz koşmadı) kayıt zaten reddedilir. İkisinde
        // de yazılan kayıt çıkan kişiye bağlı kalırdı.
        if (isCompanyLoggingOut() || useCompanyAuthStore.getState().user?.id !== userId) return;
        finished = true;
        // Önce saklanır: kayıt isteği sürerken çıkılırsa çıkış belirteci bilsin
        // (ve silmeyi bu isteğin ardından göndersin).
        storePushToken(value);
        void runPushDeviceRequest(() =>
          companyApi.post(PUSH_DEVICES_PATH, { token: value, platform }, { skipErrorToast: true }),
        ).then(
          // Yeniden bağlandı: önceki çıkıştan kalan silme artık gereksiz (ve zararlı).
          () => clearPendingPushUnregister(value),
          () => {
            // Görünür bir şey yok. İşaret kalkar: sonraki kurulum / tam yükleme
            // yeniden kaydolur (o yüklemedeki bekleyen silmenin ardından).
            unmarkPushStarted(userId);
          },
        );
      }),
    );
    const registrationError = nativeListener(() =>
      plugin.addListener("registrationError", () => {
        // Bilerek sessiz: kullanıcıya gösterilecek bir eylem yok.
        if (!disposed) finished = true;
      }),
    );
    const received = nativeListener(() =>
      plugin.addListener("pushNotificationReceived", () => {
        void queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEY });
      }),
    );

    const start = async () => {
      if (pushStartedThisSession(userId)) {
        finished = true;
        return;
      }
      markPushStarted(userId);
      let state = (await plugin.checkPermissions())?.receive;
      if (disposed) return;
      if (state === "prompt") {
        state = (await plugin.requestPermissions())?.receive;
        if (disposed) return;
      }
      if (state !== "granted") {
        finished = true;
        return;
      }
      if (platform === "android" && typeof plugin.createChannel === "function") {
        try {
          await plugin.createChannel({
            id: PUSH_CHANNEL_ID,
            name: channelName,
            importance: CHANNEL_IMPORTANCE,
            vibration: true,
          });
        } catch {
          // Android 8 öncesi kanal yok (unavailable); kayıt yine yapılır.
        }
        if (disposed) return;
      }
      // Belirteç olayı kaçmasın: dinleyici kurulmadan kayıt istenmez.
      await registration.ready;
      if (disposed) return;
      // `finished` burada KONMAZ: iki eklenti de `register()`ı hemen çözer,
      // belirteç sonra `registration` olayıyla gelir (bkz. dinleyici). Her
      // `register()` belirteci yeniden yayımlar; öncekinin yok sayılması
      // kayıt kaybettirmez.
      requested = true;
      await plugin.register();
    };
    void start().catch(() => {
      finished = true;
    });

    return () => {
      disposed = true;
      registration.remove();
      registrationError.remove();
      received.remove();
      // Akış yarıda kaldıysa (belirteç henüz gelmediyse de) sonraki kurulumda
      // (ya da tam yüklemede) yeniden koşsun.
      if (!finished) unmarkPushStarted(userId);
    };
  }, [userId, synced, channelName, queryClient]);

  return null;
}
