import CoreGraphics
import Foundation
@preconcurrency import Vision

struct RecognizedLine: Identifiable, Hashable {
    let id: UUID
    let text: String
    let confidence: Float
    let boundingBox: CGRect
}

struct TextRecognitionClient {
    func recognizeText(in image: CGImage) async throws -> [RecognizedLine] {
        try await withCheckedThrowingContinuation { continuation in
            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
                let lines = observations.compactMap { observation -> RecognizedLine? in
                    guard let candidate = observation.topCandidates(1).first else {
                        return nil
                    }

                    let text = candidate.string.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !text.isEmpty else {
                        return nil
                    }

                    return RecognizedLine(
                        id: UUID(),
                        text: text,
                        confidence: candidate.confidence,
                        boundingBox: observation.boundingBox
                    )
                }
                .sorted(by: Self.sortRecognizedLines)

                continuation.resume(returning: lines)
            }

            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.automaticallyDetectsLanguage = true

            DispatchQueue.global(qos: .userInitiated).async {
                do {
                    let handler = VNImageRequestHandler(cgImage: image, options: [:])
                    try handler.perform([request])
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
    }

    private static func sortRecognizedLines(lhs: RecognizedLine, rhs: RecognizedLine) -> Bool {
        let verticalDistance = abs(lhs.boundingBox.maxY - rhs.boundingBox.maxY)
        if verticalDistance > 0.025 {
            return lhs.boundingBox.maxY > rhs.boundingBox.maxY
        }
        return lhs.boundingBox.minX < rhs.boundingBox.minX
    }
}
