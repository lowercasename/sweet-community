import UIKit
import Capacitor
import WebKit

/// The community the app shows, as its address, or nil for the app's own page with the list of communities. At start
/// it is the community opened last, which the app's own page stores with the Preferences plugin. That plugin keeps
/// sweet.lastCommunity in UserDefaults under its CapacitorStorage prefix.
enum SweetState {
    static var open: String? = UserDefaults.standard.string(forKey: "CapacitorStorage.sweet.lastCommunity")
}

/// The app's view controller. When a community is open, the web view starts at the community's address and treats
/// that site as its own, so links to other sites open in Safari. When the community cannot be loaded, the app's own
/// page is shown in its place and says so. With no community open, the web view shows the app's own page.
class SweetViewController: CAPBridgeViewController {
    override open func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        if let url = SweetState.open {
            descriptor.serverURL = url
            descriptor.errorPath = "index.html"
        }
        return descriptor
    }

    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(SweetAppPlugin())
    }
}

/// The SweetApp plugin, which web/src/storeapp/native.ts calls. Switching restarts the view controller, so the web
/// view only ever treats one community as its own.
@objc(SweetAppPlugin)
public class SweetAppPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SweetAppPlugin"
    public let jsName = "SweetApp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showList", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unreachable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forget", returnType: CAPPluginReturnPromise)
    ]

    /// Opens a community. Only an https address, or http on this computer for development, is accepted.
    @objc func open(_ call: CAPPluginCall) {
        let local: Set<String> = ["localhost", "127.0.0.1"]
        guard let address = call.getString("url"), let url = URL(string: address),
              url.scheme == "https" || (url.scheme == "http" && local.contains(url.host ?? "")) else {
            call.reject("The address must start with https://")
            return
        }
        call.resolve()
        restart(showing: address)
    }

    @objc func showList(_ call: CAPPluginCall) {
        call.resolve()
        restart(showing: nil)
    }

    /// The community that could not be loaded. The app's own page only appears while a community is open when that
    /// community failed to load, so the open community is the one that failed.
    @objc func unreachable(_ call: CAPPluginCall) {
        call.resolve(["url": SweetState.open ?? NSNull()])
    }

    /// Signs this device out of a community by deleting the web view's cookies for its host. Sweet's cookies belong to
    /// the host alone, so cookies of other sites and other communities are kept.
    @objc func forget(_ call: CAPPluginCall) {
        guard let address = call.getString("url"), let host = URL(string: address)?.host else {
            call.reject("No address")
            return
        }
        DispatchQueue.main.async {
            let store = WKWebsiteDataStore.default().httpCookieStore
            store.getAllCookies { cookies in
                let mine = cookies.filter { $0.domain == host || $0.domain == "." + host }
                let group = DispatchGroup()
                for cookie in mine {
                    group.enter()
                    store.delete(cookie) { group.leave() }
                }
                group.notify(queue: .main) { call.resolve() }
            }
        }
    }

    private func restart(showing address: String?) {
        DispatchQueue.main.async {
            SweetState.open = address
            self.bridge?.viewController?.view.window?.rootViewController = SweetViewController()
        }
    }
}
