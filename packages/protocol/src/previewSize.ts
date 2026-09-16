/** Default room/grid PNG size is 2× the historical 960×640 target. */
export const PREVIEW_DEFAULT_WIDTH = 1920;
export const PREVIEW_DEFAULT_HEIGHT = 1280;
export const PREVIEW_MIN_SIZE = 64;
export const PREVIEW_MAX_WIDTH = 2880;
export const PREVIEW_MAX_HEIGHT = 1920;

export type PreviewSize = { width: number; height: number };

export function previewSizeHeader(size: PreviewSize): string {
  return `${size.width}x${size.height}`;
}

export function parsePreviewSize(width: unknown, height: unknown): PreviewSize {
  const parsedWidth = parseOptionalDimension(width, 'width');
  const parsedHeight = parseOptionalDimension(height, 'height');
  if (parsedWidth === undefined && parsedHeight === undefined) {
    return { width: PREVIEW_DEFAULT_WIDTH, height: PREVIEW_DEFAULT_HEIGHT };
  }
  const resolvedWidth = parsedWidth ?? Math.round(parsedHeight! * PREVIEW_DEFAULT_WIDTH / PREVIEW_DEFAULT_HEIGHT);
  const resolvedHeight = parsedHeight ?? Math.round(parsedWidth! * PREVIEW_DEFAULT_HEIGHT / PREVIEW_DEFAULT_WIDTH);
  if (
    resolvedWidth < PREVIEW_MIN_SIZE
    || resolvedHeight < PREVIEW_MIN_SIZE
    || resolvedWidth > PREVIEW_MAX_WIDTH
    || resolvedHeight > PREVIEW_MAX_HEIGHT
  ) {
    throw new Error(`Preview size must be ${PREVIEW_MIN_SIZE}–${PREVIEW_MAX_WIDTH} × ${PREVIEW_MIN_SIZE}–${PREVIEW_MAX_HEIGHT}.`);
  }
  return { width: resolvedWidth, height: resolvedHeight };
}

function parseOptionalDimension(value: unknown, name: 'width' | 'height'): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  if (!Number.isInteger(parsed)) throw new Error(`Preview ${name} must be an integer.`);
  return parsed;
}
