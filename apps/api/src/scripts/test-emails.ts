/**
 * Polish-3 — Mailpit görsel QA için tüm e-posta şablonlarını seed eder.
 *
 * Çalıştırma (apps/api dizininde):
 *   pnpm test:emails
 *
 * Şablonların büyük kısmını yapay test verisiyle Mailpit'e gönderir.
 * Sonra http://localhost:8025 üzerinden görsel inceleme yapılabilir.
 *
 * NOT: EmailQueue üzerinden gerçek BullMQ akışı tetiklenir; outbox
 * pattern + cron yeniden enqueue de aktiftir. Test sonrası Mailpit
 * UI'sından mesajları toplu silebilirsiniz.
 */

// Standalone CLI script — `pnpm test:emails` (apps/api dizininde).
// AppModule context'i NestFactory.createApplicationContext ile başlatılır;
// .env dosyasını monorepo root'tan manuel yüklemek gerekir (NestFactory
// bootstrap'i ile aynı yolu izle).
import { config as dotenvConfig } from "dotenv";
import * as path from "path";
dotenvConfig({ path: path.resolve(__dirname, "../../../../.env") });

import { NestFactory } from "@nestjs/core";
import { AppModule } from "../app.module";
import { EmailQueue } from "../modules/email/email.queue";

const TEST_EMAIL = "qa-mailpit@supkeys-dev.local";
const ISO_FUTURE = (days: number) =>
  new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error", "warn"],
  });
  const queue = app.get(EmailQueue);
  const to = { email: TEST_EMAIL, name: "QA Test" };

  const cases: Array<{ label: string; run: () => Promise<unknown> }> = [
    {
      label: "demo_request_received",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "demo_request_received",
            data: {
              contactName: "Demo Talep Sahibi",
              companyName: "Test A.Ş.",
              email: TEST_EMAIL,
              phone: "+90 555 555 55 55",
              message: "Demo talebimizdir.",
            },
          },
        }),
    },
    {
      label: "demo_request_admin_alert",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "demo_request_admin_alert",
            data: {
              contactName: "Demo Talep Sahibi",
              companyName: "Test A.Ş.",
              email: TEST_EMAIL,
              phone: "+90 555 555 55 55",
              jobTitle: "Satınalma Müdürü",
              companySize: "50-200",
              message: "Bu firma demo talep ediyor.",
              demoRequestId: "demo-test-001",
              adminPanelUrl: "http://localhost:3001/admin/demo-requests",
            },
          },
        }),
    },
    {
      label: "demo_to_register_invitation",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "demo_to_register_invitation",
            data: {
              contactName: "Demo Talep Sahibi",
              companyName: "Test A.Ş.",
              message: "Görüşme sonrası kayıt davetiniz hazır.",
              registerUrl:
                "http://localhost:3000/register/buyer?invitation=test-token",
              expiresAt: "30 Mayıs 2026",
            },
          },
        }),
    },
    {
      label: "buyer_email_verification",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "buyer_email_verification",
            data: {
              firstName: "Test",
              companyName: "Test A.Ş.",
              verifyUrl: "http://localhost:3000/register/verify-email?token=ab",
              expiresAt: ISO_FUTURE(1),
            },
          },
        }),
    },
    {
      label: "supplier_email_verification",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "supplier_email_verification",
            data: {
              firstName: "Test",
              companyName: "Tedarikçi A.Ş.",
              verifyUrl: "http://localhost:3000/register/verify-email?token=ab",
              expiresAt: ISO_FUTURE(1),
            },
          },
        }),
    },
    {
      label: "buyer_application_admin_alert",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "buyer_application_admin_alert",
            data: {
              applicationId: "app-buyer-test",
              companyName: "Test A.Ş.",
              contactName: "Yetkili Kişi",
              contactEmail: TEST_EMAIL,
              contactPhone: "+90 555 555 55 55",
              taxNumber: "1234567890",
              city: "İstanbul",
              industry: "Yazılım",
              reviewUrl: "http://localhost:3001/admin/buyer-applications/test",
            },
          },
        }),
    },
    {
      label: "supplier_application_admin_alert",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "supplier_application_admin_alert",
            data: {
              applicationId: "app-supplier-test",
              companyName: "Tedarikçi A.Ş.",
              contactName: "Yetkili Kişi",
              contactEmail: TEST_EMAIL,
              contactPhone: "+90 555 555 55 55",
              taxNumber: "1234567890",
              city: "İstanbul",
              industry: "Üretim",
              invitedByTenantName: "Demo Şirket",
              reviewUrl:
                "http://localhost:3001/admin/supplier-applications/test",
            },
          },
        }),
    },
    {
      label: "buyer_application_approved",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "buyer_application_approved",
            data: {
              firstName: "Test",
              companyName: "Test A.Ş.",
              loginUrl: "http://localhost:3000/login",
            },
          },
        }),
    },
    {
      label: "supplier_application_approved",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "supplier_application_approved",
            data: {
              firstName: "Test",
              companyName: "Tedarikçi A.Ş.",
              loginUrl: "http://localhost:3000/supplier/login",
              invitedByTenantName: "Demo Şirket",
            },
          },
        }),
    },
    {
      label: "application_rejected",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "application_rejected",
            data: {
              firstName: "Test",
              companyName: "Test A.Ş.",
              applicantType: "buyer",
              rejectionReason:
                "Vergi numarası geçerliliği doğrulanamadı. Belgeleri kontrol edip tekrar başvurabilirsiniz.",
              supportEmail: "destek@supkeys.com",
            },
          },
        }),
    },
    {
      label: "supplier_invitation (yeni tedarikçi)",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "supplier_invitation",
            data: {
              inviterTenantName: "Demo Şirket",
              inviterUserName: "Demo Admin",
              contactName: "Tedarikçi Yetkili",
              message: "Bizimle çalışmak ister misiniz?",
              acceptUrl:
                "http://localhost:3000/register/supplier?invitation=test",
              isExistingSupplier: false,
              expiresAt: ISO_FUTURE(7),
            },
          },
        }),
    },
    {
      label: "supplier_invitation (mevcut tedarikçi)",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "supplier_invitation",
            data: {
              inviterTenantName: "Demo Şirket",
              inviterUserName: "Demo Admin",
              contactName: "Tedarikçi Yetkili",
              acceptUrl: "http://localhost:3000/supplier/login?next=test",
              isExistingSupplier: true,
              shortCode: "K7X9-3M2P",
              expiresAt: ISO_FUTURE(7),
            },
          },
        }),
    },
    {
      label: "supplier_relation_established_buyer",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "supplier_relation_established_buyer",
            data: {
              adminFirstName: "Demo",
              tenantName: "Demo Şirket",
              supplierCompanyName: "Tedarikçi A.Ş.",
              supplierTaxNumber: "1112223334",
              supplierCity: "İstanbul",
              supplierIndustry: "Üretim",
              supplierContactEmail: TEST_EMAIL,
              tedarikciDetayUrl:
                "http://localhost:3000/dashboard/tedarikciler?tab=approved",
            },
          },
        }),
    },
    {
      label: "supplier_relation_established_supplier",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "supplier_relation_established_supplier",
            data: {
              supplierUserName: "Tedarikçi Yetkili",
              tenantName: "Demo Şirket",
              profileUrl: "http://localhost:3000/supplier/profil",
            },
          },
        }),
    },
    {
      label: "user_invitation",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "user_invitation",
            data: {
              recipientEmail: TEST_EMAIL,
              tenantName: "Demo Şirket",
              inviterName: "Demo Admin",
              role: "BUYER",
              roleLabel: "Satınalmacı",
              acceptUrl: "http://localhost:3000/accept-invite/test-token",
              expiresInDays: 7,
            },
          },
        }),
    },
    {
      label: "tender_invitation",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "tender_invitation",
            data: {
              supplierUserName: "Tedarikçi Yetkili",
              tenantName: "Demo Şirket",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              tenderUrl: "http://localhost:3000/supplier/ihaleler/test",
              itemCount: 5,
              bidsCloseAtFormatted: "12 Mayıs 2026, 17:00",
            },
          },
        }),
    },
    {
      label: "tender_closed_supplier (teklif vermiş)",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "tender_closed_supplier",
            data: {
              supplierUserName: "Tedarikçi Yetkili",
              tenantName: "Demo Şirket",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              hasBid: true,
              tenderUrl: "http://localhost:3000/supplier/ihaleler/test",
            },
          },
        }),
    },
    {
      label: "tender_closed_buyer",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "tender_closed_buyer",
            data: {
              buyerFirstName: "Demo",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              bidCount: 3,
              invitedCount: 5,
              tenderUrl: "http://localhost:3000/dashboard/ihaleler/test",
            },
          },
        }),
    },
    {
      label: "bid_eliminated_supplier (yeniden teklif edebilir)",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "bid_eliminated_supplier",
            data: {
              supplierUserName: "Tedarikçi Yetkili",
              tenantName: "Demo Şirket",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              eliminationReason:
                "Hedef fiyatların üzerinde teklif verdiniz, daha rekabetçi fiyatla yeniden teklif verebilirsiniz.",
              canResubmit: true,
              tenderUrl: "http://localhost:3000/supplier/ihaleler/test",
              submitNewBidUrl:
                "http://localhost:3000/supplier/ihaleler/test/teklif-ver",
            },
          },
        }),
    },
    {
      label: "award_won_supplier",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "award_won_supplier",
            data: {
              supplierUserName: "Tedarikçi Yetkili",
              tenantName: "Demo Şirket",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              orderNumber: "ORD-2026-0001",
              winningItemsCount: 5,
              totalItemsCount: 5,
              isFullWin: true,
              totalAmount: 25000,
              currency: "TRY",
              orderUrl: "http://localhost:3000/supplier/siparisler/test",
            },
          },
        }),
    },
    {
      label: "award_lost_supplier",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "award_lost_supplier",
            data: {
              supplierUserName: "Tedarikçi Yetkili",
              tenantName: "Demo Şirket",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              tenderUrl: "http://localhost:3000/supplier/ihaleler/test",
            },
          },
        }),
    },
    {
      label: "award_completed_buyer",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "award_completed_buyer",
            data: {
              buyerFirstName: "Demo",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              totalOrders: 2,
              winnerCount: 2,
              loserCount: 1,
              totalSpend: 50000,
              currency: "TRY",
              tenderUrl: "http://localhost:3000/dashboard/ihaleler/test",
            },
          },
        }),
    },
    {
      label: "approval_required",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "approval_required",
            data: {
              approverFirstName: "Onaycı",
              approvalNumber: "APR-2026-0001",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              initiatorName: "Demo Admin",
              flowName: "10K Üstü Onayı",
              amount: 25000,
              currency: "TRY",
              approvalType: "TENDER_PUBLISH",
              approvalUrl:
                "http://localhost:3000/dashboard/onay-bekleyenler/test",
              initiatorNote: "Onayınızı rica ederim.",
            },
          },
        }),
    },
    {
      label: "approval_required (otomatik atama / fallback)",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "approval_required",
            data: {
              approverFirstName: "Yedek Admin",
              approvalNumber: "APR-2026-0002",
              tenderNumber: "SUPK-2026-0002",
              tenderTitle: "IT Donanım İhalesi",
              initiatorName: "Demo Admin",
              flowName: "10K Üstü Onayı",
              amount: 50000,
              currency: "TRY",
              approvalType: "TENDER_AWARD",
              approvalUrl:
                "http://localhost:3000/dashboard/onay-bekleyenler/test",
              isFallback: true,
              originalApproverName: "Mehmet Onaycı",
            },
          },
        }),
    },
    {
      label: "approval_approved",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "approval_approved",
            data: {
              initiatorFirstName: "Demo",
              approvalNumber: "APR-2026-0001",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              flowName: "10K Üstü Onayı",
              approvalType: "TENDER_PUBLISH",
              approverCount: 1,
              lastApproverName: "Onaycı Test",
              tenderUrl: "http://localhost:3000/dashboard/ihaleler/test",
            },
          },
        }),
    },
    {
      label: "approval_rejected",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "approval_rejected",
            data: {
              initiatorFirstName: "Demo",
              approvalNumber: "APR-2026-0001",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              flowName: "10K Üstü Onayı",
              approvalType: "TENDER_PUBLISH",
              rejectorName: "Onaycı Test",
              rejectionNote:
                "Bütçe yetersiz. Hedef fiyatları gözden geçirip tekrar başvurun.",
              tenderUrl: "http://localhost:3000/dashboard/ihaleler/test",
            },
          },
        }),
    },
    {
      label: "approval_reminder",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "approval_reminder",
            data: {
              approverFirstName: "Onaycı",
              approvalNumber: "APR-2026-0001",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              initiatorName: "Demo Admin",
              flowName: "10K Üstü Onayı",
              amount: 25000,
              currency: "TRY",
              approvalType: "TENDER_PUBLISH",
              approvalUrl:
                "http://localhost:3000/dashboard/onay-bekleyenler/test",
              daysWaiting: 4,
            },
          },
        }),
    },
    {
      label: "order_status_changed (IN_DELIVERY → alıcı)",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "order_status_changed",
            data: {
              recipientName: "Demo Admin",
              recipient: "buyer",
              orderNumber: "ORD-2026-0001",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              newStatus: "IN_DELIVERY",
              oldStatus: "PENDING",
              note: "Aras Kargo - 1234567890",
              expectedDeliveryDate: ISO_FUTURE(5),
              orderUrl: "http://localhost:3000/dashboard/siparisler/test",
            },
          },
        }),
    },
    {
      label: "order_status_changed (COMPLETED → tedarikçi)",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "order_status_changed",
            data: {
              recipientName: "Tedarikçi Yetkili",
              recipient: "supplier",
              orderNumber: "ORD-2026-0001",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              newStatus: "COMPLETED",
              oldStatus: "IN_DELIVERY",
              note: "Tüm kalemler eksiksiz teslim alındı.",
              orderUrl: "http://localhost:3000/supplier/siparisler/test",
            },
          },
        }),
    },
    {
      label: "order_status_changed (CANCELLED → tedarikçi)",
      run: () =>
        queue.enqueue({
          to,
          templateData: {
            template: "order_status_changed",
            data: {
              recipientName: "Tedarikçi Yetkili",
              recipient: "supplier",
              orderNumber: "ORD-2026-0001",
              tenderNumber: "SUPK-2026-0001",
              tenderTitle: "Ofis Mobilya İhalesi",
              newStatus: "CANCELLED",
              oldStatus: "PENDING",
              note: "İhtiyaç değişti, alternatif tedarikçi ile devam edilecek.",
              orderUrl: "http://localhost:3000/supplier/siparisler/test",
            },
          },
        }),
    },
  ];

  console.log(
    `\n📧  Polish-3 Mailpit visual QA — ${cases.length} şablon gönderiliyor...\n`,
  );

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    try {
      await c.run();
      console.log(`  ✓ ${String(i + 1).padStart(2, "0")}. ${c.label}`);
    } catch (err) {
      console.error(
        `  ✗ ${String(i + 1).padStart(2, "0")}. ${c.label} — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  console.log(
    `\n✓ ${cases.length} şablon enqueue edildi. Mailpit: http://localhost:8025\n`,
  );

  // Async outbox/processor'ın kuyruğu boşaltması için biraz bekle.
  await new Promise((resolve) => setTimeout(resolve, 2000));
  await app.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Test e-posta scripti başarısız:", err);
  process.exit(1);
});
