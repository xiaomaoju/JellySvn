// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "JellySvnFinder",
    platforms: [.macOS(.v12)],
    targets: [
        .target(
            name: "JellySvnFinder",
            path: "JellySvnFinder"
        )
    ]
)
