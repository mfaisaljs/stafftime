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
