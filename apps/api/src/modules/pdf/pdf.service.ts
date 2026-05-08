import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import puppeteer, { type Browser } from "puppeteer";

/**
 * V1.5 Oturum 2 — Tek browser instance, çoklu page.
 * onModuleInit'te lazy-launch (hata olursa later attempt'te tekrar denenir).
 * Production'da Docker image içinde Chromium pre-installed.
 */
@Injectable()
export class PdfService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;

  async onModuleInit(): Promise<void> {
    // Sessiz launch denemesi — hata olursa start-up'ı bloke etme.
    try {
      await this.ensureBrowser();
      this.logger.log("Puppeteer ready");
    } catch (err) {
      this.logger.warn(
        `Puppeteer init deferred: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (err) {
        this.logger.warn(
          `Browser close error: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
      this.browser = null;
      this.logger.log("Puppeteer closed");
    }
  }

  private async ensureBrowser(): Promise<Browser> {
    if (this.browser && this.browser.connected) return this.browser;
    if (this.launching) return this.launching;

    this.launching = puppeteer
      .launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--disable-gpu",
        ],
      })
      .then((b) => {
        this.browser = b;
        this.launching = null;
        return b;
      })
      .catch((err) => {
        this.launching = null;
        throw err;
      });

    return this.launching;
  }

  /**
   * Verilen HTML'i A4 PDF buffer'ına çevirir.
   */
  async generatePdfFromHtml(
    html: string,
    options?: { format?: "A4" | "Letter"; landscape?: boolean },
  ): Promise<Buffer> {
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();
    try {
      await page.setContent(html, {
        waitUntil: "networkidle0",
        timeout: 30_000,
      });

      const pdf = await page.pdf({
        format: options?.format ?? "A4",
        landscape: options?.landscape ?? false,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        printBackground: true,
      });

      return Buffer.from(pdf);
    } finally {
      await page.close();
    }
  }
}
