import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

class TestImageData {
  readonly colorSpace = "srgb";
  readonly data: Uint8ClampedArray;
  readonly height: number;
  readonly width: number;

  constructor(data: Uint8ClampedArray, width: number, height?: number) {
    this.data = data;
    this.width = width;
    this.height = height ?? Math.floor(data.length / 4 / width);
  }
}

Object.defineProperty(globalThis, "ImageData", {
  configurable: true,
  value: TestImageData,
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: vi.fn(
    () =>
      ({
        imageSmoothingEnabled: false,
        putImageData: vi.fn(),
      }) as unknown as CanvasRenderingContext2D,
  ),
});
