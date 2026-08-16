export type CapturedPhoto = {
  photo: string;
  photoType: string;
  previewSrc: string;
};

const CLOCK_IN_PHOTO_PREFIX = "stafftime:clockInPhoto:";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function photoPayload(value: string) {
  let trimmed = value.trim();
  while (trimmed.startsWith("data:image/") && trimmed.includes(";base64,data:image/")) {
    trimmed = trimmed.slice(trimmed.indexOf(";base64,") + 8);
  }
  const marker = ";base64,";
  const index = trimmed.indexOf(marker);
  return (index >= 0 ? trimmed.slice(index + marker.length) : trimmed).replace(/\s/g, "");
}

export function toPreviewSrc(photo: string, photoType: string) {
  const payload = photoPayload(photo);
  return `data:${photoType || "image/jpeg"};base64,${payload}`;
}

function normalizeCapture(photo: {
  base64: string;
  type: string;
}): CapturedPhoto {
  const photoType = photo.type || "image/jpeg";
  const raw = photoPayload(photo.base64);
  if (!raw) {
    throw new Error("Photo capture failed. Please try again.");
  }
  return {
    photo: raw,
    photoType,
    previewSrc: `data:${photoType};base64,${raw}`,
  };
}

async function takePhotoOnce(): Promise<CapturedPhoto> {
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
      quality: 0.8,
      maxWidth: 1280,
      maxHeight: 1280,
    });
    if (!photo?.base64) {
      throw new Error("Photo capture failed. Please try again.");
    }
    return normalizeCapture(photo);
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

export async function captureClockInSelfie(): Promise<CapturedPhoto> {
  return takePhotoOnce();
}

export async function captureClockOutSelfie(
  clockInFingerprint: string,
): Promise<CapturedPhoto> {
  if (!clockInFingerprint) {
    throw new Error(
      "Missing clock-in selfie reference. Clock in again before clocking out.",
    );
  }

  await delay(700);

  for (let attempt = 0; attempt < 10; attempt++) {
    const shot = await takePhotoOnce();
    if (photoPayload(shot.photo) !== clockInFingerprint) {
      return shot;
    }
    await delay(500 + attempt * 200);
  }

  throw new Error(
    "Clock-out needs a new selfie. The camera returned the same photo as clock-in.",
  );
}

export async function saveClockInPhoto(employeeId: string, photo: string) {
  await shopify.storage.set(`${CLOCK_IN_PHOTO_PREFIX}${employeeId}`, photoPayload(photo));
}

export async function loadClockInPhoto(employeeId: string) {
  const value = await shopify.storage.get(`${CLOCK_IN_PHOTO_PREFIX}${employeeId}`);
  return typeof value === "string" ? value : "";
}

export async function clearClockInPhoto(employeeId: string) {
  try {
    await shopify.storage.delete(`${CLOCK_IN_PHOTO_PREFIX}${employeeId}`);
  } catch {
    // ignore
  }
}
