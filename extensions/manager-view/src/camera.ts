/** Capture a selfie for clock in/out when Settings.requirePhoto is enabled. */

function photoPayload(value: string) {
  const marker = ";base64,";
  const index = value.indexOf(marker);
  return index >= 0 ? value.slice(index + marker.length) : value;
}

function samePhoto(left?: string, right?: string) {
  if (!left || !right) return false;
  return photoPayload(left) === photoPayload(right);
}

async function takePhotoOnce(): Promise<{ photo: string; photoType: string }> {
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

export async function captureClockSelfie(previousPhoto?: string): Promise<{
  photo: string;
  photoType: string;
}> {
  const first = await takePhotoOnce();
  if (!samePhoto(first.photo, previousPhoto)) return first;

  await new Promise((resolve) => setTimeout(resolve, 500));
  const second = await takePhotoOnce();
  if (samePhoto(second.photo, previousPhoto)) {
    throw new Error(
      "Clock-out needs a new selfie. The camera reused the clock-in photo.",
    );
  }
  return second;
}
