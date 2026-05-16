import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/src", "<rootDir>/test"],
  testRegex: ".*\\.spec\\.ts$",
  setupFilesAfterEnv: ["<rootDir>/test/setup.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  transform: {
    "^.+\\.ts$": [
      "ts-jest",
      {
        tsconfig: "<rootDir>/tsconfig.test.json",
      },
    ],
  },
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.module.ts",
    "!src/main.ts",
    "!src/scripts/**",
    "!src/**/dto/**",
    "!src/**/types.ts",
    "!src/**/index.ts",
    "!src/**/*.d.ts",
  ],
  coverageDirectory: "<rootDir>/coverage",
  coverageReporters: ["text", "text-summary", "lcov", "html", "json-summary"],
  coverageThreshold: {
    // Bu turda test edilen *kritik* dosyalarda %60+ hedef. Genel proje
    // hedefi yok (60+ servisten 5'i test edildi — global ölçüm yanıltıcı).
    // Sonraki turlarda yeni servisler için ekle.
    "src/modules/tenant-orders/services/tenant-orders.service.ts": {
      statements: 85,
      branches: 75,
      functions: 85,
      lines: 85,
    },
    "src/modules/supplier-orders/services/supplier-orders.service.ts": {
      statements: 70,
      branches: 55,
      functions: 70,
      lines: 70,
    },
    "src/modules/supplier-tenders/services/supplier-tenders.service.ts": {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    "src/modules/categories/services/category.service.ts": {
      statements: 85,
      branches: 65,
      functions: 85,
      lines: 85,
    },
    "src/modules/currency/services/exchange-rate.service.ts": {
      statements: 85,
      branches: 75,
      functions: 90,
      lines: 85,
    },
    "src/modules/tenant-approval-requests/services/tenant-approval-requests.service.ts": {
      statements: 65,
      branches: 50,
      functions: 65,
      lines: 65,
    },
    "src/modules/tenant-approval-requests/services/approval-reminder.service.ts": {
      statements: 85,
      branches: 65,
      functions: 70,
      lines: 85,
    },
    "src/modules/tenant-tenders/services/tenant-tenders.service.ts": {
      statements: 55,
      branches: 40,
      functions: 50,
      lines: 55,
    },
    "src/modules/auth/auth.service.ts": {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    "src/modules/admin-auth/admin-auth.service.ts": {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
    "src/modules/supplier-auth/services/supplier-auth.service.ts": {
      statements: 90,
      branches: 80,
      functions: 60,
      lines: 90,
    },
    "src/modules/auth/permissions/permissions.utils.ts": {
      statements: 100,
      branches: 90,
      functions: 100,
      lines: 100,
    },
    "src/modules/auth/auth.controller.ts": {
      statements: 100,
      branches: 60,
      functions: 100,
      lines: 100,
    },
    "src/modules/admin-auth/admin-auth.controller.ts": {
      statements: 100,
      branches: 60,
      functions: 100,
      lines: 100,
    },
    "src/modules/supplier-auth/controllers/supplier-auth.controller.ts": {
      statements: 100,
      branches: 60,
      functions: 100,
      lines: 100,
    },
    "src/modules/tenant-orders/controllers/tenant-orders.controller.ts": {
      statements: 80,
      branches: 60,
      functions: 80,
      lines: 80,
    },
    "src/modules/supplier-orders/controllers/supplier-orders.controller.ts": {
      statements: 80,
      branches: 60,
      functions: 80,
      lines: 75,
    },
    "src/modules/tenant-approval-requests/controllers/tenant-approval-requests.controller.ts": {
      statements: 80,
      branches: 50,
      functions: 80,
      lines: 80,
    },
    "src/modules/tenant-users/controllers/tenant-users.controller.ts": {
      statements: 80,
      branches: 50,
      functions: 55,
      lines: 80,
    },
    "src/modules/tenant-tenders/controllers/tenant-tenders.controller.ts": {
      statements: 80,
      branches: 50,
      functions: 80,
      lines: 80,
    },
    "src/modules/supplier-tenders/controllers/supplier-tenders.controller.ts": {
      statements: 80,
      branches: 50,
      functions: 75,
      lines: 80,
    },
    "src/modules/tenant-suppliers/controllers/tenant-suppliers.controller.ts": {
      statements: 85,
      branches: 50,
      functions: 85,
      lines: 85,
    },
    "src/modules/tenant-addresses/controllers/tenant-addresses.controller.ts": {
      statements: 85,
      branches: 50,
      functions: 85,
      lines: 85,
    },
  },
  testTimeout: 30_000,
  // Integration testler arasında DB clean state için sıralı çalış
  maxWorkers: 1,
};

export default config;
