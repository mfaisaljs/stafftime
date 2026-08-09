export function shopFromDest(dest: string): string {
  if (!dest.includes("://")) {
    return dest.replace(/\/$/, "");
  }
  try {
    return new URL(dest).hostname;
  } catch {
    return dest.replace(/^https?:\/\//, "").split("/")[0] ?? dest;
  }
}

export function jsonResponse(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

export function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}
