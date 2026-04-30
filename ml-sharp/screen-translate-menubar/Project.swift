import ProjectDescription

let project = Project(
    name: "ScreenTranslate",
    settings: .settings(
        base: [
            "SWIFT_VERSION": "6.0",
            "MACOSX_DEPLOYMENT_TARGET": "15.0",
        ]
    ),
    targets: [
        .target(
            name: "ScreenTranslate",
            destinations: .macOS,
            product: .app,
            bundleId: "dev.codex.ScreenTranslate",
            deploymentTargets: .macOS("15.0"),
            infoPlist: .extendingDefault(with: [
                "CFBundleDisplayName": .string("Screen Translate"),
                "LSUIElement": .boolean(true),
                "NSScreenCaptureUsageDescription": .string("Screen Translate captures the screen to recognize and translate on-screen text into English."),
            ]),
            sources: ["Sources/**"],
            resources: []
        )
    ]
)
