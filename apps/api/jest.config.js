/**
 * Integration test config — company-listings (ihaleler) modülü.
 * Gerçek Postgres'e (Supabase, izole `rothern_test` şeması) bağlanır.
 * Paylaşılan DB olduğundan paralel koşmaz (maxWorkers: 1).
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
};
