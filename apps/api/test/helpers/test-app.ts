/**
 * E2E test app factory.
 *
 * Asıl `AppModule` BullMQ + R2 + Puppeteer + Cron + Resend bağlantısı kurar —
 * test ortamında bu maliyetli ve test kapsamı dışı. Burada sadece istenen
 * modüllerin bağımsız bir HTTP uygulaması inşa edilir; ValidationPipe ve
 * ThrottlerModule de main.ts ile aynı şekilde register edilir.
 *
 * Kullanım:
 *   const app = await buildTestApp({ imports: [AuthModule], providers: [
 *     { provide: PrismaService, useValue: prisma },
 *   ]});
 *   await request(app.getHttpServer()).post("/api/auth/login").send({...});
 */
import {
  BadRequestException,
  type INestApplication,
  type Type,
  ValidationPipe,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { Test, type TestingModuleBuilder } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import type { ValidationError } from "class-validator";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { PrismaModule } from "../../src/common/prisma/prisma.module";
import { translateValidatorMessage } from "../../src/common/error-messages";
import { getTestPrisma } from "./db";

interface BuildAppOpts {
  imports?: any[];
  controllers?: Type<unknown>[];
  providers?: any[];
  /** Throttler aktif olsun mu — true ise rate limit test edilebilir */
  enableThrottler?: boolean;
}

/**
 * main.ts ile aynı ValidationPipe — class-validator TR mesajlarla
 * `{ message, errors: {field: msg} }` shape döner.
 */
function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]) => {
      const fieldErrors: Record<string, string> = {};
      const collect = (errs: ValidationError[], prefix = ""): void => {
        for (const err of errs) {
          const path = prefix ? `${prefix}.${err.property}` : err.property;
          if (err.constraints) {
            const values = Object.values(err.constraints);
            fieldErrors[path] = translateValidatorMessage(
              values[0] ?? "Geçersiz değer",
            );
          }
          if (err.children && err.children.length > 0) {
            collect(err.children, path);
          }
        }
      };
      collect(errors);
      return new BadRequestException({
        statusCode: 400,
        error: "Bad Request",
        message: "Doğrulama hatası",
        errors: fieldErrors,
      });
    },
  });
}

export async function buildTestApp(
  opts: BuildAppOpts,
): Promise<INestApplication> {
  const prisma = getTestPrisma();

  const imports = [
    ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
    // PrismaModule @Global — bir kez import + her modülde erişilebilir.
    // Aşağıda PrismaService override edilerek test DB'sine yönlendirilir.
    PrismaModule,
    ...(opts.imports ?? []),
  ];
  if (opts.enableThrottler !== false) {
    imports.push(
      ThrottlerModule.forRoot([
        { name: "default", ttl: 60_000, limit: 100 },
        { name: "auth", ttl: 60_000, limit: 10 },
      ]),
    );
  }

  let builder: TestingModuleBuilder = Test.createTestingModule({
    imports,
    controllers: opts.controllers ?? [],
    providers: [
      ...(opts.enableThrottler !== false
        ? [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
        : []),
      ...(opts.providers ?? []),
    ],
  })
    // PrismaModule sağlıyor; ama test DB'sine bağlı instance'ı override et.
    .overrideProvider(PrismaService)
    .useValue(prisma);

  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ bodyParser: true });
  app.setGlobalPrefix("api");
  app.useGlobalPipes(buildValidationPipe());
  await app.init();
  return app;
}
