export const CAPTURE_IMAGE_LIMITS = {
  optimizeAboveBytes: 4 * 1024 * 1024,
  maxDimension: 2048,
  maxOriginalBytes: 40 * 1024 * 1024,
  jpegQuality: 0.82,
} as const;

export class CaptureImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CaptureImageError";
  }
}

export function validateCaptureFile(file: File): void {
  if (file.type && !file.type.startsWith("image/")) {
    throw new CaptureImageError("Choose an image from your camera or photo library.");
  }
  if (file.size > CAPTURE_IMAGE_LIMITS.maxOriginalBytes) {
    throw new CaptureImageError("This photo is too large to save safely. Choose a photo smaller than 40 MB.");
  }
}

export function captureFileExtension(type: string): string {
  switch (type.toLowerCase()) {
    case "image/png": return "png";
    case "image/webp": return "webp";
    case "image/heic": return "heic";
    case "image/heif": return "heif";
    default: return "jpg";
  }
}

export interface OptimizedCapture {
  blob: Blob;
  optimized: boolean;
  originalBytes: number;
}

/**
 * Prepares a durable photo for upload. Call this only after the original Blob
 * has been committed to IndexedDB. A failed/unsupported resize returns that
 * original Blob so preparation never turns a safe capture into a lost one.
 */
export async function optimizeCaptureBlob(original: Blob): Promise<OptimizedCapture> {
  if (!Number.isFinite(original.size) || original.size <= CAPTURE_IMAGE_LIMITS.optimizeAboveBytes) {
    return { blob: original, optimized: false, originalBytes: original.size };
  }

  try {
    const decoded = await decodeImage(original);
    try {
      const scale = Math.min(1, CAPTURE_IMAGE_LIMITS.maxDimension / Math.max(decoded.width, decoded.height));
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return { blob: original, optimized: false, originalBytes: original.size };
      context.drawImage(decoded.source, 0, 0, width, height);
      const replacement = await canvasToBlob(canvas);
      if (!replacement || replacement.size >= original.size) {
        return { blob: original, optimized: false, originalBytes: original.size };
      }
      return { blob: replacement, optimized: true, originalBytes: original.size };
    } finally {
      decoded.close?.();
    }
  } catch {
    return { blob: original, optimized: false, originalBytes: original.size };
  }
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  close?: () => void;
}

async function decodeImage(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ source: image, width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This browser could not resize the photo"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", CAPTURE_IMAGE_LIMITS.jpegQuality);
  });
}
