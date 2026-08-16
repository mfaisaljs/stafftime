import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import {
  decodeClockPhoto,
  verifyClockPhotoAccess,
} from "../services/clock-photo.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const timeEntryId = params.timeEntryId?.trim();
  if (!timeEntryId) {
    throw new Response("Photo not found", { status: 404 });
  }

  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") || "";
  const expiresAt = Number(url.searchParams.get("exp") || "");
  const sig = url.searchParams.get("sig") || "";

  const entry = await prisma.timeEntry.findUnique({
    where: { id: timeEntryId },
    select: {
      id: true,
      employeeId: true,
      photoUrl: true,
      clockOutPhotoUrl: true,
      shop: { select: { domain: true } },
    },
  });
  if (!entry) {
    throw new Response("Photo not found", { status: 404 });
  }

  const allowed = verifyClockPhotoAccess({
    shopDomain: entry.shop.domain,
    employeeId: entry.employeeId,
    timeEntryId: entry.id,
    kind,
    expiresAt,
    sig,
  });
  if (!allowed) {
    throw new Response("Photo not found", { status: 404 });
  }

  const stored = allowed.kind === "out" ? entry.clockOutPhotoUrl : entry.photoUrl;
  const decoded = decodeClockPhoto(stored);
  if (!decoded) {
    throw new Response("Photo not found", { status: 404 });
  }

  return new Response(new Uint8Array(decoded.body), {
    headers: {
      "Content-Type": decoded.mime,
      "Cache-Control": "private, max-age=300",
    },
  });
};
