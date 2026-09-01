/**
 * Turn thrown values into a readable name/message/stack for crash emails.
 * React Router ErrorResponses and GraphQL/App Bridge objects often stringify as
 * "[object Object]" if passed through String() or `new Error(object)`.
 */

export type SerializedUnknownError = {
  name: string;
  message: string;
  stack?: string;
};

export function isRouteErrorLike(
  error: unknown,
): error is { status: number; statusText?: string; data?: unknown } {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof (error as { status: unknown }).status === "number"
  );
}

export function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return String(value);
  }
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, val: unknown) => {
      if (typeof val === "bigint") return val.toString();
      if (typeof val === "object" && val !== null) {
        if (seen.has(val)) return "[Circular]";
        seen.add(val);
        if (val instanceof Error) {
          return { name: val.name, message: val.message, stack: val.stack };
        }
      }
      return val;
    });
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function errorOwnProperties(error: Error): Record<string, unknown> {
  const extras: Record<string, unknown> = {};
  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === "name" || key === "message" || key === "stack") continue;
    extras[key] = (error as unknown as Record<string, unknown>)[key];
  }
  if (error.cause !== undefined && extras.cause === undefined) {
    extras.cause = error.cause;
  }
  return extras;
}

export function serializeUnknownError(error: unknown): SerializedUnknownError {
  if (error instanceof Error) {
    const extras = errorOwnProperties(error);
    const extrasText = Object.keys(extras).length > 0 ? stringifyUnknown(extras) : "";
    const messageLooksBlank =
      !error.message || error.message === "[object Object]";
    const message = messageLooksBlank
      ? extrasText && extrasText !== "{}"
        ? extrasText
        : stringifyUnknown(error)
      : extrasText && extrasText !== "{}"
        ? `${error.message}\n${extrasText}`
        : error.message;
    return {
      name: error.name || "Error",
      message,
      stack: error.stack,
    };
  }

  if (isRouteErrorLike(error)) {
    const statusText = error.statusText ? ` ${error.statusText}` : "";
    const data = error.data === undefined ? "" : `: ${stringifyUnknown(error.data)}`;
    return {
      name: "RouteError",
      message: `HTTP ${error.status}${statusText}${data}`.trim(),
    };
  }

  if (typeof Response !== "undefined" && error instanceof Response) {
    return {
      name: "Response",
      message: `HTTP ${error.status} ${error.statusText}`.trim(),
    };
  }

  if (typeof error === "string") {
    return { name: "Error", message: error };
  }

  return {
    name: "Error",
    message: stringifyUnknown(error),
  };
}
