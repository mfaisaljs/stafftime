/** Max stored data-URL length (~300KB binary after base64 overhead). */
const MAX_PHOTO_CHARS = 450_000;

export function normalizeClockPhoto(
  photo?: string | null,
  mimeType?: string | null,
): string | undefined {
  if (photo == null) return undefined;
  const trimmed = String(photo).trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_PHOTO_CHARS) {
    throw new Error("Photo is too large. Please retake the selfie.");
  }

  if (trimmed.startsWith("data:image/")) {
    return trimmed;
  }

  const mime =
    typeof mimeType === "string" && mimeType.startsWith("image/")
      ? mimeType
      : "image/jpeg";
  return `data:${mime};base64,${trimmed}`;
}

export function requireClockPhoto(
  requirePhoto: boolean,
  photoUrl: string | undefined,
  actionLabel: "clock in" | "clock out",
) {
  if (!requirePhoto) return;
  if (!photoUrl) {
    throw new Error(`A selfie photo is required before ${actionLabel}.`);
  }
}

export function decodeClockPhotoDataUrl(
  value: string,
): { mime: string; bytes: Uint8Array } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const dataMatch = trimmed.match(
    /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i,
  );
  if (dataMatch) {
    try {
      return {
        mime: dataMatch[1],
        bytes: Uint8Array.from(Buffer.from(dataMatch[2], "base64")),
      };
    } catch {
      return null;
    }
  }

  try {
    return {
      mime: "image/jpeg",
      bytes: Uint8Array.from(Buffer.from(trimmed, "base64")),
    };
  } catch {
    return null;
  }
}

export function clockPhotoResponse(dataUrl: string) {
  const decoded = decodeClockPhotoDataUrl(dataUrl);
  if (!decoded) {
    throw new Response("Invalid photo", { status: 500 });
  }
  return new Response(decoded.bytes, {
    headers: {
      "Content-Type": decoded.mime,
      "Cache-Control": "private, max-age=86400",
    },
  });
}
