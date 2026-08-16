/** Capture a selfie for clock in/out when Settings.requirePhoto is enabled. */
export async function captureClockSelfie(): Promise<{
  photo: string;
  photoType: string;
}> {
  const camera = (
    shopify as {
      camera?: {
        takePhoto?: (options?: {
          facingMode?: "user" | "environment";
          quality?: number;
          maxWidth?: number;
          maxHeight?: number;
        }) => Promise<{
          base64: string;
          type: string;
          width: number;
          height: number;
          fileSize: number;
        }>;
      };
    }
  ).camera;

  if (!camera || typeof camera.takePhoto !== "function") {
    throw new Error("Camera is unavailable on this POS device.");
  }

  try {
    const photo = await camera.takePhoto({
      facingMode: "user",
      quality: 0.55,
      maxWidth: 720,
      maxHeight: 720,
    });
    if (!photo?.base64) {
      throw new Error("Photo capture failed. Please try again.");
    }
    return {
      photo: `data:${photo.type || "image/jpeg"};base64,${photo.base64}`,
      photoType: photo.type || "image/jpeg",
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim()
        ? error.message
        : "Photo capture failed";
    if (/cancel/i.test(message)) {
      throw new Error("Selfie is required to continue.");
    }
    throw new Error(message);
  }
}
