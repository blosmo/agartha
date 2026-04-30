import SwiftUI

@main
struct ScreenTranslateApp: App {
    @StateObject private var store = ScreenshotTranslationStore()

    var body: some Scene {
        MenuBarExtra("Screen Translate", systemImage: store.isBusy ? "hourglass" : "globe") {
            MenuRootView(store: store)
        }
        .menuBarExtraStyle(.window)
    }
}
