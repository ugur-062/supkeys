/**
 * V2-1 — Resend webhook'larını local'de simüle eder.
 *
 * Mailpit dev ortamında gerçek Resend webhook gelmediği için
 * `ResendEventService.handleEvent`'i doğrudan çağırarak DELIVERED/OPENED/
 * CLICKED/BOUNCED akışını test eder.
 *
 * Çalıştırma (apps/api dizininde):
 *   pnpm test:webhook
 *
 * Önce `pnpm test:emails` ile en az 1 SENT EmailLog oluşturulmalı.
 */

import { config as dotenvConfig } from "dotenv";
import * as path from "path";
dotenvConfig({ path: path.resolve(__dirname, "../../../../.env") });

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { PrismaService } from "../common/prisma/prisma.service";
import { ResendEventService } from "../modules/resend-webhook/services/resend-event.service";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn", "log"],
  });
  const prisma = app.get(PrismaService);
  const eventService = app.get(ResendEventService);

  console.log("\n🧪 V2-1 Resend webhook mock test\n");

  // En son SENT (veya üstü) EmailLog'u bul.
  let emailLog = await prisma.emailLog.findFirst({
    where: { status: { in: ["SENT", "DELIVERED", "OPENED", "CLICKED"] } },
    orderBy: { queuedAt: "desc" },
  });

  if (!emailLog) {
    console.log(
      "⚠️  SENT durumunda EmailLog yok. Önce şunu çalıştırın:",
    );
    console.log("    pnpm test:emails\n");
    await app.close();
    process.exit(0);
  }

  // Mailpit'te providerMessageId olmayabilir; mock'lamak için fake bir tane set et.
  if (!emailLog.providerMessageId) {
    const fakeId = `re_mock_${Date.now()}_${emailLog.id.slice(-6)}`;
    await prisma.emailLog.update({
      where: { id: emailLog.id },
      data: { providerMessageId: fakeId },
    });
    emailLog = await prisma.emailLog.findUnique({
      where: { id: emailLog.id },
    });
    console.log(`✓ Fake providerMessageId atandı: ${fakeId}`);
  }

  const providerId = emailLog!.providerMessageId!;
  console.log(
    `Test EmailLog: ${emailLog!.id}`,
  );
  console.log(`  Konu       : ${emailLog!.subject}`);
  console.log(`  Alıcı      : ${emailLog!.toEmail}`);
  console.log(`  ProviderId : ${providerId}\n`);

  const baseEvent = {
    from: emailLog!.toEmail,
    to: [emailLog!.toEmail],
    subject: emailLog!.subject,
  };

  const ts = Date.now();

  // 1) DELIVERED
  await eventService.handleEvent(
    {
      type: "email.delivered",
      created_at: new Date().toISOString(),
      data: { email_id: providerId, ...baseEvent },
    },
    `mock_${ts}_delivered`,
  );
  console.log("  ✓ DELIVERED");
  await sleep(300);

  // 2) OPENED
  await eventService.handleEvent(
    {
      type: "email.opened",
      created_at: new Date().toISOString(),
      data: { email_id: providerId, ...baseEvent },
    },
    `mock_${ts}_opened`,
  );
  console.log("  ✓ OPENED");
  await sleep(300);

  // 3) CLICKED
  await eventService.handleEvent(
    {
      type: "email.clicked",
      created_at: new Date().toISOString(),
      data: {
        email_id: providerId,
        ...baseEvent,
        click: {
          link: "http://localhost:3000/dashboard/ihaleler",
          timestamp: new Date().toISOString(),
        },
      },
    },
    `mock_${ts}_clicked`,
  );
  console.log("  ✓ CLICKED");

  // Idempotency test — aynı eventId'yi tekrar gönder
  console.log("\n🔁 Idempotency test (aynı CLICKED event'i tekrar):");
  const duplicateResult = await eventService.handleEvent(
    {
      type: "email.clicked",
      created_at: new Date().toISOString(),
      data: { email_id: providerId, ...baseEvent },
    },
    `mock_${ts}_clicked`,
  );
  console.log(`  → Sonuç: ${JSON.stringify(duplicateResult)}`);

  // Final state
  const updated = await prisma.emailLog.findUnique({
    where: { id: emailLog!.id },
    include: { events: { orderBy: { occurredAt: "asc" } } },
  });

  console.log("\n📊 EmailLog final state:");
  console.log(`  Status      : ${updated!.status}`);
  console.log(
    `  Delivered   : ${updated!.deliveredAt?.toISOString() ?? "—"}`,
  );
  console.log(`  Opened      : ${updated!.openedAt?.toISOString() ?? "—"}`);
  console.log(`  Clicked     : ${updated!.clickedAt?.toISOString() ?? "—"}`);
  console.log(`  Events      : ${updated!.events.length}`);

  console.log(
    `\n🌐 Admin'de görüntüle: http://localhost:3001/admin/email-logs\n`,
  );
  console.log(`   (yukarıdaki listeden ${emailLog!.id.slice(0, 12)}... satırını aç)\n`);

  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Mock webhook test başarısız:", err);
  process.exit(1);
});
