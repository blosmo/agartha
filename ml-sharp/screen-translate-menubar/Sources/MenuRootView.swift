import SwiftUI
import Translation

struct MenuRootView: View {
    @ObservedObject var store: ScreenshotTranslationStore

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            header
            controls
            statusCard

            if let errorMessage = store.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.red.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            }

            if let screenshotPreview = store.screenshotPreview {
                Image(nsImage: screenshotPreview)
                    .resizable()
                    .scaledToFit()
                    .frame(maxWidth: .infinity)
                    .frame(height: 150)
                    .clipShape(RoundedRectangle(cornerRadius: 14))
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(Color.primary.opacity(0.08), lineWidth: 1)
                    )
            }

            results
        }
        .padding(16)
        .frame(width: 430, height: 640)
        .background(
            LinearGradient(
                colors: [
                    Color(nsColor: .windowBackgroundColor),
                    Color(red: 0.92, green: 0.96, blue: 1.0),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .translationTask(store.translationConfiguration) { session in
            await store.performPendingTranslation(using: session)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Screen Translate")
                .font(.system(size: 22, weight: .semibold, design: .rounded))

            Text("Take a full-screen snapshot, extract visible text, and translate it into English.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var controls: some View {
        HStack(spacing: 10) {
            Button(action: store.captureAndTranslate) {
                Label(
                    store.isBusy ? "Working..." : "Capture Full Screen",
                    systemImage: store.isBusy ? "hourglass" : "camera.viewfinder"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(store.isBusy)

            Button(action: store.copyEnglishText) {
                Label("Copy English", systemImage: "doc.on.doc")
            }
            .buttonStyle(.bordered)
            .disabled(!store.canCopyEnglishText || store.isBusy)
        }
    }

    private var statusCard: some View {
        HStack(alignment: .center, spacing: 10) {
            Circle()
                .fill(store.isBusy ? Color.orange : Color.green)
                .frame(width: 10, height: 10)

            Text(store.statusMessage)
                .font(.callout)
                .foregroundStyle(.primary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private var results: some View {
        Group {
            if store.recognizedLines.isEmpty && store.translatedLines.isEmpty {
                ContentUnavailableView(
                    "No Capture Yet",
                    systemImage: "capturedtext.to.insert",
                    description: Text("Run a capture to see recognized lines and their English translations.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        if !store.translatedLines.isEmpty {
                            resultSection(
                                title: "English Translation",
                                badge: "\(store.translatedLines.count) lines"
                            ) {
                                ForEach(store.translatedLines) { line in
                                    translationRow(line)
                                }
                            }
                        }

                        if !store.recognizedLines.isEmpty {
                            resultSection(
                                title: "Recognized Source Text",
                                badge: "\(store.recognizedLines.count) lines"
                            ) {
                                ForEach(store.recognizedLines) { line in
                                    sourceRow(line)
                                }
                            }
                        }
                    }
                    .padding(.bottom, 4)
                }
            }
        }
    }

    private func resultSection<Content: View>(
        title: String,
        badge: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(title)
                    .font(.headline)

                Spacer()

                Text(badge)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.primary.opacity(0.07), in: Capsule())
            }

            VStack(alignment: .leading, spacing: 8) {
                content()
            }
        }
    }

    private func translationRow(_ line: TranslatedLine) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(line.englishText)
                .font(.body)
                .textSelection(.enabled)

            if line.sourceText != line.englishText {
                Text(line.sourceText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
    }

    private func sourceRow(_ line: RecognizedLine) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(line.text)
                .font(.body)
                .textSelection(.enabled)

            Text("Confidence \(Int((line.confidence * 100).rounded()))%")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.primary.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
    }
}
