/**
 * Push notifications (2026-10-14, mobile app shell) - API side contract.
 *
 *  - Device registration is an upsert BY TOKEN: the row follows whoever is
 *    signed in on the device now (other user, other company).
 *  - Unregister needs no session and answers the same for an unknown token.
 *  - Registration accepts FCM-shaped tokens only, stores the session version
 *    of the request and keeps at most PUSH_MAX_DEVICES_PER_USER rows a user.
 *  - Sending: only ACTIVE, non-deleted users' devices registered under the
 *    user's CURRENT session version and seen recently; others are deleted (a
 *    revoked session's phone stops getting pushes); <= 500 tokens per FCM
 *    call; tokens FCM reports dead (v1 codes) are deleted, other failures only
 *    logged; never throws. Disabled push (no service account) makes no query.
 *  - NotificationService works without PushService (hand-built rigs) and with
 *    it never waits for FCM.
 *  - Removing a member from the team removes the member's devices.
 */
import * as crypto from "node:crypto";
import { Logger, ValidationPipe } from "@nestjs/common";
import { CompanyRole } from "@rothern/db";
import type { BatchResponse, MulticastMessage } from "firebase-admin/messaging";
import { AdminCompanyUsersService } from "../../src/modules/admin-companies/admin-company-users.service";
import { AuditService } from "../../src/modules/audit/audit.service";
import { CompanyJwtStrategy } from "../../src/modules/company-auth/strategies/company-jwt.strategy";
import { CompanyUsersService } from "../../src/modules/company-users/company-users.service";
import { PasswordResetService } from "../../src/modules/password-reset/password-reset.service";
import { NotificationService } from "../../src/modules/notifications/notification.service";
import {
  RegisterPushDeviceDto,
  UnregisterPushDeviceDto,
} from "../../src/modules/push/dto/push-device.dto";
import {
  PUSH_DEVICE_MAX_IDLE_MS,
  PUSH_MAX_DEVICES_PER_USER,
  PushDeviceService,
} from "../../src/modules/push/push-device.service";
import type { PushNotificationRow } from "../../src/modules/push/push-message";
import {
  isDeadTokenError,
  PushService,
  type PushMessagingClient,
} from "../../src/modules/push/push.service";
import { SessionRevocationService } from "../../src/common/auth/session-revocation.service";
import { makeCompanyWithUser, makeUser } from "./factories";
import { ensureRestrictedRolePassword, makeRestrictedPrisma } from "./rls-db";
import { prisma, truncateAll } from "./test-db";

const WEB = "https://www.rothern.test";

function config(env: Record<string, string | undefined> = {}) {
  const all: Record<string, string | undefined> = { WEB_URL: WEB, ...env };
  return { get: (key: string) => all[key] } as never;
}

/** A per-token FCM failure: client code plus the server's message. */
type FcmFailure = string | { code: string; message: string };

/**
 * Messaging double: records messages, answers per token via `fail`. A bare
 * code gets a message that names nothing (like a payload error would).
 */
function fakeMessaging(fail: Record<string, FcmFailure> = {}) {
  const sent: MulticastMessage[] = [];
  const client: PushMessagingClient & { sendEachForMulticast: jest.Mock } = {
    sendEachForMulticast: jest.fn(async (message: MulticastMessage): Promise<BatchResponse> => {
      sent.push(message);
      const responses = message.tokens.map((token) => {
        const f = fail[token];
        if (!f) return { success: true, messageId: `m-${token}` } as never;
        const error = typeof f === "string" ? { code: f, message: "x" } : f;
        return { success: false, error } as never;
      });
      const failureCount = responses.filter((r: { success: boolean }) => !r.success).length;
      return { responses, successCount: responses.length - failureCount, failureCount };
    }),
  };
  return { client, sent };
}

function pushService(client?: PushMessagingClient, env: Record<string, string | undefined> = {}) {
  return new PushService(prisma as never, config(env), client);
}

const row = (companyUserId: string, over: Partial<PushNotificationRow> = {}): PushNotificationRow => ({
  companyUserId,
  type: "connection_request",
  title: "Title",
  body: "Body",
  ctaUrl: "/company/baglantilar",
  ...over,
});

async function device(
  token: string,
  userId: string,
  companyId: string,
  platform = "android",
  over: { tokenVersion?: number; lastSeenAt?: Date } = {},
) {
  return prisma.pushDevice.create({
    data: { token, platform, companyUserId: userId, companyId, ...over },
  });
}

/** An FCM-shaped registration token (what the DTO accepts). */
const fcmToken = (seed: string) => `${seed}:APA91b${"x".repeat(140)}`;

/** Real FCM v1 answers as firebase-admin 14 reports them for sendEach. */
const FCM_V1 = {
  malformed: {
    code: "messaging/invalid-argument",
    message: "The registration token is not a valid FCM registration token",
  },
  payload: {
    code: "messaging/invalid-argument",
    message: "Invalid value at 'message.android.notification.color'",
  },
  senderMismatch: { code: "messaging/mismatched-credential", message: "SenderId mismatch" },
  permissionDenied: {
    code: "messaging/mismatched-credential",
    message: "Permission 'cloudmessaging.messages.create' denied on resource",
  },
  unregistered: {
    code: "messaging/registration-token-not-registered",
    message: "Requested entity was not found.",
  },
} as const;

let warn: jest.SpyInstance;
beforeEach(async () => {
  await truncateAll();
  warn = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
});
afterEach(() => {
  jest.restoreAllMocks();
});
afterAll(async () => {
  await truncateAll();
  await prisma.$disconnect();
});

describe("DTO validation (production ValidationPipe options)", () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true });
  const validate = (metatype: new () => object, value: unknown) =>
    pipe.transform(value, { type: "body", metatype, data: "" });

  it("register: FCM-shaped token up to 4096 chars, platform android | ios, nothing else", async () => {
    const real = "dQw4w9WgXcQ:APA91bHun4MxP5egoKMwt2KZFBaFUH-1RYqx_BzY9oGfRh3H-dX7Xa3rM5n7rL0w4K7rQe-J6hc1ZcU4m6xYkA8rL6s0u5G1TqJ2bE0rC8bWl0zXc2jS4fU9bO1hP7dR3gT5yV6";
    await expect(validate(RegisterPushDeviceDto, { token: real, platform: "android" })).resolves.toBeTruthy();
    await expect(validate(RegisterPushDeviceDto, { token: "x".repeat(4096), platform: "ios" })).resolves.toBeTruthy();
    await expect(validate(RegisterPushDeviceDto, { token: "", platform: "ios" })).rejects.toBeTruthy();
    await expect(validate(RegisterPushDeviceDto, { token: "x".repeat(4097), platform: "ios" })).rejects.toBeTruthy();
    // Raw APNs device token (iOS build without Firebase): 64 hex characters.
    await expect(
      validate(RegisterPushDeviceDto, { token: "a1b2c3d4".repeat(8), platform: "ios" }),
    ).rejects.toBeTruthy();
    // Short junk and characters no FCM token has.
    await expect(validate(RegisterPushDeviceDto, { token: "t", platform: "android" })).rejects.toBeTruthy();
    await expect(
      validate(RegisterPushDeviceDto, { token: `${real.slice(0, 120)} <script>`, platform: "android" }),
    ).rejects.toBeTruthy();
    await expect(validate(RegisterPushDeviceDto, { token: real, platform: "web" })).rejects.toBeTruthy();
    await expect(validate(RegisterPushDeviceDto, { token: real })).rejects.toBeTruthy();
    await expect(
      validate(RegisterPushDeviceDto, { token: real, platform: "ios", companyUserId: "u" }),
    ).rejects.toBeTruthy();
  });

  it("unregister: token only (any stored value can be removed)", async () => {
    await expect(validate(UnregisterPushDeviceDto, { token: "t" })).resolves.toBeTruthy();
    await expect(validate(UnregisterPushDeviceDto, { token: 5 })).rejects.toBeTruthy();
    await expect(validate(UnregisterPushDeviceDto, {})).rejects.toBeTruthy();
  });
});

describe("PushDeviceService", () => {
  it("register binds the token; registering it again from another account re-binds the same row", async () => {
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    const svc = new PushDeviceService(prisma as never);

    await expect(svc.register(a.auth, "tok-1", "android")).resolves.toEqual({ ok: true });
    const first = await prisma.pushDevice.findUniqueOrThrow({ where: { token: "tok-1" } });
    expect(first).toMatchObject({ companyUserId: a.user.id, companyId: a.company.id, platform: "android" });

    await new Promise((r) => setTimeout(r, 5));
    await expect(svc.register(b.auth, "tok-1", "ios")).resolves.toEqual({ ok: true });
    const rows = await prisma.pushDevice.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: first.id,
      companyUserId: b.user.id,
      companyId: b.company.id,
      platform: "ios",
    });
    expect(rows[0]!.lastSeenAt.getTime()).toBeGreaterThan(first.lastSeenAt.getTime());
  });

  it("same user registering again only refreshes lastSeenAt; two devices of one user are two rows", async () => {
    const a = await makeCompanyWithUser(prisma);
    const svc = new PushDeviceService(prisma as never);
    await svc.register(a.auth, "tok-1", "android");
    await svc.register(a.auth, "tok-1", "android");
    await svc.register(a.auth, "tok-2", "ios");
    expect(await prisma.pushDevice.count({ where: { companyUserId: a.user.id } })).toBe(2);
  });

  it("concurrent first registrations of one token end with one row", async () => {
    const a = await makeCompanyWithUser(prisma);
    const svc = new PushDeviceService(prisma as never);
    await Promise.all([
      svc.register(a.auth, "tok-race", "android"),
      svc.register(a.auth, "tok-race", "android"),
    ]);
    expect(await prisma.pushDevice.count()).toBe(1);
  });

  it("unregister deletes the row; an unknown token answers the same", async () => {
    const a = await makeCompanyWithUser(prisma);
    const svc = new PushDeviceService(prisma as never);
    await svc.register(a.auth, "tok-1", "android");
    await svc.register(a.auth, "tok-2", "android");
    await expect(svc.unregister("tok-1")).resolves.toEqual({ ok: true });
    await expect(svc.unregister("never-registered")).resolves.toEqual({ ok: true });
    expect((await prisma.pushDevice.findMany()).map((d) => d.token)).toEqual(["tok-2"]);
  });
});

describe("PushDeviceService: session binding, pruning, cap", () => {
  it("the guard puts the token's session version on the user; register stores THAT, not a fresh read", async () => {
    const a = await makeCompanyWithUser(prisma);
    await prisma.companyUser.update({ where: { id: a.user.id }, data: { tokenVersion: 2 } });
    const strategy = new CompanyJwtStrategy(
      { getOrThrow: () => "test-secret" } as never,
      prisma as never,
      { isRevoked: async () => false } as unknown as SessionRevocationService,
    );
    const authed = await strategy.validate({
      sub: a.user.id,
      email: a.user.email,
      type: "company",
      userId: a.user.id,
      companyId: a.company.id,
      tv: 2,
    });
    expect(authed.tokenVersion).toBe(2);

    const svc = new PushDeviceService(prisma as never);
    await svc.register(authed, fcmToken("a"), "android");
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { token: fcmToken("a") } })).tokenVersion).toBe(2);

    // A revocation that lands after the guard: the stored version stays the
    // session's own (2), so the sender treats this device as revoked.
    await prisma.companyUser.update({ where: { id: a.user.id }, data: { tokenVersion: 3 } });
    await svc.register({ ...authed, tokenVersion: 2 }, fcmToken("b"), "android");
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { token: fcmToken("b") } })).tokenVersion).toBe(2);

    // No version on the user (system callers): the current one is read.
    await svc.register(a.auth, fcmToken("c"), "ios");
    expect((await prisma.pushDevice.findUniqueOrThrow({ where: { token: fcmToken("c") } })).tokenVersion).toBe(3);
  });

  it("register drops the user's rows of OLDER sessions and idle rows; newer sessions and other users stay", async () => {
    const a = await makeCompanyWithUser(prisma);
    const b = await makeCompanyWithUser(prisma);
    await device("tok-old-session", a.user.id, a.company.id, "android", { tokenVersion: 0 });
    await device("tok-idle", a.user.id, a.company.id, "android", {
      tokenVersion: 1,
      lastSeenAt: new Date(Date.now() - PUSH_DEVICE_MAX_IDLE_MS - 60_000),
    });
    await device("tok-newer-session", a.user.id, a.company.id, "ios", { tokenVersion: 2 });
    await device("tok-other-user", b.user.id, b.company.id, "android", { tokenVersion: 0 });
    const svc = new PushDeviceService(prisma as never);

    await svc.register({ ...a.auth, tokenVersion: 1 }, fcmToken("a"), "android");

    const left = (await prisma.pushDevice.findMany({ orderBy: { token: "asc" } })).map((d) => d.token);
    expect(left).toEqual([fcmToken("a"), "tok-newer-session", "tok-other-user"].sort());
  });

  it(`a user keeps at most ${PUSH_MAX_DEVICES_PER_USER} devices: the least recently seen go`, async () => {
    const a = await makeCompanyWithUser(prisma);
    const svc = new PushDeviceService(prisma as never);
    const tokens = Array.from({ length: PUSH_MAX_DEVICES_PER_USER + 3 }, (_, i) => fcmToken(`d${i}`));
    for (const t of tokens) {
      await svc.register(a.auth, t, "android");
      await new Promise((r) => setTimeout(r, 2));
    }
    const left = await prisma.pushDevice.findMany({ where: { companyUserId: a.user.id } });
    expect(left).toHaveLength(PUSH_MAX_DEVICES_PER_USER);
    expect(left.map((d) => d.token).sort()).toEqual(tokens.slice(3).sort());
  });
});

describe("a revoked session's device stops getting pushes", () => {
  async function registeredOwner() {
    const co = await makeCompanyWithUser(prisma);
    await prisma.companyUser.update({ where: { id: co.user.id }, data: { authId: `auth-${co.user.id}` } });
    // Registered from a live session (tokenVersion 0 = the user's current).
    await new PushDeviceService(prisma as never).register(
      { ...co.auth, tokenVersion: 0 },
      fcmToken("phone"),
      "android",
    );
    return co;
  }

  async function sentTokensFor(userId: string) {
    const { client, sent } = fakeMessaging();
    await pushService(client).sendForNotifications([row(userId)]);
    return sent.flatMap((m) => m.tokens);
  }

  it("password reset (real service): no push to the old device and its row is deleted", async () => {
    const co = await registeredOwner();
    expect(await sentTokensFor(co.user.id)).toEqual([fcmToken("phone")]);

    const plain = crypto.randomBytes(8).toString("hex");
    await prisma.passwordResetToken.create({
      data: {
        companyUserId: co.user.id,
        tokenHash: crypto.createHash("sha256").update(plain).digest("hex"),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const reset = new PasswordResetService(
      prisma as never,
      { send: jest.fn() } as never,
      { get: jest.fn().mockReturnValue("http://localhost:3000") } as never,
      { updatePassword: jest.fn().mockResolvedValue(undefined) } as never,
    );
    await reset.confirmPasswordReset(plain, "N3w-Passw0rd!");

    expect(await sentTokensFor(co.user.id)).toEqual([]);
    expect(await prisma.pushDevice.count()).toBe(0);
  });

  it("admin drop sessions, then deactivate + reactivate: old devices stay silent; a new session's device gets pushes", async () => {
    const co = await registeredOwner();
    const member = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const devices = new PushDeviceService(prisma as never);
    await devices.register(
      { userId: member.id, companyId: co.company.id, tokenVersion: 0 },
      fcmToken("member-phone"),
      "ios",
    );
    const admin = new AdminCompanyUsersService(
      prisma as never,
      new AuditService(prisma as never),
      {} as never,
      {} as never,
      {} as never,
    );

    await admin.dropSessions(co.company.id, co.user.id, "admin-1");
    expect(await sentTokensFor(co.user.id)).toEqual([]);

    await admin.setActive(co.company.id, member.id, false, "admin-1");
    await admin.setActive(co.company.id, member.id, true, "admin-1");
    expect(await sentTokensFor(member.id)).toEqual([]);
    expect(await prisma.pushDevice.count()).toBe(0);

    // Signing in again (new session, version 1) registers the device anew.
    await devices.register({ ...co.auth, tokenVersion: 1 }, fcmToken("phone"), "android");
    expect(await sentTokensFor(co.user.id)).toEqual([fcmToken("phone")]);
  });

  it("a device not seen for longer than the idle limit gets nothing and is deleted", async () => {
    const co = await makeCompanyWithUser(prisma);
    await device("tok-fresh", co.user.id, co.company.id);
    await device("tok-idle", co.user.id, co.company.id, "android", {
      lastSeenAt: new Date(Date.now() - PUSH_DEVICE_MAX_IDLE_MS - 60_000),
    });

    expect(await sentTokensFor(co.user.id)).toEqual(["tok-fresh"]);
    expect((await prisma.pushDevice.findMany()).map((d) => d.token)).toEqual(["tok-fresh"]);
  });

  it("a stale row re-registered while the send runs is not deleted", async () => {
    const co = await makeCompanyWithUser(prisma);
    await device("tok-1", co.user.id, co.company.id, "android", { tokenVersion: 0 });
    await prisma.companyUser.update({ where: { id: co.user.id }, data: { tokenVersion: 1 } });
    const devices = new PushDeviceService(prisma as never);
    // The new session re-registers the same token between the device query
    // and the clean-up of the (then stale) row.
    const racing = {
      pushDevice: {
        findMany: async (args: Parameters<typeof prisma.pushDevice.findMany>[0]) => {
          const result = await prisma.pushDevice.findMany(args);
          await devices.register({ ...co.auth, tokenVersion: 1 }, "tok-1", "android");
          return result;
        },
        deleteMany: (args: Parameters<typeof prisma.pushDevice.deleteMany>[0]) =>
          prisma.pushDevice.deleteMany(args),
      },
    };
    const { client } = fakeMessaging();
    const push = new PushService(racing as never, config(), client);

    await push.sendForNotifications([row(co.user.id)]);

    expect(await prisma.pushDevice.findUniqueOrThrow({ where: { token: "tok-1" } })).toMatchObject({
      tokenVersion: 1,
    });
  });
});

describe("PushService.sendForNotifications", () => {
  it("only ACTIVE, non-deleted users' devices get the message (message shape per contract)", async () => {
    const co = await makeCompanyWithUser(prisma);
    const inactive = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI], { isActive: false });
    const deleted = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI], { deletedAt: new Date() });
    await device("tok-active-1", co.user.id, co.company.id);
    await device("tok-active-2", co.user.id, co.company.id, "ios");
    await device("tok-inactive", inactive.id, co.company.id);
    await device("tok-deleted", deleted.id, co.company.id);
    const { client, sent } = fakeMessaging();
    const push = pushService(client);

    await push.sendForNotifications([
      row(co.user.id, { body: "x".repeat(250) }),
      row(inactive.id, { body: "x".repeat(250) }),
      row(deleted.id, { body: "x".repeat(250) }),
    ]);

    expect(sent).toHaveLength(1);
    const message = sent[0]!;
    expect([...message.tokens].sort()).toEqual(["tok-active-1", "tok-active-2"]);
    expect(message.notification!.title).toBe("Title");
    expect(Array.from(message.notification!.body!)).toHaveLength(200);
    expect(message.notification!.body!.endsWith("…")).toBe(true);
    expect(message.data).toEqual({ type: "connection_request", url: `${WEB}/company/baglantilar` });
    expect(message.android).toEqual({
      priority: "high",
      notification: { channelId: "default", icon: "ic_stat_rothern", color: "#0A0A0A" },
    });
    expect(message.apns).toEqual({ payload: { aps: { sound: "default" } } });
    // Nothing failed: every device row stays.
    expect(await prisma.pushDevice.count()).toBe(4);
  });

  it("no ctaUrl -> no url in data; an absolute ctaUrl is passed as is", async () => {
    const co = await makeCompanyWithUser(prisma);
    const other = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    await device("tok-a", co.user.id, co.company.id);
    await device("tok-b", other.id, co.company.id);
    const { client, sent } = fakeMessaging();

    await pushService(client).sendForNotifications([
      row(co.user.id, { ctaUrl: null }),
      row(other.id, { ctaUrl: "https://www.rothern.com/en/company" }),
    ]);

    const byToken = new Map(sent.map((m) => [m.tokens[0], m.data] as const));
    expect(byToken.get("tok-a")).toEqual({ type: "connection_request" });
    expect(byToken.get("tok-b")).toEqual({
      type: "connection_request",
      url: "https://www.rothern.com/en/company",
    });
  });

  it("rows with the same text share one call; different text (language) is its own call", async () => {
    const co = await makeCompanyWithUser(prisma);
    const u2 = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    const u3 = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    await device("tok-1", co.user.id, co.company.id);
    await device("tok-2", u2.id, co.company.id);
    await device("tok-3", u3.id, co.company.id);
    const { client, sent } = fakeMessaging();

    await pushService(client).sendForNotifications([
      row(co.user.id),
      row(u2.id),
      row(u3.id, { title: "Baslik (en)" }),
    ]);

    expect(sent).toHaveLength(2);
    const tokens = sent.map((m) => [...m.tokens].sort());
    expect(tokens).toEqual(expect.arrayContaining([["tok-1", "tok-2"], ["tok-3"]]));
  });

  it("at most 500 tokens per FCM call", async () => {
    const co = await makeCompanyWithUser(prisma);
    await prisma.pushDevice.createMany({
      data: Array.from({ length: 1001 }, (_, i) => ({
        token: `tok-${i}`,
        platform: "android",
        companyUserId: co.user.id,
        companyId: co.company.id,
      })),
    });
    const { client, sent } = fakeMessaging();

    await pushService(client).sendForNotifications([row(co.user.id)]);

    expect(sent.map((m) => m.tokens.length)).toEqual([500, 500, 1]);
    expect(new Set(sent.flatMap((m) => m.tokens)).size).toBe(1001);
  });

  it("tokens FCM v1 reports dead (unregistered, malformed, other project) are deleted; other failures only logged", async () => {
    const co = await makeCompanyWithUser(prisma);
    for (const t of ["tok-ok", "tok-gone", "tok-malformed", "tok-foreign", "tok-flaky", "tok-payload"]) {
      await device(t, co.user.id, co.company.id);
    }
    const { client } = fakeMessaging({
      "tok-gone": FCM_V1.unregistered,
      "tok-malformed": FCM_V1.malformed,
      "tok-foreign": FCM_V1.senderMismatch,
      "tok-flaky": "messaging/internal-error",
      "tok-payload": FCM_V1.payload,
    });

    await pushService(client).sendForNotifications([row(co.user.id)]);

    const left = (await prisma.pushDevice.findMany({ orderBy: { token: "asc" } })).map((d) => d.token);
    expect(left).toEqual(["tok-flaky", "tok-ok", "tok-payload"]);
    const warned = warn.mock.calls.map((c) => String(c[0])).join("\n");
    expect(warned).toContain("messaging/internal-error");
    expect(warned).toContain("messaging/invalid-argument");
    expect(warned).not.toContain("tok-flaky");
  });

  it("a project-wide credential failure (PERMISSION_DENIED on every token) deletes nothing", async () => {
    const co = await makeCompanyWithUser(prisma);
    await device("tok-1", co.user.id, co.company.id);
    await device("tok-2", co.user.id, co.company.id);
    const { client } = fakeMessaging({
      "tok-1": FCM_V1.permissionDenied,
      "tok-2": FCM_V1.permissionDenied,
    });

    await pushService(client).sendForNotifications([row(co.user.id)]);

    expect(await prisma.pushDevice.count()).toBe(2);
    expect(warn.mock.calls.map((c) => String(c[0])).join("\n")).toContain("messaging/mismatched-credential");
  });

  it("isDeadTokenError: v1 codes by message; mismatched credential only when the call proved the credential", () => {
    expect(isDeadTokenError(FCM_V1.unregistered, false)).toBe(true);
    expect(isDeadTokenError(FCM_V1.malformed, false)).toBe(true);
    expect(isDeadTokenError(FCM_V1.payload, true)).toBe(false);
    expect(isDeadTokenError(FCM_V1.senderMismatch, false)).toBe(true);
    expect(isDeadTokenError(FCM_V1.permissionDenied, false)).toBe(false);
    expect(isDeadTokenError(FCM_V1.permissionDenied, true)).toBe(true);
    expect(isDeadTokenError({ code: "messaging/invalid-registration-token", message: "x" }, false)).toBe(true);
    expect(isDeadTokenError({ code: "messaging/internal-error", message: "registration token" }, true)).toBe(false);
    expect(isDeadTokenError(undefined, true)).toBe(false);
  });

  it("a failing FCM call or database never reaches the caller", async () => {
    const co = await makeCompanyWithUser(prisma);
    await device("tok-1", co.user.id, co.company.id);
    const client = { sendEachForMulticast: jest.fn(async () => Promise.reject(new Error("fcm down"))) };
    await expect(pushService(client).sendForNotifications([row(co.user.id)])).resolves.toBeUndefined();
    expect(await prisma.pushDevice.count()).toBe(1);

    const broken = new PushService(
      { pushDevice: { findMany: () => Promise.reject(new Error("db down")) } } as never,
      config(),
      client,
    );
    await expect(broken.sendForNotifications([row(co.user.id)])).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it("disabled push (no or bad FIREBASE_SERVICE_ACCOUNT_JSON) makes no query at all", async () => {
    const touched: string[] = [];
    const spyPrisma = new Proxy(
      {},
      {
        get: (_t, key) => {
          touched.push(String(key));
          throw new Error(`prisma.${String(key)} must not be touched`);
        },
      },
    );
    for (const value of [undefined, "", "not json", '{"project_id":"p"}']) {
      const push = new PushService(spyPrisma as never, config({ FIREBASE_SERVICE_ACCOUNT_JSON: value }));
      push.onModuleInit();
      expect(push.enabled).toBe(false);
      await expect(push.sendForNotifications([row("u1")])).resolves.toBeUndefined();
    }
    expect(touched).toEqual([]);
  });

  it("boot line names why push is off and never prints the value", () => {
    const log = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const secret = '{"type":"service_account","project_id":"p","client_email":"e","private_key":"SECRET-KEY"}';
    new PushService(prisma as never, config({ FIREBASE_SERVICE_ACCOUNT_JSON: secret })).onModuleInit();
    new PushService(prisma as never, config({})).onModuleInit();
    const lines = [...warn.mock.calls, ...log.mock.calls].map((c) => String(c[0]));
    expect(lines).toHaveLength(2);
    expect(lines.join("\n")).toContain("FIREBASE_SERVICE_ACCOUNT_JSON");
    expect(lines.join("\n")).not.toContain("SECRET-KEY");
  });
});

describe("NotificationService + PushService", () => {
  it("works without PushService (hand-built rigs): rows are written, nothing else needed", async () => {
    const co = await makeCompanyWithUser(prisma);
    const other = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    await device("tok-1", co.user.id, co.company.id);
    const svc = new NotificationService(prisma as never);
    await expect(
      svc.pushToCompany(co.company.id, { type: "connection_request", title: "t", body: "b" }),
    ).resolves.toBe(2);
    await expect(
      svc.pushToUser(other.id, { type: "connection_request", title: "t", body: "b" }),
    ).resolves.toBe(1);
    expect(await prisma.notification.count()).toBe(3);
  });

  it("pushToCompanies / pushToUser fire the push for the written rows and do not wait for FCM", async () => {
    const co = await makeCompanyWithUser(prisma);
    const other = await makeUser(prisma, co.company.id, [CompanyRole.SATISCI]);
    await device("tok-owner", co.user.id, co.company.id);
    await device("tok-other", other.id, co.company.id);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const sent: MulticastMessage[] = [];
    const client = {
      sendEachForMulticast: jest.fn(async (m: MulticastMessage): Promise<BatchResponse> => {
        sent.push(m);
        await gate; // FCM hangs until the test releases it
        return {
          responses: m.tokens.map(() => ({ success: true, messageId: "m" })),
          successCount: m.tokens.length,
          failureCount: 0,
        };
      }),
    };
    const push = pushService(client);
    const fired = jest.spyOn(push, "sendForNotifications");
    const svc = new NotificationService(prisma as never, undefined, undefined, push);

    await expect(
      svc.pushToCompanies([co.company.id], {
        type: "connection_request",
        title: "Hello",
        body: "World",
        ctaPath: "/company/baglantilar",
      }),
    ).resolves.toBe(2);
    await expect(
      svc.pushToUser(other.id, { type: "connection_request", title: "Solo", body: "One" }),
    ).resolves.toBe(1);

    expect(fired).toHaveBeenCalledTimes(2);
    const [companyRows, userRows] = fired.mock.calls.map((c) => c[0]);
    expect(companyRows!.map((r) => r.companyUserId).sort()).toEqual([co.user.id, other.id].sort());
    expect(companyRows![0]).toMatchObject({ title: "Hello", body: "World", ctaUrl: "/company/baglantilar" });
    expect(userRows).toEqual([
      { companyUserId: other.id, type: "connection_request", title: "Solo", body: "One", ctaUrl: null },
    ]);

    release();
    await Promise.all(fired.mock.results.map((r) => r.value));
    expect(sent.flatMap((m) => m.tokens).sort()).toEqual(["tok-other", "tok-other", "tok-owner"].sort());
  });

  it("a push that blows up does not fail the notification write", async () => {
    const co = await makeCompanyWithUser(prisma);
    const push = pushService(fakeMessaging().client);
    jest.spyOn(push, "sendForNotifications").mockRejectedValue(new Error("boom"));
    const svc = new NotificationService(prisma as never, undefined, undefined, push);
    await expect(
      svc.pushToCompany(co.company.id, { type: "connection_request", title: "t", body: "b" }),
    ).resolves.toBe(1);
  });
});

describe("account stops being usable -> its devices go", () => {
  it("CompanyUsersService.remove deletes the removed member's devices (others stay)", async () => {
    const owner = await makeCompanyWithUser(prisma);
    const member = await makeUser(prisma, owner.company.id, [CompanyRole.SATISCI]);
    await device("tok-owner", owner.user.id, owner.company.id);
    await device("tok-member-1", member.id, owner.company.id);
    await device("tok-member-2", member.id, owner.company.id, "ios");
    const svc = new CompanyUsersService(
      prisma as never,
      { deleteUser: jest.fn(async () => undefined) } as never,
      {} as never,
      { send: jest.fn() } as never,
      config() as never,
      new AuditService(prisma as never),
    );

    await expect(svc.remove(owner.auth, member.id)).resolves.toEqual({ ok: true });

    expect((await prisma.pushDevice.findMany()).map((d) => d.token)).toEqual(["tok-owner"]);
  });
});

describe("restricted app role (production runs with RLS_ENABLED=true)", () => {
  it("rothern_app can upsert, read and delete push_devices (migration grant)", async () => {
    await ensureRestrictedRolePassword(prisma);
    const restricted = makeRestrictedPrisma();
    try {
      await restricted.$connect();
      const a = await makeCompanyWithUser(prisma);
      await new PushDeviceService(restricted as never).register(
        { ...a.auth, tokenVersion: 0 },
        "tok-rls",
        "android",
      );
      expect(await restricted.pushDevice.count()).toBe(1);
      // Same call the team removal makes inside its (restricted client) transaction.
      await restricted.pushDevice.deleteMany({ where: { companyUserId: a.user.id } });
      expect(await prisma.pushDevice.count()).toBe(0);
    } finally {
      await restricted.$disconnect();
    }
  });
});
