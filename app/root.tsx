import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  isRouteErrorResponse,
  useRouteError,
} from "react-router";
import type { ReactNode } from "react";
import { ClientCrashReportEffect } from "./utils/client-crash-report";

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function DefaultErrorLayout({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title}</title>
        <Meta />
        <Links />
      </head>
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          background: "#f6f6f7",
          color: "#202223",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {children}
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            margin: 24,
            padding: 24,
            background: "#fff",
            border: "1px solid #e1e3e5",
            borderRadius: 12,
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 20 }}>{title}</h1>
          <p style={{ margin: 0, fontSize: 14, color: "#6d7175", whiteSpace: "pre-wrap" }}>
            {message}
          </p>
        </div>
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  if (isRouteErrorResponse(error)) {
    const status = error.status;
    const statusText = error.statusText || "Unexpected error";
    const dataMessage =
      typeof error.data === "object" &&
      error.data &&
      "message" in error.data &&
      typeof error.data.message === "string"
        ? error.data.message
        : null;

    return (
      <DefaultErrorLayout
        title={`${status} – ${statusText}`}
        message={dataMessage || "Something went wrong while loading this page."}
      />
    );
  }

  if (error instanceof Error) {
    if (typeof document !== "undefined" && process.env.NODE_ENV === "development") {
      console.error("Unhandled application error:", error);
    }

    return (
      <DefaultErrorLayout
        title="Application error"
        message={
          process.env.NODE_ENV === "development"
            ? `${error.message}\n\n${error.stack ?? ""}`
            : "We're sorry, something went wrong. Please try again or contact support if the problem persists."
        }
      >
        <ClientCrashReportEffect error={error} />
      </DefaultErrorLayout>
    );
  }

  return (
    <DefaultErrorLayout
      title="Unknown error"
      message="An unknown error occurred. Please try again."
    />
  );
}
