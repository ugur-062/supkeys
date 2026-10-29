// Kabuğun anlık bildirim değişmezleri — Gradle / Xcode gerektirmeden koşar:
//   cd mobile && npm test
// Capacitor şablonu yeniden üretilirse (ör. `cap add`) eski davranışlar geri gelir; bu
// sınamalar onu yakalar. Gerçek Gradle doğrulaması README "Mağaza paketi"ndeki gibi
// `./gradlew -m :app:bundleRelease` (dosyasız kopyada hata, dosyalıda başarı).
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
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

test("the store build never allows cleartext traffic and never carries the staging bypass", async () => {
  delete process.env.ROTHERN_APP_URL;
  delete process.env.ROTHERN_VERCEL_BYPASS;
  const { default: config } = await import(`../capacitor.config.ts?store=${Date.now()}`);
  assert.equal(config.server?.url, "https://www.rothern.com");
  assert.equal(config.server?.cleartext, false);
  assert.equal(config.server?.appStartPath, "/company");
});

test("the iOS start path exists in the bundled web assets (iOS exits on launch otherwise)", async () => {
  // Capacitor iOS checks public/<appStartPath> on disk before loading even a remote server.url
  // (CAPBridgeViewController.loadWebView → fileExists, else exit(1)); www/ is copied to public/.
  delete process.env.ROTHERN_APP_URL;
  delete process.env.ROTHERN_VERCEL_BYPASS;
  const { default: config } = await import(`../capacitor.config.ts?start=${Date.now()}`);
  const startPath = (config.server?.appStartPath ?? "").replace(/^\/+/, "");
  assert.ok(startPath, "appStartPath is set");
  assert.ok(existsSync(path.join(mobile, config.webDir ?? "www", startPath)), `${config.webDir}/${startPath} must exist`);
});

// Dosya paylaşma ve yazdırma (web: `apps/web/src/lib/native-shell.ts`). Web eklentileri kabuğun
// enjekte ettiği `window.Capacitor.Plugins.<Ad>`dan okur; ad ya da kayıt kayarsa web eklentiyi
// "yok" sayar ve kullanıcıya "siteden indirin / yazdırın" der — hata vermeden.
const fileSharingPlugins = { "@capacitor/filesystem": "8.1.4", "@capacitor/share": "8.0.3" };

test("the file sharing plugins are exact-version dependencies and are synced into both platforms", () => {
  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  for (const [name, version] of Object.entries(fileSharingPlugins)) {
    assert.equal(pkg.dependencies?.[name], version, `${name} must be pinned to exactly ${version}`);
    assert.equal(lock.packages?.[`node_modules/${name}`]?.version, version, `package-lock must resolve ${name}@${version}`);
  }
  // `cap sync` after the dependency change: the tracked generated files list both plugins.
  const settings = read("android/capacitor.settings.gradle");
  const build = read("android/app/capacitor.build.gradle");
  const spm = read("ios/App/CapApp-SPM/Package.swift");
  for (const module of ["capacitor-filesystem", "capacitor-share"]) {
    assert.match(settings, new RegExp(`include ':${module}'`), `${module} is missing from capacitor.settings.gradle (run npx cap sync)`);
    assert.match(build, new RegExp(`implementation project\\(':${module}'\\)`), `${module} is missing from capacitor.build.gradle`);
  }
  for (const product of ["CapacitorFilesystem", "CapacitorShare"]) {
    assert.match(spm, new RegExp(`\\.product\\(name: "${product}"`), `${product} is missing from CapApp-SPM/Package.swift`);
  }
});

test("Android exposes the print bridge as RothernPrint and registers it before the bridge starts", () => {
  const plugin = read("android/app/src/main/java/com/rothern/app/PrintPlugin.java");
  assert.match(plugin, /@CapacitorPlugin\(\s*name\s*=\s*"RothernPrint"\s*\)/);
  assert.match(plugin, /@PluginMethod\s+public void print\(PluginCall call\)/);
  assert.match(plugin, /createPrintDocumentAdapter\(/);
  // The offscreen WebView must stay strongly referenced until the job exists.
  assert.match(plugin, /activeWebViews\.add\(webView\)/);

  const activity = read("android/app/src/main/java/com/rothern/app/MainActivity.java");
  const register = activity.indexOf("registerPlugin(PrintPlugin.class)");
  const superCreate = activity.indexOf("super.onCreate(savedInstanceState)");
  assert.ok(register !== -1, "MainActivity must register PrintPlugin");
  assert.ok(superCreate !== -1 && register < superCreate, "PrintPlugin must be registered before super.onCreate");
});

test("iOS registers the print bridge as RothernPrint on the view controller the app actually shows", () => {
  const swift = read("ios/App/App/AppDelegate.swift");
  assert.match(swift, /class MainViewController:\s*CAPBridgeViewController/);
  const didLoad = swift.slice(swift.indexOf("func capacitorDidLoad()"));
  assert.match(didLoad.slice(0, 200), /bridge\?\.registerPluginInstance\(PrintPlugin\(\)\)/);
  assert.match(swift, /class PrintPlugin:\s*CAPPlugin,\s*CAPBridgedPlugin/);
  assert.match(swift, /jsName\s*=\s*"RothernPrint"/);
  assert.match(swift, /CAPPluginMethod\(name:\s*"print",\s*returnType:\s*CAPPluginReturnPromise\)/);
  assert.match(swift, /UIMarkupTextPrintFormatter\(markupText:/);

  const storyboard = read("ios/App/App/Base.lproj/Main.storyboard");
  assert.match(storyboard, /customClass="MainViewController" customModule="App" customModuleProvider="target"/);
  assert.doesNotMatch(storyboard, /customClass="CAPBridgeViewController"/);
  // The scene delegate builds the root view controller in code; a plain CAPBridgeViewController there
  // would hide the plugin even with the storyboard updated.
  const scene = read("ios/App/App/SceneDelegate.swift");
  assert.match(scene, /rootViewController = MainViewController\(\)/);
  assert.doesNotMatch(scene, /CAPBridgeViewController\(\)/);
});

// App Store: hedef dosyaları Xcode olmadan sınanır. Proje dosyasındaki bağlar (build file → faz, ürün bağımlılığı
// → hedef) kopukken Xcode yine derler ama özellik sessizce yok olur; bu yüzden bağın kendisi sınanır.
const pbxproj = () => read("ios/App/App.xcodeproj/project.pbxproj");
const phaseFiles = (pbx, phase) => {
  const start = pbx.indexOf(`/* ${phase} */ = {\n\t\t\tisa = PBX${phase}BuildPhase;`);
  assert.ok(start > 0, `${phase} build phase exists`);
  return pbx.slice(start, pbx.indexOf(");", start));
};

test("the iOS app target links FirebaseMessaging (without it the device never registers for push)", () => {
  const pbx = pbxproj();
  const dep = pbx.match(/(\w{24}) \/\* FirebaseMessaging \*\/ = \{\n\t+isa = XCSwiftPackageProductDependency;\n\t+package = (\w{24}) \/\* XCRemoteSwiftPackageReference "firebase-ios-sdk" \*\/;\n\t+productName = FirebaseMessaging;/);
  assert.ok(dep, "FirebaseMessaging product dependency on the firebase-ios-sdk package");
  const target = pbx.slice(pbx.indexOf("isa = PBXNativeTarget;"), pbx.indexOf("/* End PBXNativeTarget section */"));
  assert.match(target, new RegExp(`packageProductDependencies = \\([^)]*${dep[1]} /\\* FirebaseMessaging \\*/`));
  const buildFile = pbx.match(new RegExp(`(\\w{24}) /\\* FirebaseMessaging in Frameworks \\*/ = \\{isa = PBXBuildFile; productRef = ${dep[1]} `));
  assert.ok(buildFile, "FirebaseMessaging build file");
  assert.match(phaseFiles(pbx, "Frameworks"), new RegExp(`${buildFile[1]} /\\* FirebaseMessaging in Frameworks \\*/`));
  // Analytics brings the advertising identifier and tracking disclosures; only Messaging is linked.
  assert.doesNotMatch(pbx, /productName = FirebaseAnalytics/);
});

test("iOS declares camera and photo-save purpose strings in every app language (a missing one crashes the picker)", () => {
  const plist = read("ios/App/App/Info.plist");
  for (const key of ["NSCameraUsageDescription", "NSPhotoLibraryAddUsageDescription"]) {
    assert.match(plist, new RegExp(`<key>${key}</key>\\s*<string>Rothern [^<]{20,}</string>`), key);
  }
  assert.match(plist, /<key>CFBundleLocalizations<\/key>\s*<array>\s*<string>en<\/string>\s*<string>tr<\/string>\s*<string>ru<\/string>\s*<\/array>/);
  const pbx = pbxproj();
  assert.match(pbx, /knownRegions = \(\s*en,\s*Base,\s*tr,\s*ru,\s*\);/);
  for (const lang of ["en", "tr", "ru"]) {
    const strings = read(`ios/App/App/${lang}.lproj/InfoPlist.strings`);
    for (const key of ["NSCameraUsageDescription", "NSPhotoLibraryAddUsageDescription"]) {
      assert.match(strings, new RegExp(`^"${key}" = "Rothern[^"]{20,}";$`, "m"), `${lang} ${key}`);
    }
    assert.match(pbx, new RegExp(`\\w{24} /\\* ${lang} \\*/ = \\{isa = PBXFileReference; lastKnownFileType = text.plist.strings; name = ${lang}; path = ${lang}.lproj/InfoPlist.strings;`));
  }
  const variant = pbx.match(/(\w{24}) \/\* InfoPlist.strings \*\/ = \{\n\t+isa = PBXVariantGroup;/);
  assert.ok(variant, "InfoPlist.strings variant group");
  const buildFile = pbx.match(new RegExp(`(\\w{24}) /\\* InfoPlist.strings in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${variant[1]} `));
  assert.ok(buildFile, "InfoPlist.strings build file");
  assert.match(phaseFiles(pbx, "Resources"), new RegExp(`${buildFile[1]} /\\* InfoPlist.strings in Resources \\*/`));
});

test("the app privacy manifest ships in the bundle: no tracking, file timestamp API with reason C617.1", () => {
  const manifest = read("ios/App/App/PrivacyInfo.xcprivacy");
  assert.match(manifest, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
  assert.match(manifest, /<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
  assert.match(
    manifest,
    /<string>NSPrivacyAccessedAPICategoryFileTimestamp<\/string>\s*<key>NSPrivacyAccessedAPITypeReasons<\/key>\s*<array>\s*<string>C617\.1<\/string>/,
  );
  const pbx = pbxproj();
  const ref = pbx.match(/(\w{24}) \/\* PrivacyInfo.xcprivacy \*\/ = \{isa = PBXFileReference;[^}]*path = PrivacyInfo.xcprivacy;/);
  assert.ok(ref, "PrivacyInfo.xcprivacy file reference");
  const buildFile = pbx.match(new RegExp(`(\\w{24}) /\\* PrivacyInfo.xcprivacy in Resources \\*/ = \\{isa = PBXBuildFile; fileRef = ${ref[1]} `));
  assert.ok(buildFile, "PrivacyInfo.xcprivacy build file");
  assert.match(phaseFiles(pbx, "Resources"), new RegExp(`${buildFile[1]} /\\* PrivacyInfo.xcprivacy in Resources \\*/`));
});

test("iOS stays in light appearance like the site (dark mode would put light status-bar icons on white)", () => {
  const plist = read("ios/App/App/Info.plist");
  assert.match(plist, /<key>UIUserInterfaceStyle<\/key>\s*<string>Light<\/string>/);
  assert.doesNotMatch(plist, /<string>armv7<\/string>/);
});
