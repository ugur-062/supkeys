import type { MulticastMessage } from "firebase-admin/messaging";

/**
 * What a push needs from an in-app notification row (`notifications` table
 * or the row data `NotificationService` just wrote). Text is already in the
 * recipient's language.
 */
export interface PushNotificationRow {
  companyUserId: string;
  type: string;
  title: string;
  body: string;
  ctaUrl: string | null;
}

/** FCM `sendEachForMulticast` takes at most this many tokens per call. */
export const FCM_MULTICAST_LIMIT = 500;

/** Body length shown on the lock screen (characters, not bytes). */
export const PUSH_BODY_MAX_CHARS = 200;

/** Android notification channel (created by the web client on Android). */
export const ANDROID_CHANNEL_ID = "default";
/** Android small icon drawable (white mark on transparent). */
export const ANDROID_SMALL_ICON = "ic_stat_rothern";
export const ANDROID_ICON_COLOR = "#0A0A0A";

const ELLIPSIS = "…";

/** Cuts at a code point boundary and appends an ellipsis when too long. */
export function truncatePushBody(
  body: string,
  max: number = PUSH_BODY_MAX_CHARS,
): string {
  const chars = Array.from(body.trim());
  if (chars.length <= max) return chars.join("");
  return `${chars.slice(0, max - 1).join("").trimEnd()}${ELLIPSIS}`;
}

const ABSOLUTE = /^https?:\/\//i;

/**
 * Row `ctaUrl` -> absolute address for the app to open. Rows store either an
 * absolute address or an app path (`/company/...`, `ctaPath` callers); a path
 * gets the web origin. Anything else (protocol-relative, other schemes) is
 * dropped: the app only opens same-origin addresses anyway.
 */
export function absolutePushUrl(
  ctaUrl: string | null | undefined,
  webUrl: string,
): string | null {
  const url = ctaUrl?.trim();
  if (!url) return null;
  if (ABSOLUTE.test(url)) return url;
  if (url.startsWith("/") && !url.startsWith("//")) {
    return `${webUrl.replace(/\/+$/, "")}${url}`;
  }
  return null;
}

/**
 * Where a tap goes when the row has no target of its own: the in-app
 * notifications list (internal path; the web redirects to the reader's
 * language). Without it a tap only brought the app to the front.
 */
export const PUSH_FALLBACK_PATH = "/company/bildirimler";

/** One FCM multicast message for the given tokens (contract shared with the app). */
export function buildPushMessage(
  row: PushNotificationRow,
  tokens: string[],
  webUrl: string,
): MulticastMessage {
  const url =
    absolutePushUrl(row.ctaUrl, webUrl) ?? absolutePushUrl(PUSH_FALLBACK_PATH, webUrl);
  return {
    tokens,
    notification: {
      title: row.title,
      body: truncatePushBody(row.body),
    },
    data: {
      type: row.type,
      ...(url ? { url } : {}),
    },
    android: {
      priority: "high",
      notification: {
        channelId: ANDROID_CHANNEL_ID,
        icon: ANDROID_SMALL_ICON,
        color: ANDROID_ICON_COLOR,
      },
    },
    apns: {
      payload: {
        aps: { sound: "default" },
      },
    },
  };
}
