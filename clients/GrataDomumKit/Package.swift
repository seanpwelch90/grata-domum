// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "GrataDomumKit",
    platforms: [
        .iOS(.v18),
        .tvOS(.v18),
        .macOS(.v14),
    ],
    products: [
        .library(name: "GrataDomumKit", targets: ["GrataDomumKit"])
    ],
    targets: [
        .target(
            name: "GrataDomumKit",
            resources: [.process("Resources")],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
        .testTarget(
            name: "GrataDomumKitTests",
            dependencies: ["GrataDomumKit"],
            swiftSettings: [.swiftLanguageMode(.v5)]
        ),
    ]
)
