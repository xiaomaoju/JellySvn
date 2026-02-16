import Cocoa
import FinderSync

class FinderSync: FIFinderSync {

    // Monitored directories - will be set from user defaults
    var monitoredDirectories: Set<URL> = []

    // Cache for SVN statuses
    var statusCache: [String: String] = [:]

    override init() {
        super.init()

        // Load monitored directories
        loadMonitoredDirectories()

        FIFinderSyncController.default().directoryURLs = monitoredDirectories

        // Set up badge images for SVN statuses
        setupBadgeImages()
    }

    func setupBadgeImages() {
        let badges: [(String, String, NSColor)] = [
            ("clean", "Clean", .systemGreen),
            ("modified", "Modified", .systemOrange),
            ("added", "Added", .systemBlue),
            ("conflict", "Conflict", .systemRed),
            ("untracked", "Untracked", .systemGray),
            ("deleted", "Deleted", .systemPink)
        ]

        for (identifier, label, color) in badges {
            let image = NSImage(size: NSSize(width: 16, height: 16))
            image.lockFocus()
            color.set()
            NSBezierPath(ovalIn: NSRect(x: 2, y: 2, width: 12, height: 12)).fill()
            image.unlockFocus()
            FIFinderSyncController.default().setBadgeImage(image, label: label, forBadgeIdentifier: identifier)
        }
    }

    // MARK: - Monitored Directories

    func loadMonitoredDirectories() {
        // Get the real home directory (not sandbox container)
        let realHome: String
        if let pw = getpwuid(getuid()) {
            realHome = String(cString: pw.pointee.pw_dir)
        } else {
            realHome = NSHomeDirectory()
        }

        // Read from config file
        let configPath = realHome + "/Library/Application Support/JellySvn/projects.json"

        if let data = try? Data(contentsOf: URL(fileURLWithPath: configPath)),
           let projects = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] {
            for project in projects {
                if let path = project["path"] as? String {
                    monitoredDirectories.insert(URL(fileURLWithPath: path))
                }
            }
        }

        // Fallback: monitor real home directory
        if monitoredDirectories.isEmpty {
            monitoredDirectories.insert(URL(fileURLWithPath: realHome))
        }

        NSLog("JellySvn: Monitoring directories: \(monitoredDirectories)")
    }

    // MARK: - Badge Identifiers

    override func requestBadgeIdentifier(for url: URL) {
        let filePath = url.path

        // Check .svn directory existence to identify working copies
        guard findWorkingCopyRoot(for: filePath) != nil else { return }

        // Read status from cache file maintained by the main app
        if let cached = readCachedStatus(for: filePath) {
            FIFinderSyncController.default().setBadgeIdentifier(cached, for: url)
            return
        }

        // Try to detect SVN status by checking .svn/wc.db or entries
        let status = detectSvnStatusLocally(for: url)
        if let badgeId = status {
            FIFinderSyncController.default().setBadgeIdentifier(badgeId, for: url)
        }
    }

    func findWorkingCopyRoot(for path: String) -> String? {
        var current = path
        while current != "/" {
            let svnDir = (current as NSString).appendingPathComponent(".svn")
            if FileManager.default.fileExists(atPath: svnDir) {
                return current
            }
            current = (current as NSString).deletingLastPathComponent
        }
        return nil
    }

    /// Read status from a cache file that the main JellySvn app maintains
    func readCachedStatus(for path: String) -> String? {
        let cacheDir = NSString("~/Library/Application Support/JellySvn/status-cache").expandingTildeInPath
        let cacheFile = (cacheDir as NSString).appendingPathComponent("status.json")

        guard let data = try? Data(contentsOf: URL(fileURLWithPath: cacheFile)),
              let cache = try? JSONSerialization.jsonObject(with: data) as? [String: String] else {
            return nil
        }

        return cache[path]
    }

    /// Detect SVN status locally by checking .svn metadata (no process spawn needed)
    func detectSvnStatusLocally(for url: URL) -> String? {
        let path = url.path

        // Check if it's inside an SVN working copy
        guard let wcRoot = findWorkingCopyRoot(for: path) else {
            return nil
        }

        // Check if the file is versioned by looking at .svn/wc.db
        let wcdb = (wcRoot as NSString).appendingPathComponent(".svn/wc.db")
        if FileManager.default.fileExists(atPath: wcdb) {
            // File is in a working copy - mark as clean by default
            // (actual status requires svn command which needs sandbox exception)
            return "clean"
        }

        return nil
    }

    // MARK: - Menu Icons

    /// Create a colored SF Symbol icon for menu items
    func menuIcon(_ symbolName: String, color: NSColor) -> NSImage? {
        guard let image = NSImage(systemSymbolName: symbolName, accessibilityDescription: nil) else { return nil }
        let config = NSImage.SymbolConfiguration(paletteColors: [color])
            .applying(NSImage.SymbolConfiguration(pointSize: 13, weight: .medium))
        let result = image.withSymbolConfiguration(config)
        result?.isTemplate = false
        return result
    }

    /// Custom JellySvn header icon — purple rounded rect with "S"
    func jellysvnHeaderIcon() -> NSImage {
        let size: CGFloat = 16
        let image = NSImage(size: NSSize(width: size, height: size))
        image.lockFocus()
        NSColor.systemPurple.setFill()
        NSBezierPath(roundedRect: NSRect(x: 1, y: 1, width: 14, height: 14), xRadius: 3, yRadius: 3).fill()
        let attrs: [NSAttributedString.Key: Any] = [
            .foregroundColor: NSColor.white,
            .font: NSFont.boldSystemFont(ofSize: 10)
        ]
        let str = NSAttributedString(string: "S", attributes: attrs)
        let strSize = str.size()
        str.draw(at: NSPoint(x: (size - strSize.width) / 2, y: (size - strSize.height) / 2))
        image.unlockFocus()
        image.isTemplate = false
        return image
    }

    // MARK: - Context Menu

    override func menu(for menuKind: FIMenuKind) -> NSMenu {
        let menu = NSMenu(title: "JellySvn")

        // Section header with JellySvn icon
        let headerItem = NSMenuItem(title: "JellySvn", action: nil, keyEquivalent: "")
        headerItem.isEnabled = false
        headerItem.image = jellysvnHeaderIcon()
        menu.addItem(headerItem)
        menu.addItem(NSMenuItem.separator())

        // SVN Status — blue magnifying glass
        let statusItem = NSMenuItem(title: "SVN Status", action: #selector(openWithAction(_:)), keyEquivalent: "")
        statusItem.image = menuIcon("magnifyingglass", color: .systemBlue)
        statusItem.tag = 1
        menu.addItem(statusItem)

        // SVN Update — green filled down arrow
        let updateItem = NSMenuItem(title: "SVN Update", action: #selector(runQuickAction(_:)), keyEquivalent: "")
        updateItem.image = menuIcon("arrow.down.circle.fill", color: .systemGreen)
        updateItem.tag = 2
        menu.addItem(updateItem)

        // SVN Commit — blue filled up arrow
        let commitItem = NSMenuItem(title: "SVN Commit...", action: #selector(openWithAction(_:)), keyEquivalent: "")
        commitItem.image = menuIcon("arrow.up.circle.fill", color: .systemBlue)
        commitItem.tag = 3
        menu.addItem(commitItem)

        // SVN Revert — orange filled undo arrow
        let revertItem = NSMenuItem(title: "SVN Revert", action: #selector(runQuickAction(_:)), keyEquivalent: "")
        revertItem.image = menuIcon("arrow.uturn.backward.circle.fill", color: .systemOrange)
        revertItem.tag = 4
        menu.addItem(revertItem)

        menu.addItem(NSMenuItem.separator())

        // SVN Cleanup — teal sparkles
        let cleanupItem = NSMenuItem(title: "SVN Cleanup", action: #selector(runQuickAction(_:)), keyEquivalent: "")
        cleanupItem.image = menuIcon("sparkles", color: .systemTeal)
        cleanupItem.tag = 5
        menu.addItem(cleanupItem)

        // SVN Log — indigo clock history
        let logItem = NSMenuItem(title: "SVN Log", action: #selector(openWithAction(_:)), keyEquivalent: "")
        logItem.image = menuIcon("clock.arrow.circlepath", color: .systemIndigo)
        logItem.tag = 6
        menu.addItem(logItem)

        menu.addItem(NSMenuItem.separator())

        // Open in JellySvn — purple window icon
        let openItem = NSMenuItem(title: "Open in JellySvn", action: #selector(openInJellySvn(_:)), keyEquivalent: "")
        openItem.image = menuIcon("macwindow", color: .systemPurple)
        menu.addItem(openItem)

        return menu
    }

    // MARK: - Helper Methods

    func getSelectedPaths() -> [String] {
        guard let target = FIFinderSyncController.default().targetedURL() else { return [] }
        let items = FIFinderSyncController.default().selectedItemURLs() ?? [target]
        return items.map { $0.path }
    }

    func findWorkingCopyForPaths(_ paths: [String]) -> String? {
        for path in paths {
            if let root = findWorkingCopyRoot(for: path) {
                return root
            }
        }
        return nil
    }

    // MARK: - Actions (Sandbox-compatible)

    /// Run SVN quick action via installed shell scripts in ~/Library/Services
    @objc func runQuickAction(_ sender: NSMenuItem) {
        let paths = getSelectedPaths()
        guard let firstPath = paths.first else { return }
        let targetPath = findWorkingCopyRoot(for: firstPath) ?? firstPath

        var scriptName: String

        switch sender.tag {
        case 2: scriptName = "jellysvn-update.sh"
        case 4: scriptName = "jellysvn-status.sh"  // Revert via status view
        case 5: scriptName = "jellysvn-cleanup.sh"
        default: scriptName = "jellysvn-status.sh"
        }

        // Execute via NSUserScriptTask (sandbox-compatible)
        let scriptDir = URL(fileURLWithPath: NSHomeDirectory())
            .appendingPathComponent("Library/Application Scripts/com.jellysvn.helper.finder-extension")

        let scriptURL = scriptDir.appendingPathComponent(scriptName)

        // If script exists in Application Scripts, use it
        if FileManager.default.fileExists(atPath: scriptURL.path) {
            if let task = try? NSUserUnixTask(url: scriptURL) {
                task.execute(withArguments: [targetPath]) { error in
                    if let error = error {
                        NSLog("JellySvn: Script error: \(error)")
                    }
                }
            }
        } else {
            // Fallback: Open JellySvn app with the path
            openJellySvnApp(with: targetPath)
        }
    }

    /// Open JellySvn app for interactive actions (status, commit, log)
    @objc func openWithAction(_ sender: NSMenuItem) {
        let paths = getSelectedPaths()
        guard let firstPath = paths.first else { return }
        let targetPath = findWorkingCopyRoot(for: firstPath) ?? firstPath

        openJellySvnApp(with: targetPath)
    }

    @objc func openInJellySvn(_ sender: AnyObject?) {
        let paths = getSelectedPaths()
        guard let firstPath = paths.first else { return }
        let targetPath = findWorkingCopyRoot(for: firstPath) ?? firstPath

        openJellySvnApp(with: targetPath)
    }

    func openJellySvnApp(with path: String) {
        // Use NSWorkspace to open the app (sandbox-compatible)
        let appPaths = [
            "/Applications/SVN GUI Tool.app",
            "/Applications/JellySvn.app"
        ]

        for appPath in appPaths {
            let appURL = URL(fileURLWithPath: appPath)
            if FileManager.default.fileExists(atPath: appPath) {
                let config = NSWorkspace.OpenConfiguration()
                config.arguments = [path]
                NSWorkspace.shared.openApplication(at: appURL, configuration: config)
                return
            }
        }

        // Fallback: try to open a development build relative to the extension bundle
        if let bundlePath = Bundle.main.bundlePath as NSString? {
            // Walk up from .appex to find the project's dist build
            let projectRoot = (bundlePath as NSString).deletingLastPathComponent
            let devPath = (projectRoot as NSString).appendingPathComponent("dist/mac-arm64/JellySvn.app")
            let devURL = URL(fileURLWithPath: devPath)
            if FileManager.default.fileExists(atPath: devPath) {
                let config = NSWorkspace.OpenConfiguration()
                config.arguments = [path]
                NSWorkspace.shared.openApplication(at: devURL, configuration: config)
                return
            }
        }

        // Last resort: open the path in Finder
        NSWorkspace.shared.selectFile(path, inFileViewerRootedAtPath: "")
    }
}
