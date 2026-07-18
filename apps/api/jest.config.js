/**
 * Integration test config. LOKAL izole Postgres'e (docker-compose.test.yml,
 * `rothern_test` şeması) bağlanır — apps/api/.env.test + test/integration/env.ts.
 * Seri koşar (maxWorkers: 1): tek DB, deterministik TRUNCATE izolasyonu.
 */
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/test"],
  testMatch: ["**/*.spec.ts"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      { tsconfig: "<rootDir>/tsconfig.spec.json" },
    ],
  },
  moduleNameMapper: {
    "^@rothern/db$": "<rootDir>/../../packages/db/src/index.ts",
    "^@rothern/shared$": "<rootDir>/../../packages/shared/src/index.ts",
  },
  globalSetup: "<rootDir>/test/integration/global-setup.ts",
  maxWorkers: 1,
  testTimeout: 30000,
  // Coverage (test:cov / CI). Kritik dosyalarda %80 hedefi (CLAUDE.md).
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.module.ts",
    "!src/**/*.dto.ts",
    "!src/main.ts",
    "!src/**/*.d.ts",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text-summary", "json-summary", "lcov"],
};
