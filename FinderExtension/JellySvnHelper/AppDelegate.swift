import Cocoa

@main
class AppDelegate: NSObject, NSApplicationDelegate {

    var statusItem: NSStatusItem?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Create a minimal menu bar app (no dock icon)
        NSApp.setActivationPolicy(.accessory)

        // Status bar item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = statusItem?.button {
            button.image = NSImage(systemSymbolName: "tortoise.fill", accessibilityDescription: "JellySvn")
            button.action = #selector(statusBarClicked(_:))
        }

        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "JellySvn Finder Extension Active", action: nil, keyEquivalent: ""))
        menu.addItem(NSMenuItem.separator())

        let openItem = NSMenuItem(title: "Open JellySvn", action: #selector(openJellySvn(_:)), keyEquivalent: "o")
        menu.addItem(openItem)

        let quitItem = NSMenuItem(title: "Quit Helper", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quitItem)

        statusItem?.menu = menu
    }

    @objc func statusBarClicked(_ sender: AnyObject?) {
        // Menu will show automatically
    }

    @objc func openJellySvn(_ sender: AnyObject?) {
        let appPaths = [
            "/Applications/SVN GUI Tool.app",
            "/Applications/JellySvn.app"
        ]

        for appPath in appPaths {
            if FileManager.default.fileExists(atPath: appPath) {
                NSWorkspace.shared.open(URL(fileURLWithPath: appPath))
                return
            }
        }

        // Fallback: show alert
        let alert = NSAlert()
        alert.messageText = "JellySvn Not Found"
        alert.informativeText = "Please install JellySvn.app to /Applications"
        alert.runModal()
    }
}
