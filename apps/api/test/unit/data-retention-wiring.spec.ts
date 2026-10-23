import "reflect-metadata";
import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "../../src/app.module";
import { SessionRevocationScheduler } from "../../src/common/auth/session-revocation.scheduler";
import { SessionRevocationService } from "../../src/common/auth/session-revocation.service";
import { PrismaBypassService } from "../../src/common/prisma/prisma.service";
import { AiScheduler } from "../../src/modules/ai/ai.scheduler";
import { UnverifiedSignupScheduler } from "../../src/modules/company-auth/schedulers/unverified-signup.scheduler";
import { UnverifiedSignupCleanupService } from "../../src/modules/company-auth/services/unverified-signup-cleanup.service";
import { CompanyViewsScheduler } from "../../src/modules/company-views/company-views.scheduler";
import { CompanyViewsService } from "../../src/modules/company-views/company-views.service";
import { DataRetentionModule } from "../../src/modules/data-retention/data-retention.module";
import { RetentionRecordService } from "../../src/modules/data-retention/retention-record.service";

/**
 * The older purge jobs take the imha record writer as an OPTIONAL dependency.
 * Optional means a broken wiring would not fail at start-up: an import cycle
 * that leaves the class undefined when a scheduler is declared, the module
 * missing from the app, or a visibility mistake (the writer not exported, the
 * module not global) would silently inject `undefined` and stop their imha
 * records (policy section 10). Loaded in the app's own import order
 * (`AppModule` first); the container test below resolves the real classes.
 */
describe("imha record wiring", () => {
  it("the retention module is part of the app and exports the record writer globally", () => {
    const imports = Reflect.getMetadata("imports", AppModule) as unknown[];
    expect(imports).toContain(DataRetentionModule);
    expect(Reflect.getMetadata("exports", DataRetentionModule)).toContain(RetentionRecordService);
    expect(Reflect.getMetadata("__module:global__", DataRetentionModule)).toBe(true);
  });

  it.each([
    ["views.purge", CompanyViewsScheduler],
    ["sessions.purgeRevoked", SessionRevocationScheduler],
    ["ai.cleanupChatSessions / ai.cleanupExtractFiles", AiScheduler],
    ["signup.purgeUnverified", UnverifiedSignupScheduler],
  ] as const)("%s: the writer is a resolvable constructor dependency", (_job, scheduler) => {
    const params = Reflect.getMetadata("design:paramtypes", scheduler) as unknown[];
    expect(RetentionRecordService).toBeDefined();
    expect(params).toContain(RetentionRecordService);
  });

  /**
   * The Nest container itself: the schedulers live in a module that imports
   * nothing (as in the app, where their own modules do not import the
   * retention module) and must still receive a real `RetentionRecordService`
   * through the global export - not `undefined`.
   */
  it("in a Nest container every older purge job receives a real RetentionRecordService", async () => {
    @Global()
    @Module({
      providers: [
        { provide: PrismaBypassService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
      exports: [PrismaBypassService, ConfigService],
    })
    class InfraStubModule {}

    @Module({
      providers: [
        CompanyViewsScheduler,
        SessionRevocationScheduler,
        AiScheduler,
        UnverifiedSignupScheduler,
        { provide: CompanyViewsService, useValue: {} },
        { provide: SessionRevocationService, useValue: {} },
        { provide: UnverifiedSignupCleanupService, useValue: { enabled: false } },
      ],
    })
    class SchedulersModule {}

    @Module({ imports: [InfraStubModule, DataRetentionModule, SchedulersModule] })
    class RootModule {}

    // The AI scheduler schedules its boot catch-up at init: not in this test.
    const aiInit = jest.spyOn(AiScheduler.prototype, "onModuleInit").mockImplementation(() => undefined);
    // `@nestjs/testing` is not installed in this package: the plain application context.
    const app = await NestFactory.createApplicationContext(RootModule, { logger: false });
    try {
      for (const scheduler of [CompanyViewsScheduler, SessionRevocationScheduler, AiScheduler, UnverifiedSignupScheduler]) {
        const instance = app.get(scheduler, { strict: false }) as unknown as { records?: unknown };
        expect(instance.records).toBeInstanceOf(RetentionRecordService);
      }
    } finally {
      await app.close();
      aiInit.mockRestore();
    }
  });
});
