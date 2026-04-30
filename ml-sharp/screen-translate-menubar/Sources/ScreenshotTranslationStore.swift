import AppKit
import Combine
import Foundation
import NaturalLanguage
@preconcurrency import Translation

struct TranslatedLine: Identifiable, Hashable {
    let id: UUID
    let sourceText: String
    let englishText: String
}

@MainActor
final class ScreenshotTranslationStore: ObservableObject {
    @Published var screenshotPreview: NSImage?
    @Published var recognizedLines: [RecognizedLine] = []
    @Published var translatedLines: [TranslatedLine] = []
    @Published var statusMessage = "Capture the screen to translate visible text into English."
    @Published var errorMessage: String?
    @Published var isBusy = false
    @Published var translationConfiguration: TranslationSession.Configuration?

    private let screenshotClient: ScreenshotCaptureClient
    private let textRecognitionClient: TextRecognitionClient
    private let englishLanguage = Locale.Language(identifier: "en")
    private var pendingSourceLines: [RecognizedLine] = []
    private var pendingJobID = UUID()
    private var runningJobID: UUID?

    init(
        screenshotClient: ScreenshotCaptureClient = ScreenshotCaptureClient(),
        textRecognitionClient: TextRecognitionClient = TextRecognitionClient()
    ) {
        self.screenshotClient = screenshotClient
        self.textRecognitionClient = textRecognitionClient
    }

    var canCopyEnglishText: Bool {
        !englishText.isEmpty
    }

    var englishText: String {
        translatedLines
            .map(\.englishText)
            .joined(separator: "\n")
    }

    func captureAndTranslate() {
        guard !isBusy else {
            return
        }

        Task { @MainActor in
            await runCapturePipeline()
        }
    }

    func performPendingTranslation(using session: TranslationSession) async {
        guard !pendingSourceLines.isEmpty else {
            return
        }

        let currentJobID = pendingJobID
        guard runningJobID != currentJobID else {
            return
        }

        let sourceLines = pendingSourceLines

        runningJobID = currentJobID
        statusMessage = "Translating recognized text to English..."

        do {
            try await session.prepareTranslation()
            var translated: [TranslatedLine] = []
            translated.reserveCapacity(sourceLines.count)

            for line in sourceLines {
                let englishText = try await translateLine(line.text, using: session)
                translated.append(
                    TranslatedLine(
                        id: line.id,
                        sourceText: line.text,
                        englishText: englishText
                    )
                )
            }

            guard currentJobID == pendingJobID else {
                return
            }

            translatedLines = translated
            pendingSourceLines = []
            translationConfiguration = nil
            runningJobID = nil
            isBusy = false
            statusMessage = translatedLines.isEmpty
                ? "No translatable text was found in the screenshot."
                : "Translated \(translatedLines.count) text lines."
        } catch {
            translatedLines = sourceLines.map { line in
                TranslatedLine(
                    id: line.id,
                    sourceText: line.text,
                    englishText: line.text
                )
            }
            pendingSourceLines = []
            translationConfiguration = nil
            runningJobID = nil
            isBusy = false
            errorMessage = nil
            statusMessage = translationFallbackMessage(for: error, lineCount: sourceLines.count)
        }
    }

    func copyEnglishText() {
        guard canCopyEnglishText else {
            return
        }

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(englishText, forType: .string)
        statusMessage = "Copied English text to the clipboard."
    }

    private func runCapturePipeline() async {
        isBusy = true
        errorMessage = nil
        screenshotPreview = nil
        recognizedLines = []
        translatedLines = []
        pendingSourceLines = []
        translationConfiguration = nil
        runningJobID = nil
        statusMessage = "Capturing the full screen..."

        do {
            let image = try await screenshotClient.captureFullScreen()
            screenshotPreview = NSImage(
                cgImage: image,
                size: NSSize(width: image.width, height: image.height)
            )

            statusMessage = "Recognizing text in the screenshot..."
            let lines = try await textRecognitionClient.recognizeText(in: image)
            recognizedLines = lines

            guard !lines.isEmpty else {
                isBusy = false
                statusMessage = "No text was found in the screenshot."
                return
            }

            pendingJobID = UUID()
            pendingSourceLines = lines
            translationConfiguration = TranslationSession.Configuration(
                source: nil,
                target: englishLanguage
            )
            statusMessage = "Preparing English translation..."
        } catch {
            isBusy = false
            errorMessage = error.localizedDescription
            statusMessage = "Capture failed."
        }
    }

    private func translateLine(_ text: String, using session: TranslationSession) async throws -> String {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return text
        }

        let recognizer = NLLanguageRecognizer()
        recognizer.processString(trimmed)

        if recognizer.dominantLanguage == .english {
            return trimmed
        }

        do {
            let response = try await session.translate(trimmed)
            let translated = response.targetText.trimmingCharacters(in: .whitespacesAndNewlines)
            return translated.isEmpty ? trimmed : translated
        } catch {
            return trimmed
        }
    }

    private func translationFallbackMessage(for error: Error, lineCount: Int) -> String {
        let message = error.localizedDescription.lowercased()

        if message.contains("unable to translate") || message.contains("unsupported") {
            return "Apple's on-device translation was unavailable, so the app kept the OCR text for \(lineCount) lines. Open the Translate app once to download the needed language packs, then try again."
        }

        return "Translation was unavailable, so the app kept the OCR text for \(lineCount) lines."
    }
}
