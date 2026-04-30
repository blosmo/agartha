import CoreGraphics
import Foundation
import ScreenCaptureKit

enum ScreenshotCaptureError: LocalizedError {
    case permissionDenied
    case unableToReadDisplays
    case captureFailed

    var errorDescription: String? {
        switch self {
        case .permissionDenied:
            return "Screen recording access is required. Grant permission in System Settings > Privacy & Security > Screen Recording, then try again."
        case .unableToReadDisplays:
            return "The app could not discover the active displays."
        case .captureFailed:
            return "The app could not capture a full-screen image."
        }
    }
}

struct ScreenshotCaptureClient {
    func captureFullScreen() async throws -> CGImage {
        guard CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() else {
            throw ScreenshotCaptureError.permissionDenied
        }

        if #available(macOS 15.2, *) {
            let rect = try await captureBounds()
            return try await withCheckedThrowingContinuation { continuation in
                SCScreenshotManager.captureImage(in: rect) { image, error in
                    if let error {
                        continuation.resume(throwing: error)
                        return
                    }

                    guard let image else {
                        continuation.resume(throwing: ScreenshotCaptureError.captureFailed)
                        return
                    }

                    continuation.resume(returning: image)
                }
            }
        }

        let content = try await SCShareableContent.current
        guard let display = content.displays.first else {
            throw ScreenshotCaptureError.unableToReadDisplays
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        filter.includeMenuBar = true

        let configuration = SCStreamConfiguration()
        let scale = CGFloat(filter.pointPixelScale)
        configuration.width = Int(display.frame.width * scale)
        configuration.height = Int(display.frame.height * scale)
        configuration.showsCursor = false

        return try await withCheckedThrowingContinuation { continuation in
            SCScreenshotManager.captureImage(contentFilter: filter, configuration: configuration) { image, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                guard let image else {
                    continuation.resume(throwing: ScreenshotCaptureError.captureFailed)
                    return
                }

                continuation.resume(returning: image)
            }
        }
    }

    @available(macOS 15.2, *)
    private func captureBounds() async throws -> CGRect {
        let content = try await SCShareableContent.current
        let displays = content.displays
        guard !displays.isEmpty else {
            throw ScreenshotCaptureError.unableToReadDisplays
        }

        return displays.reduce(CGRect.null) { partialResult, display in
            partialResult.union(display.frame)
        }
    }
}
