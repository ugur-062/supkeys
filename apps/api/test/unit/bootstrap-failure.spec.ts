/**
 * Açılış hatası HER ZAMAN görünür (canlı öncesi sağlamlaştırma, 2026-10-07).
 *
 * Kök neden: `bufferLogs: true` Nest Logger'ını tampona alır; açılış
 * `app.listen()`den önce düşerse `Logger.error` satırı tamponda kalır ve
 * `process.exit(1)` onu yazmadan çıkar — Render'da deploy kırmızı, sebep yok.
 * Ölçüldü (dört hatalı yapılandırma, çıktı yalnız dotenv satırları).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Logger } from "@nestjs/common";
import {
  BOOTSTRAP_FAILURE_PREFIX,
  formatBootstrapFailure,
  reportBootstrapFailure,
} from "../../src/common/bootstrap-failure";

describe("formatBootstrapFailure", () => {
  it("Error → önek + stack (sebep metni dahil), satır sonuyla biter", () => {
    const text = formatBootstrapFailure(new Error("R2 storage configuration missing"));
    expect(text.startsWith(BOOTSTRAP_FAILURE_PREFIX)).toBe(true);
    expect(text).toContain("R2 storage configuration missing");
    expect(text).toContain("bootstrap-failure.spec"); // stack
    expect(text.endsWith("\n")).toBe(true);
  });

  it("stack'siz Error ve Error olmayan değer de yazılır", () => {
    const e = new Error("yalnız mesaj");
    e.stack = undefined;
    expect(formatBootstrapFailure(e)).toBe(`${BOOTSTRAP_FAILURE_PREFIX} yalnız mesaj\n`);
    expect(formatBootstrapFailure("düz metin")).toBe(`${BOOTSTRAP_FAILURE_PREFIX} düz metin\n`);
    expect(formatBootstrapFailure(undefined)).toBe(`${BOOTSTRAP_FAILURE_PREFIX} undefined\n`);
  });
});

describe("reportBootstrapFailure", () => {
  it("sebebi ÖNCE stderr'e yazar, SONRA tamponu boşaltır", () => {
    const order: string[] = [];
    const written: string[] = [];
    reportBootstrapFailure(new Error("JWT_SECRET en az 32 karakter olmalı"), {
      writeStderr: (t) => {
        order.push("write");
        written.push(t);
      },
      flushLogs: () => order.push("flush"),
    });
    expect(order).toEqual(["write", "flush"]);
    expect(written.join("")).toContain("JWT_SECRET en az 32 karakter olmalı");
  });

  it("tampon boşaltma düşse de sebep yazılmış olur ve fırlatmaz", () => {
    const written: string[] = [];
    expect(() =>
      reportBootstrapFailure(new Error("sebep"), {
        writeStderr: (t) => written.push(t),
        flushLogs: () => {
          throw new Error("flush patladı");
        },
      }),
    ).not.toThrow();
    expect(written.join("")).toContain("sebep");
  });

  it("stderr yazımı düşse de fırlatmaz ve tamponu yine boşaltır", () => {
    let flushed = false;
    expect(() =>
      reportBootstrapFailure(new Error("sebep"), {
        writeStderr: () => {
          throw new Error("EAGAIN");
        },
        flushLogs: () => {
          flushed = true;
        },
      }),
    ).not.toThrow();
    expect(flushed).toBe(true);
  });

  it("GERÇEK tamponla: tamponda kalan Nest satırları boşaltılır (regresyon: eskiden hiç yazılmıyordu)", () => {
    const seen: string[] = [];
    const sink = {
      log: (m: unknown) => seen.push(String(m)),
      error: (m: unknown) => seen.push(String(m)),
      warn: (m: unknown) => seen.push(String(m)),
    };
    Logger.overrideLogger(sink);
    Logger.attachBuffer();
    try {
      new Logger("StorageService").error("R2 storage configuration missing");
      // Tampon bağlıyken hiçbir şey yazılmaz — eski sessiz çıkışın nedeni.
      expect(seen).toEqual([]);

      const written: string[] = [];
      reportBootstrapFailure(new Error("açılış düştü"), {
        writeStderr: (t) => written.push(t),
        flushLogs: () => Logger.flush(),
      });
      expect(written.join("")).toContain("açılış düştü");
      expect(seen).toEqual(["R2 storage configuration missing"]);
    } finally {
      Logger.detachBuffer();
      Logger.overrideLogger(false);
    }
  });
});

describe("main.ts kablolaması", () => {
  const src = readFileSync(join(__dirname, "../../src/main.ts"), "utf8");

  it("NestFactory.create abortOnError:false ile çağrılır (Nest sebebi yazmadan kendi çıkmasın)", () => {
    const create = src.slice(src.indexOf("NestFactory.create"), src.indexOf("app.useLogger"));
    expect(create).toMatch(/bufferLogs:\s*true/);
    expect(create).toMatch(/abortOnError:\s*false/);
  });

  it("bootstrap().catch sebebi process.exit'ten ÖNCE reportBootstrapFailure ile yazar", () => {
    const tail = src.slice(src.indexOf("bootstrap().catch"));
    const report = tail.indexOf("reportBootstrapFailure(err)");
    const exit = tail.indexOf("process.exit(1)");
    expect(report).toBeGreaterThan(-1);
    expect(exit).toBeGreaterThan(report);
    // Tamponlu Logger tek başına sebebi taşıyamaz.
    expect(tail).not.toMatch(/new Logger\("Bootstrap"\)\.error/);
  });
});
