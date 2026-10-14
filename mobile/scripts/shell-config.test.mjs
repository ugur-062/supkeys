// Kabuğun anlık bildirim değişmezleri — Gradle / Xcode gerektirmeden koşar:
//   cd mobile && npm test
// Capacitor şablonu yeniden üretilirse (ör. `cap add`) eski davranışlar geri gelir; bu
// sınamalar onu yakalar. Gerçek Gradle doğrulaması README "Mağaza paketi"ndeki gibi
// `./gradlew -m :app:bundleRelease` (dosyasız kopyada hata, dosyalıda başarı).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(path.join(mobile, rel), "utf8");

test("a push that arrives in the foreground shows no native banner, heads-up or sound", async () => {
  // Web shows the same row as an in-app LiveToasts card with its own sound
  // (apps/web/src/components/company/native-push-registrar.tsx).
  const { default: config } = await import("../capacitor.config.ts");
  const options = config.plugins?.PushNotifications?.presentationOptions ?? [];
  for (const shown of ["alert", "banner", "list", "sound"]) {
    assert.ok(!options.includes(shown), `PushNotifications.presentationOptions must not contain "${shown}"`);
  }
});

test("an Android release build fails when google-services.json is missing", () => {
  const gradle = read("android/app/build.gradle");
  // The Capacitor template swallowed the missing file with a hidden logger.info line.
  assert.doesNotMatch(gradle, /catch\s*\(\s*Exception/, "the template's silent google-services skip is back");
  assert.match(gradle, /apply plugin: 'com\.google\.gms\.google-services'/);
  assert.match(gradle, /gradle\.taskGraph\.whenReady/);
  assert.match(gradle, /name\.contains\('Release'\)/);
  assert.match(gradle, /throw new GradleException/);
});

test("iOS never hands the raw APNs token to the plugin (the backend sends through FCM only)", () => {
  const swift = read("ios/App/App/AppDelegate.swift");
  assert.doesNotMatch(
    swift,
    /capacitorDidRegisterForRemoteNotifications,\s*object:\s*deviceToken/,
    "the raw APNs Data must not be posted as a registration",
  );
  const registered = [...swift.matchAll(/capacitorDidRegisterForRemoteNotifications,\s*object:\s*(\w+)/g)].map(
    (m) => m[1],
  );
  assert.deepEqual(registered, ["token"], "only the FCM token may be posted as a registration");
  const handler = swift.slice(swift.indexOf("didRegisterForRemoteNotificationsWithDeviceToken"));
  const fallback = handler.slice(handler.indexOf("#endif"), handler.indexOf("didFailToRegisterForRemoteNotificationsWithError"));
  assert.match(fallback, /capacitorDidFailToRegisterForRemoteNotifications/, "the non-Firebase path must report a failure");
});
