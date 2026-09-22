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
    // @rothern/i18n DIST'ten: use-intl yalnız ESM dağıtıyor, jest'in CJS
    // yükleyicisi onu require edemez; paketin build'i çevirmeni CJS'e gömer
    // (packages/i18n/scripts/bundle-translator.mjs). Testten önce
    // `pnpm --filter @rothern/i18n build` şart (CI: typecheck → turbo ^build).
    "^@rothern/i18n$": "<rootDir>/../../packages/i18n/dist/index.js",
    "^@rothern/i18n/(messages|translator|glossary)$": "<rootDir>/../../packages/i18n/dist/$1.js",
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
