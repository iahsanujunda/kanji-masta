import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAPTURE_IMAGE_LIMITS,
  CaptureImageError,
  captureFileExtension,
  optimizeCaptureBlob,
  validateCaptureFile,
} from "@/lib/captureImage";

describe("captureImage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("rejects an original that is too large to persist safely", () => {
    const file = new File(["photo"], "huge.jpg", { type: "image/jpeg" });
    Object.defineProperty(file, "size", { value: CAPTURE_IMAGE_LIMITS.maxOriginalBytes + 1 });

    expect(() => validateCaptureFile(file)).toThrow(CaptureImageError);
    expect(() => validateCaptureFile(file)).toThrow("smaller than 40 MB");
  });

  it("preserves useful image extensions", () => {
    expect(captureFileExtension("image/png")).toBe("png");
    expect(captureFileExtension("image/heic")).toBe("heic");
    expect(captureFileExtension("image/jpeg")).toBe("jpg");
  });

  it("resizes a large durable image and closes the decoder", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage: vi.fn() } as never);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["smaller"], { type: "image/jpeg" }));
    });
    const original = new Blob(
      [new Uint8Array(CAPTURE_IMAGE_LIMITS.optimizeAboveBytes + 1)],
      { type: "image/jpeg" },
    );

    const result = await optimizeCaptureBlob(original);

    expect(result.optimized).toBe(true);
    expect(result.blob.size).toBeLessThan(original.size);
    expect(result.originalBytes).toBe(original.size);
    expect(close).toHaveBeenCalledOnce();
  });

  it("keeps the original when browser resizing is unavailable", async () => {
    vi.stubGlobal("createImageBitmap", vi.fn().mockRejectedValue(new Error("unsupported")));
    const original = new Blob(
      [new Uint8Array(CAPTURE_IMAGE_LIMITS.optimizeAboveBytes + 1)],
      { type: "image/heic" },
    );

    await expect(optimizeCaptureBlob(original)).resolves.toEqual({
      blob: original,
      optimized: false,
      originalBytes: original.size,
    });
  });
});
