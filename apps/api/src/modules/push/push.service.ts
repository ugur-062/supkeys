import {
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  BatchResponse,
  MulticastMessage,
} from "firebase-admin/messaging";
import { resolveWebUrl } from "../../common/config/web-url";
import { PrismaBypassService } from "../../common/prisma/prisma.service";
import {
  FIREBASE_SERVICE_ACCOUNT_ENV,
  parseFirebaseServiceAccount,
  type FirebaseServiceAccount,
  type FirebaseServiceAccountResult,
} from "./push-config";
import { PUSH_DEVICE_MAX_IDLE_MS } from "./push-device.service";
import {
  buildPushMessage,
  FCM_MULTICAST_LIMIT,
  type PushNotificationRow,
} from "./push-message";

/** The part of firebase-admin `Messaging` the service uses (mockable). */
export interface PushMessagingClient {
  sendEachForMulticast(message: MulticastMessage): Promise<BatchResponse>;
}

/**
 * DI token: a ready messaging client. Tests provide it; production leaves it
 * empty and the client is built lazily from FIREBASE_SERVICE_ACCOUNT_JSON.
 */
export const PUSH_MESSAGING_CLIENT = Symbol("PUSH_MESSAGING_CLIENT");

/**
 * Whether FCM's answer for ONE token means "this token is dead" (the device
 * row goes). firebase-admin's sendEach talks to the FCM v1 API, which maps:
 *  - UNREGISTERED / NOT_FOUND -> registration-token-not-registered (dead);
 *  - INVALID_ARGUMENT -> invalid-argument: a malformed token ("The
 *    registration token is not a valid FCM registration token"), but also a
 *    bad payload. The payload is the same for every token of a call, so only
 *    an error that names the registration token is the token's fault;
 *  - SENDER_ID_MISMATCH -> mismatched-credential (token of another Firebase
 *    project: dead), but PERMISSION_DENIED maps there too and that is a
 *    project-wide credential problem that would wipe every row. Dead only when
 *    the message names the sender id or another token of the same call went
 *    through (the credential works);
 *  - invalid-registration-token only comes from the legacy API mapping; kept
 *    for completeness.
 */
export function isDeadTokenError(
  error: { code?: string; message?: string } | undefined,
  batchHadSuccess: boolean,
): boolean {
  const code = error?.code;
  const message = error?.message ?? "";
  switch (code) {
    case "messaging/registration-token-not-registered":
    case "messaging/invalid-registration-token":
      return true;
    case "messaging/invalid-argument":
      return /registration token/i.test(message);
    case "messaging/mismatched-credential":
      return batchHadSuccess || /sender\s*id/i.test(message);
    default:
      return false;
  }
}

/** Stale rows deleted per statement (see removeStale). */
const STALE_DELETE_CHUNK = 1000;

/** Named firebase-admin app (never the default app: no clash with others). */
const FIREBASE_APP_NAME = "rothern-push";

/**
 * PUSH NOTIFICATIONS (2026-10-14, mobile app shell). Mirrors in-app
 * notification rows to the recipients' devices through FCM (Android and iOS).
 *
 * Rules:
 *  - Optional channel: no / bad FIREBASE_SERVICE_ACCOUNT_JSON -> disabled with
 *    one boot log line; disabled means no device query at all.
 *  - Never throws to the caller and is called fire-and-forget: a request never
 *    waits for FCM nor fails because of it.
 *  - Only devices of ACTIVE, non-deleted users get a message, and only those
 *    registered under the user's CURRENT session version and seen within
 *    PUSH_DEVICE_MAX_IDLE_MS. Others (session revoked: password change/reset,
 *    dropped sessions, e-mail change, deactivation; or idle) are deleted.
 *  - Tokens FCM reports as dead (see isDeadTokenError) are deleted; other
 *    failures are logged as warnings.
 *  - Bypass client: recipients span companies and there is no tenant context
 *    worth keeping (the table has no RLS policy).
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private readonly serviceAccount: FirebaseServiceAccountResult;
  private readonly webUrl: string;
  private messaging: Promise<PushMessagingClient | null> | null = null;
  /** Set when lazy init failed: stop trying (and logging) until restart. */
  private initFailed = false;

  constructor(
    private readonly prisma: PrismaBypassService,
    @Optional() config?: ConfigService,
    @Optional()
    @Inject(PUSH_MESSAGING_CLIENT)
    private readonly injectedClient?: PushMessagingClient,
  ) {
    const env = config ?? ({ get: (key: string) => process.env[key] } as ConfigService);
    this.serviceAccount = parseFirebaseServiceAccount(
      env.get<string>(FIREBASE_SERVICE_ACCOUNT_ENV),
    );
    this.webUrl = resolveWebUrl(env);
  }

  /** One line at boot: enabled (with the project id) or why it is off. */
  onModuleInit(): void {
    if (this.injectedClient) {
      this.logger.log("Push notifications enabled (injected messaging client)");
      return;
    }
    switch (this.serviceAccount.status) {
      case "ok":
        this.logger.log(
          `Push notifications enabled (Firebase project ${this.serviceAccount.account.projectId})`,
        );
        return;
      case "missing":
        this.logger.log(
          `Push notifications disabled: ${FIREBASE_SERVICE_ACCOUNT_ENV} is not set`,
        );
        return;
      case "invalid":
        this.logger.warn(
          `Push notifications disabled: ${FIREBASE_SERVICE_ACCOUNT_ENV} is invalid (${this.serviceAccount.reason})`,
        );
        return;
    }
  }

  /** Whether a send can happen at all (no query is made when false). */
  get enabled(): boolean {
    if (this.injectedClient) return true;
    return this.serviceAccount.status === "ok" && !this.initFailed;
  }

  /**
   * Sends one FCM message per notification row to the devices of its
   * recipient. Never throws; resolves when done (callers do not await it).
   */
  async sendForNotifications(
    rows: readonly PushNotificationRow[],
  ): Promise<void> {
    try {
      if (!this.enabled || rows.length === 0) return;
      await this.send(rows);
    } catch (err) {
      this.logger.warn(`Push send failed: ${errorText(err)}`);
    }
  }

  private async send(rows: readonly PushNotificationRow[]): Promise<void> {
    const userIds = [...new Set(rows.map((r) => r.companyUserId))];
    const devices = await this.prisma.pushDevice.findMany({
      where: {
        companyUserId: { in: userIds },
        companyUser: { isActive: true, deletedAt: null },
      },
      select: {
        id: true,
        token: true,
        companyUserId: true,
        tokenVersion: true,
        lastSeenAt: true,
        updatedAt: true,
        companyUser: { select: { tokenVersion: true } },
      },
    });
    if (devices.length === 0) return;

    const idleBefore = Date.now() - PUSH_DEVICE_MAX_IDLE_MS;
    const tokensOf = new Map<string, string[]>();
    const stale: { id: string; updatedAt: Date }[] = [];
    for (const d of devices) {
      if (
        d.tokenVersion !== d.companyUser.tokenVersion ||
        d.lastSeenAt.getTime() < idleBefore
      ) {
        stale.push({ id: d.id, updatedAt: d.updatedAt });
        continue;
      }
      const list = tokensOf.get(d.companyUserId) ?? [];
      list.push(d.token);
      tokensOf.set(d.companyUserId, list);
    }
    try {
      await this.sendToDevices(rows, tokensOf);
    } finally {
      await this.removeStale(stale);
    }
  }

  private async sendToDevices(
    rows: readonly PushNotificationRow[],
    tokensOf: ReadonlyMap<string, string[]>,
  ): Promise<void> {
    if (tokensOf.size === 0) return;

    // Rows with the same text (same language, same link) share one message:
    // a company fan-out writes one row per user, mostly identical.
    const groups = new Map<string, { row: PushNotificationRow; tokens: Set<string> }>();
    for (const row of rows) {
      const tokens = tokensOf.get(row.companyUserId);
      if (!tokens) continue;
      const key = JSON.stringify([row.type, row.title, row.body, row.ctaUrl ?? null]);
      const group = groups.get(key) ?? { row, tokens: new Set<string>() };
      for (const t of tokens) group.tokens.add(t);
      groups.set(key, group);
    }
    if (groups.size === 0) return;

    const client = await this.client();
    if (!client) return;

    const dead = new Set<string>();
    for (const { row, tokens } of groups.values()) {
      const all = [...tokens];
      for (let i = 0; i < all.length; i += FCM_MULTICAST_LIMIT) {
        const batch = all.slice(i, i + FCM_MULTICAST_LIMIT);
        await this.sendBatch(client, row, batch, dead);
      }
    }

    if (dead.size > 0) {
      const removed = await this.prisma.pushDevice.deleteMany({
        where: { token: { in: [...dead] } },
      });
      this.logger.log(`Push: removed ${removed.count} dead device token(s)`);
    }
  }

  /**
   * Deletes rows of revoked sessions / idle devices. A row re-registered since
   * it was read (new session, fresh lastSeenAt: updatedAt moved) stays.
   */
  private async removeStale(
    stale: readonly { id: string; updatedAt: Date }[],
  ): Promise<void> {
    let count = 0;
    // Chunked: two bind parameters per row, far below Postgres' limit.
    for (let i = 0; i < stale.length; i += STALE_DELETE_CHUNK) {
      const chunk = stale.slice(i, i + STALE_DELETE_CHUNK);
      const removed = await this.prisma.pushDevice.deleteMany({
        where: { OR: chunk.map((d) => ({ id: d.id, updatedAt: d.updatedAt })) },
      });
      count += removed.count;
    }
    if (count > 0) {
      this.logger.log(`Push: removed ${count} device(s) of revoked or idle sessions`);
    }
  }

  private async sendBatch(
    client: PushMessagingClient,
    row: PushNotificationRow,
    tokens: string[],
    dead: Set<string>,
  ): Promise<void> {
    let res: BatchResponse;
    try {
      res = await client.sendEachForMulticast(
        buildPushMessage(row, tokens, this.webUrl),
      );
    } catch (err) {
      // Whole call failed (network, credentials, payload): nothing to clean.
      this.logger.warn(
        `Push send failed for ${tokens.length} device(s), type ${row.type}: ${errorText(err)}`,
      );
      return;
    }
    if (res.failureCount === 0) return;
    const batchHadSuccess = res.successCount > 0;
    const other = new Map<string, number>();
    res.responses.forEach((r, i) => {
      if (r.success) return;
      const code = r.error?.code ?? "unknown";
      if (isDeadTokenError(r.error, batchHadSuccess)) {
        const token = tokens[i];
        if (token) dead.add(token);
      } else {
        other.set(code, (other.get(code) ?? 0) + 1);
      }
    });
    if (other.size > 0) {
      const summary = [...other].map(([code, n]) => `${code} x${n}`).join(", ");
      this.logger.warn(`Push delivery failures, type ${row.type}: ${summary}`);
    }
  }

  /** Messaging client: injected one, or firebase-admin built on first use. */
  private client(): Promise<PushMessagingClient | null> {
    if (this.injectedClient) return Promise.resolve(this.injectedClient);
    if (this.serviceAccount.status !== "ok" || this.initFailed) {
      return Promise.resolve(null);
    }
    const account = this.serviceAccount.account;
    this.messaging ??= initFirebaseMessaging(account).catch((err: unknown) => {
      this.initFailed = true;
      this.messaging = null;
      this.logger.warn(
        `Push notifications disabled: Firebase init failed (${errorText(err)})`,
      );
      return null;
    });
    return this.messaging;
  }
}

/**
 * Loads firebase-admin only when the first push goes out (keeps it out of the
 * boot path and of every test that never sends).
 */
async function initFirebaseMessaging(
  account: FirebaseServiceAccount,
): Promise<PushMessagingClient> {
  const { cert, getApps, initializeApp } = await import("firebase-admin/app");
  const { getMessaging } = await import("firebase-admin/messaging");
  const app =
    getApps().find((a) => a.name === FIREBASE_APP_NAME) ??
    initializeApp(
      {
        credential: cert({
          projectId: account.projectId,
          clientEmail: account.clientEmail,
          privateKey: account.privateKey,
        }),
        projectId: account.projectId,
      },
      FIREBASE_APP_NAME,
    );
  return getMessaging(app);
}

/** Error text for a log line: message only, capped (no stack, no payload). */
function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}
