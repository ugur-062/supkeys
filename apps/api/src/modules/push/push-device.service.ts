import { Injectable } from "@nestjs/common";
import { Prisma } from "@rothern/db";
import { PrismaBypassService } from "../../common/prisma/prisma.service";

export type PushPlatform = "android" | "ios";

export const PUSH_PLATFORMS: readonly PushPlatform[] = ["android", "ios"];

/** Longest FCM registration token accepted (real ones are ~160-200 chars). */
export const PUSH_TOKEN_MAX_LENGTH = 4096;

/**
 * Shape of an FCM registration token accepted at registration: URL-safe
 * base64 plus ":" and at least 100 characters (real tokens are ~140-200).
 * Rejects raw APNs device tokens (64 hex characters, what an iOS build without
 * Firebase would hand over) and short junk. Unregister keeps the loose 1..4096
 * check so a row stored earlier can always be removed.
 */
export const PUSH_TOKEN_PATTERN = /^[A-Za-z0-9_:-]{100,4096}$/;

/** Most devices kept per user; registering one more drops the least recent. */
export const PUSH_MAX_DEVICES_PER_USER = 10;

/**
 * A device not re-registered for this long gets no pushes and is deleted. The
 * app re-registers on every launch while signed in, and no session outlives
 * this much idle time (persistent session: 7 days, sliding).
 */
export const PUSH_DEVICE_MAX_IDLE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Device registration for push notifications (2026-10-14, mobile app shell).
 *
 * A token identifies one app install. Registering is an upsert BY TOKEN: the
 * row is re-bound to whoever is signed in on that device now, so a phone that
 * changes hands (or a user switching accounts) never keeps pushing the
 * previous account's notifications. Unregistering needs no session: the app
 * calls it on sign-out, also after the session already expired.
 *
 * Session binding: the row stores the session version (`tokenVersion`) of the
 * registering request. Every "end all sessions" path (password change/reset,
 * admin drop sessions, e-mail change, deactivation) bumps the user's version,
 * and the sender skips and deletes rows of an older version, so a phone whose
 * session was revoked stops showing this account's notifications even if the
 * app is never opened again.
 *
 * Bypass client: the token row may belong to another company before the
 * re-bind and the table is not company scoped (no RLS policy).
 */
@Injectable()
export class PushDeviceService {
  constructor(private readonly prisma: PrismaBypassService) {}

  async register(
    user: { userId: string; companyId: string; tokenVersion?: number },
    token: string,
    platform: PushPlatform,
  ): Promise<{ ok: true }> {
    // The guard puts the version the session token carries on the user; it is
    // preferred over a fresh read, which could already see a revocation that
    // landed after the guard and bind this (now dead) session's device to it.
    const tokenVersion = user.tokenVersion ?? (await this.currentVersion(user.userId));
    const now = new Date();
    const bind = {
      platform,
      companyUserId: user.userId,
      companyId: user.companyId,
      tokenVersion,
      lastSeenAt: now,
    };
    const upsert = () =>
      this.prisma.pushDevice.upsert({
        where: { token },
        create: { token, ...bind },
        update: bind,
      });
    try {
      await upsert();
    } catch (err) {
      // Two first registrations of the same token at once: the loser of the
      // insert race sees the unique violation; the row exists now, re-bind it.
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        await upsert();
      } else {
        throw err;
      }
    }
    await this.prune(user.userId, tokenVersion, now);
    return { ok: true };
  }

  async unregister(token: string): Promise<{ ok: true }> {
    await this.prisma.pushDevice.deleteMany({ where: { token } });
    return { ok: true };
  }

  private async currentVersion(userId: string): Promise<number> {
    const row = await this.prisma.companyUser.findUnique({
      where: { id: userId },
      select: { tokenVersion: true },
    });
    return row?.tokenVersion ?? 0;
  }

  /**
   * The user's other rows: drops those of revoked (older) sessions and idle
   * ones, then keeps only the most recently seen PUSH_MAX_DEVICES_PER_USER.
   * Only OLDER versions go: a racing request of a revoked session must not
   * delete the device of the user's new session.
   */
  private async prune(userId: string, tokenVersion: number, now: Date): Promise<void> {
    await this.prisma.pushDevice.deleteMany({
      where: {
        companyUserId: userId,
        OR: [
          { tokenVersion: { lt: tokenVersion } },
          { lastSeenAt: { lt: new Date(now.getTime() - PUSH_DEVICE_MAX_IDLE_MS) } },
        ],
      },
    });
    const surplus = await this.prisma.pushDevice.findMany({
      where: { companyUserId: userId },
      orderBy: [{ lastSeenAt: "desc" }, { id: "desc" }],
      skip: PUSH_MAX_DEVICES_PER_USER,
      select: { id: true },
    });
    if (surplus.length > 0) {
      await this.prisma.pushDevice.deleteMany({
        where: { id: { in: surplus.map((d) => d.id) } },
      });
    }
  }
}
