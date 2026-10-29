import UIKit
import Capacitor
// Firebase (anlık bildirim) Mac'te Xcode → Add Package Dependencies ile eklenir; paket yokken
// proje yine derlenir ama cihaz bildirime KAYDOLMAZ (aşağıda kayıt hatası gider).
#if canImport(FirebaseCore)
import FirebaseCore
#endif
#if canImport(FirebaseMessaging)
import FirebaseMessaging
#endif

@main
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        #if canImport(FirebaseCore)
        // GoogleService-Info.plist depoda yok (elle konur); dosya pakette değilken configure()
        // uygulamayı çökertir → yalnız dosya varsa.
        if FirebaseApp.app() == nil,
           Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
        }
        #endif
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // Anlık bildirim: APNs sonucu Capacitor eklentisine aktarılır. Firebase varken APNs belirteci
    // FCM'ye verilir ve eklentiye FCM belirteci (String) gider — sunucu YALNIZ FCM üzerinden gönderir.
    // Firebase yokken (paket eklenmemiş ya da GoogleService-Info.plist pakette değil) ham APNs
    // belirteci eklentiye VERİLMEZ: web onu cihaz olarak kaydeder, FCM hiç teslim edemez ve satır
    // silinmeden kalır. Bunun yerine kayıt hatası gider (web sessizce yok sayar, cihaz kaydolmaz).
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        #if canImport(FirebaseCore) && canImport(FirebaseMessaging)
        if FirebaseApp.app() != nil {
            Messaging.messaging().apnsToken = deviceToken
            Messaging.messaging().token { token, error in
                if let error = error {
                    NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
                } else if let token = token {
                    NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: token)
                }
            }
            return
        }
        #endif
        let error = NSError(domain: "com.rothern.app.push", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Firebase is not configured; the raw APNs token is not usable by the FCM-only backend"
        ])
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        config.delegateClass = SceneDelegate.self
        return config
    }
}

// MARK: - Uygulamanın yerel eklentileri (RothernPrint)
//
// Bu sınıflar AYRI bir .swift dosyasında DEĞİL: yeni bir dosya App hedefine ancak Xcode'da
// (project.pbxproj) eklenir ve kabuk Mac'siz düzenleniyor. Bu yüzden App hedefinde zaten derlenen
// bu dosyanın sonuna kondular. Mac'te istenirse ayrı dosyaya taşınabilir (App hedefine ekleyerek).
//
// `MainViewController` köprüyü kurar kurmaz (`capacitorDidLoad`) yerel eklentiyi kaydeder; kök
// denetleyici olarak hem `Main.storyboard` (customClass, module App) hem `SceneDelegate` bunu kullanır.
// Uygulamanın kendi eklentileri npm paketi olmadığı için `capacitor.config.json` `packageClassList`ine
// girmez; örnek olarak kaydedilmeleri gerekir.

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(PrintPlugin())
    }
}

/// Yerel yazdırma köprüsü: web `window.Capacitor.Plugins.RothernPrint.print({ html, name })` çağırır.
///
/// Kabukta `window.open` + `print()` çalışmaz (yeni pencere açılmaz). HTML belge sistemin yazdırma
/// penceresinde (`UIPrintInteractionController`) açılır; pencere "PDF olarak kaydet / Dosyalar'a kaydet"
/// seçeneğini de sunar. Çağrı pencere açıldığında çözülür. Eski uygulama sürümünde bu eklenti yoktur;
/// web onu tanır ve siteden yazdırmayı söyler.
class PrintPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "PrintPlugin"
    let jsName = "RothernPrint"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "print", returnType: CAPPluginReturnPromise)
    ]

    private static let defaultName = "Rothern"
    private static let maxNameLength = 120

    @objc func print(_ call: CAPPluginCall) {
        guard let html = call.getString("html"),
              !html.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            call.reject("RothernPrint.print: \"html\" is required")
            return
        }
        let jobName = PrintPlugin.safeJobName(call.getString("name"))

        DispatchQueue.main.async {
            guard UIPrintInteractionController.isPrintingAvailable else {
                call.reject("RothernPrint.print: printing is not available on this device")
                return
            }
            let printInfo = UIPrintInfo(dictionary: nil)
            printInfo.jobName = jobName
            printInfo.outputType = .general

            let controller = UIPrintInteractionController.shared
            controller.printInfo = printInfo
            controller.printFormatter = UIMarkupTextPrintFormatter(markupText: html)

            let presented = controller.present(animated: true) { printController, _, error in
                // Pencere kapandı (yazdırıldı, kaydedildi ya da vazgeçildi): belgeyi bellekte tutma.
                printController.printFormatter = nil
                if let error = error {
                    CAPLog.print("RothernPrint: print dialog finished with an error: \(error.localizedDescription)")
                }
            }
            if presented {
                call.resolve()
            } else {
                call.reject("RothernPrint.print: could not open the print dialog")
            }
        }
    }

    /// İş adı kaydedilen PDF'in önerilen dosya adı olur: yol / denetim karakteri taşımaz.
    static func safeJobName(_ raw: String?) -> String {
        guard let raw = raw else { return defaultName }
        let forbidden = CharacterSet(charactersIn: "\\/:*?\"<>|").union(.controlCharacters)
        let cleaned = raw.components(separatedBy: forbidden).joined(separator: " ")
            .components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }.joined(separator: " ")
        if cleaned.isEmpty { return defaultName }
        if cleaned.count > maxNameLength {
            return String(cleaned.prefix(maxNameLength)).trimmingCharacters(in: .whitespaces)
        }
        return cleaned
    }
}
