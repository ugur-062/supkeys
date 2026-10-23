jest.mock("../../src/instrument", () => ({ reportToSentry: jest.fn() }));

// renderEmail React Email dynamic-import kullanıyor → jest'te patlar; kısıcı ve
// yeniden deneme yolunu izole etmek için render'ı stub'la.
jest.mock("@rothern/email", () => ({
  ...jest.requireActual("@rothern/email"),
  renderEmail: jest
    .fn()
    .mockResolvedValue({ subject: "S", html: "<p>p</p>", text: "p" }),
}));

import {
  EmailSendThrottle,
  emailIdempotencyKey,
  isRetryableEmailError,
  retryDelayMs,
} from "../../src/modules/email/email-send-throttle";
import {
  EMAIL_SEND_MAX_ATTEMPTS,
  EmailService,
} from "../../src/modules/email/email.service";
import { ResendProvider } from "../../../../packages/email/src/providers/resend";

/**
 * Derin denetim 2026-09-29 Y-08: toplu bildirim/duyuru e-postaları sınırsız
 * eşzamanlı ateşleniyor, Resend 429'unda FAILED kalıp bir daha gönderilmiyordu.
 * Sözleşme: EmailService.send süreç içi kısıcıdan geçer (sınırlı eşzamanlılık +
 * öncelik + jeton kovası) ve 429/5xx'i üstel geri çekilmeyle yeniden dener.
 */

const flush = async (n = 20) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("EmailSendThrottle", () => {
  it("aynı anda en fazla maxConcurrent iş koşar; biten yerini sıradakine verir", async () => {
    const t = new EmailSendThrottle({ ratePerSec: 1000, maxConcurrent: 2 });
    const gates = Array.from({ length: 5 }, () => deferred<void>());
    let running = 0;
    let peak = 0;
    const done = gates.map((g) =>
      t.run("normal", async () => {
        running++;
        peak = Math.max(peak, running);
        await g.promise;
        running--;
      }),
    );
    await flush();
    expect(running).toBe(2);
    expect(t.pending).toBe(3);
    gates.forEach((g) => g.resolve());
    await Promise.all(done);
    expect(peak).toBe(2);
    expect(t.running).toBe(0);
  });

  it("bekleyenler öncelik sırasıyla hat alır: high → normal → bulk", async () => {
    const t = new EmailSendThrottle({ ratePerSec: 1000, maxConcurrent: 1 });
    const first = deferred<void>();
    const order: string[] = [];
    const blocker = t.run("normal", () => first.promise);
    await flush();
    const jobs = [
      t.run("bulk", async () => void order.push("bulk")),
      t.run("normal", async () => void order.push("normal")),
      t.run("high", async () => void order.push("high")),
    ];
    first.resolve();
    await Promise.all([blocker, ...jobs]);
    expect(order).toEqual(["high", "normal", "bulk"]);
  });

  it("hata fırlatan iş hattı geri verir (kuyruk kilitlenmez)", async () => {
    const t = new EmailSendThrottle({ ratePerSec: 1000, maxConcurrent: 1 });
    await expect(
      t.run("normal", async () => {
        throw new Error("x");
      }),
    ).rejects.toThrow("x");
    await expect(t.run("normal", async () => 7)).resolves.toBe(7);
    expect(t.running).toBe(0);
  });

  it("jeton kovası: saniyede ratePerSec istek, patlama kovayla sınırlı", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const t = new EmailSendThrottle({
      ratePerSec: 2,
      maxConcurrent: 10,
      now: () => now,
      sleep: async (ms) => {
        sleeps.push(ms);
        now += ms;
      },
    });
    const stamps: number[] = [];
    for (let i = 0; i < 6; i++) {
      await t.acquireToken();
      stamps.push(now);
    }
    // İlk ikisi anında (kova = 2), sonra her 500 ms'de bir.
    expect(stamps).toEqual([0, 0, 500, 1000, 1500, 2000]);
    expect(sleeps.every((ms) => ms > 0)).toBe(true);
  });

  it("isRetryableEmailError: yalnız 429 ve 5xx; zaman aşımı ve 4xx DENENMEZ", () => {
    expect(isRetryableEmailError(new Error("[resend] rate_limit_exceeded: Too many requests"))).toBe(true);
    expect(isRetryableEmailError(new Error("[resend] application_error: Unable to fetch data"))).toBe(true);
    expect(isRetryableEmailError(new Error("[resend] internal_server_error: boom"))).toBe(true);
    expect(isRetryableEmailError(new Error("[resend] concurrent_idempotent_requests: in progress"))).toBe(true);
    expect(isRetryableEmailError(new Error("[resend] invalid_idempotent_request: payload differs"))).toBe(false);
    expect(isRetryableEmailError(new Error("[resend] validation_error: bad to"))).toBe(false);
    expect(isRetryableEmailError(new Error("[resend] istek zaman aşımına uğradı (10000ms)"))).toBe(false);
    expect(isRetryableEmailError(new Error("resend down"))).toBe(false);
  });

  it("retryDelayMs üstel büyür (1 sn, 2 sn …) + küçük titreşim", () => {
    expect(retryDelayMs(1, () => 0)).toBe(1000);
    expect(retryDelayMs(2, () => 0)).toBe(2000);
    expect(retryDelayMs(1, () => 0.999)).toBeLessThan(1250);
  });
});

function makeService(clientSend: jest.Mock, throttle?: EmailSendThrottle) {
  const prisma = {
    emailLog: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: "log1" }),
      update: jest.fn().mockResolvedValue({}),
    },
    emailOptOut: { findFirst: jest.fn().mockResolvedValue(null) },
    referralOptOut: { findUnique: jest.fn().mockResolvedValue(null) },
  };
  const config = { get: jest.fn(), getOrThrow: jest.fn() };
  const svc = new EmailService(config as never, prisma as never);
  (svc as unknown as { client: unknown }).client = { send: clientSend };
  (svc as unknown as { providerName: string }).providerName = "resend";
  const sleeps: number[] = [];
  (svc as unknown as { throttle: EmailSendThrottle }).throttle =
    throttle ??
    new EmailSendThrottle({
      ratePerSec: 1000,
      maxConcurrent: 4,
      sleep: async (ms) => void sleeps.push(ms),
    });
  return { svc, prisma, sleeps };
}

const email = (contextType = "listing_invitation") =>
  ({
    to: { email: "u@x.com", name: "U" },
    subject: "S",
    templateData: {
      template: "notification" as const,
      data: { subject: "S", heading: "H", paragraphs: ["p"] },
    },
    context: { type: contextType, id: "id1" },
  }) as never;

const rateLimited = () =>
  new Error("[resend] rate_limit_exceeded: Too many requests. You can only make 2 requests per second.");

describe("EmailService — hız sınırı ve 429 yeniden deneme (Y-08)", () => {
  it("429 sonra başarı → yeniden denenir, SENT + attemptCount", async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(rateLimited())
      .mockRejectedValueOnce(rateLimited())
      .mockResolvedValue({ providerMessageId: "m1" });
    const { svc, prisma, sleeps } = makeService(send);
    await expect(svc.send(email())).resolves.toEqual({ emailLogId: "log1", sent: true });
    expect(send).toHaveBeenCalledTimes(3);
    expect(sleeps).toHaveLength(2);
    expect(sleeps[1]!).toBeGreaterThan(sleeps[0]!);
    expect(prisma.emailLog.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "SENT", attemptCount: 3 }),
      }),
    );
  });

  it("ağ hatası (application_error) yeniden denenir ama her denemede AYNI Idempotency-Key gider (çift e-posta yok)", async () => {
    const send = jest
      .fn()
      .mockRejectedValueOnce(
        new Error("[resend] application_error: Unable to fetch data. The request could not be resolved."),
      )
      .mockResolvedValue({ providerMessageId: "m1" });
    const { svc } = makeService(send);
    await expect(svc.send(email())).resolves.toEqual({ emailLogId: "log1", sent: true });
    expect(send).toHaveBeenCalledTimes(2);
    const keys = send.mock.calls.map((c) => (c[0] as { idempotencyKey?: string }).idempotencyKey);
    expect(keys[0]).toBe(emailIdempotencyKey("log1"));
    expect(keys[1]).toBe(keys[0]);
  });

  it("429 hiç geçmezse EMAIL_SEND_MAX_ATTEMPTS denemeden sonra FAILED + throw", async () => {
    const send = jest.fn().mockRejectedValue(rateLimited());
    const { svc, prisma } = makeService(send);
    await expect(svc.send(email())).rejects.toThrow(/rate_limit_exceeded/);
    expect(send).toHaveBeenCalledTimes(EMAIL_SEND_MAX_ATTEMPTS);
    expect(prisma.emailLog.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "FAILED",
          attemptCount: EMAIL_SEND_MAX_ATTEMPTS,
        }),
      }),
    );
  });

  it("kalıcı hata (4xx) ve zaman aşımı yeniden DENENMEZ (çift e-posta riski)", async () => {
    const bad = jest.fn().mockRejectedValue(new Error("[resend] validation_error: bad"));
    await expect(makeService(bad).svc.send(email())).rejects.toThrow();
    expect(bad).toHaveBeenCalledTimes(1);
    const timeout = jest
      .fn()
      .mockRejectedValue(new Error("[resend] istek zaman aşımına uğradı (10000ms)"));
    await expect(makeService(timeout).svc.send(email())).rejects.toThrow();
    expect(timeout).toHaveBeenCalledTimes(1);
  });

  it("300 alıcılı toplu bildirim aynı anda ateşlense de sağlayıcıya en fazla maxConcurrent istek uçar", async () => {
    let inFlight = 0;
    let peak = 0;
    const send = jest.fn().mockImplementation(async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setImmediate(r));
      inFlight--;
      return { providerMessageId: "m" };
    });
    const { svc, prisma } = makeService(
      send,
      new EmailSendThrottle({ ratePerSec: 1000, maxConcurrent: 3 }),
    );
    // Çağıran kalıbı: fire-and-forget döngü (company-listings notify).
    const all = Array.from({ length: 300 }, () => svc.send(email()));
    const results = await Promise.all(all);
    expect(results.every((r) => r.sent)).toBe(true);
    expect(send).toHaveBeenCalledTimes(300);
    expect(peak).toBeLessThanOrEqual(3);
    // DB tarafı da sınırlı: EmailLog create'leri de hat içinde.
    expect(prisma.emailLog.create).toHaveBeenCalledTimes(300);
  });

  it("toplu kuyruk varken kritik (doğrulama kodu) e-posta öne geçer", async () => {
    const order: string[] = [];
    const gate = deferred<void>();
    let first = true;
    const send = jest.fn().mockImplementation(async (payload: { to: { email: string } }) => {
      if (first) {
        first = false;
        await gate.promise;
      }
      order.push(payload.to.email);
      return { providerMessageId: "m" };
    });
    const { svc } = makeService(
      send,
      new EmailSendThrottle({ ratePerSec: 1000, maxConcurrent: 1 }),
    );
    const mk = (addr: string, type: string, priority?: "bulk") =>
      ({
        ...(email(type) as object),
        to: { email: addr },
        ...(priority ? { priority } : {}),
      }) as never;
    const jobs = [
      svc.send(mk("first@x.com", "admin_announcement", "bulk")),
      svc.send(mk("bulk1@x.com", "admin_announcement", "bulk")),
      svc.send(mk("bulk2@x.com", "admin_announcement", "bulk")),
      svc.send(mk("notify@x.com", "listing_invitation")),
      svc.send(mk("code@x.com", "email_verify")),
    ];
    await flush(50);
    gate.resolve();
    await Promise.all(jobs);
    expect(order).toEqual([
      "first@x.com",
      "code@x.com",
      "notify@x.com",
      "bulk1@x.com",
      "bulk2@x.com",
    ]);
  });
});

describe("ResendProvider — Idempotency-Key iletimi (Y-08 gözden geçirme)", () => {
  const input = (idempotencyKey?: string) => ({
    to: { email: "u@x.com" },
    from: { email: "noreply@rothern.com" },
    rendered: { subject: "S", html: "<p>p</p>", text: "p" },
    ...(idempotencyKey ? { idempotencyKey } : {}),
  });

  const withMockClient = () => {
    const p = new ResendProvider("re_test_dummy");
    const send = jest.fn().mockResolvedValue({ data: { id: "m1" }, error: null });
    (p as unknown as { client: unknown }).client = { emails: { send } };
    return { p, send };
  };

  it("anahtar SDK'ya istek seçeneği olarak geçer, gövdeye sızmaz", async () => {
    const { p, send } = withMockClient();
    await expect(p.send(input("email-log/abc"))).resolves.toEqual({ providerMessageId: "m1" });
    expect(send).toHaveBeenCalledWith(
      expect.not.objectContaining({ idempotencyKey: expect.anything() }),
      { idempotencyKey: "email-log/abc" },
    );
  });

  it("anahtar yoksa seçenek gönderilmez", async () => {
    const { p, send } = withMockClient();
    await p.send(input());
    expect(send.mock.calls[0]![1]).toBeUndefined();
  });
});
