/**
 * NestJS test modülü factory — gerçek PrismaService + JwtModule kurar.
 * Her test dosyası `createTestingModule()` ile servisi bağımsız mount eder.
 */
import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import type { Provider, Type } from "@nestjs/common";
import { PrismaService } from "../../src/common/prisma/prisma.service";
import { getTestPrisma } from "./db";

interface BuildOpts {
  providers?: Provider[];
  imports?: any[];
  controllers?: Type<unknown>[];
}

export async function buildTestModule(opts: BuildOpts): Promise<TestingModule> {
  const prisma = getTestPrisma();

  const moduleRef = await Test.createTestingModule({
    imports: [
      JwtModule.register({
        secret: process.env.JWT_SECRET ?? "test_jwt_secret",
        signOptions: { expiresIn: "1h" },
      }),
      ...(opts.imports ?? []),
    ],
    controllers: opts.controllers ?? [],
    providers: [
      { provide: PrismaService, useValue: prisma },
      ...(opts.providers ?? []),
    ],
  }).compile();

  return moduleRef;
}
